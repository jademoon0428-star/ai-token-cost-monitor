/*
 * Shared request/response plumbing for the Planner API.
 *
 * Every Planner route handler returns the same two shapes:
 *
 *   success  { ok: true, ... }
 *   failure  { error: string, code: string }
 *
 * This module exists so the ten Planner route files do not each
 * re-implement the same switch and the same body parsing. It
 * deliberately does NOT touch the existing non-Planner routes: they
 * keep their own inline handling.
 *
 * The Planner stays a planning layer here: nothing in this file
 * reaches usage_records, cost_records or task_sessions, and no
 * status code implies an execution, a recommendation or a ranking.
 */
import { NextResponse } from "next/server";

import { PlannerServiceError } from "@/lib/services/planner-service";

/*
 * A missing row is a 404. A reference to a model or tool that does
 * not exist is also a 404 rather than a 400: from the caller's point
 * of view the thing it named is simply not there.
 */
const NOT_FOUND_CODES: ReadonlySet<string> = new Set([
  "PROJECT_NOT_FOUND",
  "PLAN_NOT_FOUND",
  "PROJECT_TASK_NOT_FOUND",
  "AI_OPTION_NOT_FOUND",
  "AI_RESOURCE_NOT_FOUND",
  "TASK_NOT_FOUND",
  "MODEL_NOT_FOUND",
  "TOOL_NOT_FOUND",
]);

/*
 * A terminal project or planned step cannot be moved again. That is a
 * conflict with the current state of the resource, not a malformed
 * request, so it is a 409. It matches how app/api/tasks already
 * reports ACTIVE_SESSION_EXISTS.
 */
const CONFLICT_CODES: ReadonlySet<string> = new Set([
  "INVALID_STATUS_TRANSITION",
  "DUPLICATE_AI_RESOURCE",
]);

export function plannerErrorStatus(
  code: string
): number {
  if (NOT_FOUND_CODES.has(code)) {
    return 404;
  }

  if (CONFLICT_CODES.has(code)) {
    return 409;
  }

  /*
   * Everything else the service rejects is a bad request:
   * INVALID_*, NEGATIVE_VALUE, INCOMPLETE_COST, INVALID_JSON.
   */
  return 400;
}

/*
 * Turns a PlannerServiceError into the shared { error, code } body.
 */
export function plannerErrorResponse(
  error: PlannerServiceError
): NextResponse {
  return NextResponse.json(
    {
      error: error.message,
      code: error.code,
    },
    {
      status: plannerErrorStatus(
        error.code
      ),
    }
  );
}

/*
 * A rejected request that never reached the service: unparseable
 * JSON, a wrong query parameter, an unknown or wrongly typed field.
 * The code is stable so a UI can branch on it.
 */
export function plannerBadRequestResponse(
  code: string,
  message: string
): NextResponse {
  return NextResponse.json(
    { error: message, code },
    { status: 400 }
  );
}

/*
 * A row that a get returned as undefined. The repository getters
 * answer "not there" with undefined rather than throwing, so each
 * read route turns that into the same 404 body the service errors
 * would have produced.
 */
export function plannerNotFoundResponse(
  code: string,
  message: string
): NextResponse {
  return NextResponse.json(
    { error: message, code },
    { status: 404 }
  );
}

/*
 * Anything unexpected. The detail is logged locally and the caller
 * gets a generic message, matching the other routes in this app.
 */
export function plannerServerErrorResponse(
  error: unknown,
  context: string
): NextResponse {
  console.error(
    `[Planner API] ${context}:`,
    error
  );

  return NextResponse.json(
    {
      error: "Planner request failed.",
      code: "INTERNAL_ERROR",
    },
    { status: 500 }
  );
}

/* ---------------------------------------------------------------- */
/* Request body parsing                                             */
/* ---------------------------------------------------------------- */

type BodyResult =
  | {
      ok: true;
      value: Record<
        string,
        unknown
      >;
    }
  | {
      ok: false;
      response: NextResponse;
    };

/*
 * Reads a JSON object body. A missing or malformed body is a 400
 * rather than a thrown error, so every route can treat "no body" and
 * "garbage body" the same way.
 */
export async function readJsonObject(
  request: Request
): Promise<BodyResult> {
  let parsed: unknown;

  try {
    parsed = await request.json();
  } catch {
    return {
      ok: false,
      response: plannerBadRequestResponse(
        "INVALID_BODY",
        "Request body must be valid JSON."
      ),
    };
  }

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    return {
      ok: false,
      response: plannerBadRequestResponse(
        "INVALID_BODY",
        "Request body must be a JSON object."
      ),
    };
  }

  return {
    ok: true,
    value: parsed as Record<
      string,
      unknown
    >,
  };
}

/* ---------------------------------------------------------------- */
/* Field whitelist                                                  */
/* ---------------------------------------------------------------- */

/*
 * A field the API accepts. Anything not listed here is rejected with
 * a 400, which is how "the client cannot set id / status / version /
 * sequence / is_selected" is actually enforced rather than merely
 * documented.
 *
 * The type is checked here and only the shape is checked: whether a
 * number is in range, whether a string is non-empty, and whether a
 * JSON blob parses all remain the service's job.
 */
export type PlannerFieldSpec = {
  key: string;
  type: "string" | "number" | "enum";
  required?: boolean;
  enumValues?: readonly string[];
};

export type FieldResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      response: NextResponse;
    };

/*
 * Copies the accepted fields out of the body, dropping keys that were
 * not sent. An explicit null is preserved so a client can clear an
 * optional value; a missing key stays absent so the service applies
 * its own default.
 *
 * The result is typed as the service input the route is about to
 * call, so the whitelist and the service can never drift apart. The
 * cast below is the single place where the two meet: by this point
 * every key is known and every value has had its JSON type checked,
 * and the service still validates ranges, enums and referential
 * integrity itself.
 */
export function pickFields<T>(
  body: Record<string, unknown>,
  fields: readonly PlannerFieldSpec[]
): FieldResult<T> {
  const known = new Set(
    fields.map((field) => field.key)
  );

  for (const key of Object.keys(body)) {
    if (!known.has(key)) {
      return {
        ok: false,
        response: plannerBadRequestResponse(
          "UNKNOWN_FIELD",
          `Field "${key}" is not accepted by this endpoint.`
        ),
      };
    }
  }

  const value: Record<
    string,
    unknown
  > = {};

  for (const field of fields) {
    const raw = body[field.key];

    if (raw === undefined) {
      if (field.required) {
        return {
          ok: false,
          response: plannerBadRequestResponse(
            "MISSING_FIELD",
            `Field "${field.key}" is required.`
          ),
        };
      }

      continue;
    }

    if (raw === null) {
      if (field.required) {
        return {
          ok: false,
          response: plannerBadRequestResponse(
            "MISSING_FIELD",
            `Field "${field.key}" is required.`
          ),
        };
      }

      value[field.key] = null;

      continue;
    }

    if (field.type === "string") {
      if (typeof raw !== "string") {
        return {
          ok: false,
          response: plannerBadRequestResponse(
            "INVALID_FIELD_TYPE",
            `Field "${field.key}" must be a string.`
          ),
        };
      }

      value[field.key] = raw;

      continue;
    }

    if (field.type === "number") {
      if (
        typeof raw !== "number" ||
        !Number.isFinite(raw)
      ) {
        return {
          ok: false,
          response: plannerBadRequestResponse(
            "INVALID_FIELD_TYPE",
            `Field "${field.key}" must be a number.`
          ),
        };
      }

      value[field.key] = raw;

      continue;
    }

    /*
     * An enum value. The allowed set is fixed by the contract, so a
     * wrong value is reported here rather than being passed down.
     */
    if (typeof raw !== "string") {
      return {
        ok: false,
        response: plannerBadRequestResponse(
          "INVALID_FIELD_TYPE",
          `Field "${field.key}" must be a string.`
        ),
      };
    }

    if (
      !field.enumValues ||
      !field.enumValues.includes(raw)
    ) {
      return {
        ok: false,
        response: plannerBadRequestResponse(
          "INVALID_ENUM",
          `Field "${field.key}" must be one of: ${
            field.enumValues?.join(
              ", "
            ) ?? ""
          }.`
        ),
      };
    }

    value[field.key] = raw;
  }

  return {
    ok: true,
    value: value as T,
  };
}

/* ---------------------------------------------------------------- */
/* Query parameter validation                                        */
/* ---------------------------------------------------------------- */

/*
 * Validates an optional query value against a fixed set. An absent
 * parameter means "no filter" and yields undefined. An unrecognised
 * value is a 400 rather than a silently empty result, so a typo in
 * the UI is visible instead of looking like "no projects yet".
 */
export function readEnumQuery(
  request: Request,
  key: string,
  allowed: readonly string[]
): {
  ok: true;
  value?: string;
} | {
  ok: false;
  response: NextResponse;
} {
  const raw = new URL(
    request.url
  ).searchParams.get(key);

  if (raw === null) {
    return { ok: true };
  }

  if (!allowed.includes(raw)) {
    return {
      ok: false,
      response: plannerBadRequestResponse(
        "INVALID_QUERY",
        `Query parameter "${key}" must be one of: ${allowed.join(
          ", "
        )}.`
      ),
    };
  }

  return {
    ok: true,
    value: raw,
  };
}
