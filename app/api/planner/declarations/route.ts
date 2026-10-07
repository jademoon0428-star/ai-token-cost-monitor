import { NextResponse } from "next/server";

import {
  pickFields,
  plannerErrorResponse,
  plannerServerErrorResponse,
  readEnumQuery,
  readJsonObject,
  type PlannerFieldSpec,
} from "@/lib/planner-api-errors";
import {
  DECLARED_CHANNELS,
  DECLARED_ENTITLEMENTS,
  DECLARED_PRICING_STATES,
  DeclaredResourceServiceError,
  createDeclaredResource,
  listDeclaredResources,
} from "@/lib/services/declared-resource-service";

export const runtime = "nodejs";

/*
 * POST /api/planner/declarations
 *
 * Records one way the user reaches an AI model that this app cannot
 * see for itself: a web subscription, a gateway, an account somewhere
 * else. id, created_at, updated_at and status are server-owned and are
 * not in this list (status is always 'active' on create; moving one
 * out of the active view is the separate archive command).
 *
 * providerName and modelName are free text on purpose. They are the
 * user's own naming for something outside this registry, and the
 * service never turns them into a providers/models id: a declaration
 * is not a registry fact.
 *
 * channel, entitlement and pricingState are optional and default to
 * 'unknown'. All three are recorded claims, not verified facts, and
 * none of them stores a key, opens a connection or produces a price.
 * supportsTools / supportsVision / supportsReasoning take 1, 0 or
 * null, where null means "not stated" rather than "cannot".
 *
 * No cost field appears here and no score / rank / selected /
 * recommended field either: a declaration is a fact about reach, not
 * a price and not a judgement.
 */
const CREATE_FIELDS: readonly PlannerFieldSpec[] = [
  { key: "name", type: "string", required: true },
  { key: "providerName", type: "string" },
  { key: "modelName", type: "string" },
  {
    key: "channel",
    type: "enum",
    enumValues: DECLARED_CHANNELS,
  },
  {
    key: "entitlement",
    type: "enum",
    enumValues: DECLARED_ENTITLEMENTS,
  },
  {
    key: "pricingState",
    type: "enum",
    enumValues: DECLARED_PRICING_STATES,
  },
  { key: "supportsTools", type: "number" },
  { key: "supportsVision", type: "number" },
  { key: "supportsReasoning", type: "number" },
  { key: "contextWindowTokens", type: "number" },
  { key: "maxOutputTokens", type: "number" },
  { key: "notes", type: "string" },
];

export async function POST(request: Request) {
  const body = await readJsonObject(request);

  if (!body.ok) {
    return body.response;
  }

  const picked = pickFields<
    Parameters<typeof createDeclaredResource>[0]
  >(body.value, CREATE_FIELDS);

  if (!picked.ok) {
    return picked.response;
  }

  try {
    return NextResponse.json(
      {
        ok: true,
        declaration: createDeclaredResource(
          picked.value
        ),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof DeclaredResourceServiceError) {
      return plannerErrorResponse(error);
    }

    return plannerServerErrorResponse(
      error,
      "Failed to create declared resource"
    );
  }
}

/*
 * GET /api/planner/declarations?status=active|archived|all
 *
 * Lists declarations in neutral insertion order. That order is not a
 * ranking: nothing compares declarations against each other, and no
 * row is presented as better than another. When the query parameter is
 * absent the active view is returned; archived rows move out of it but
 * are never deleted and remain readable by id.
 */
export async function GET(request: Request) {
  const status = readEnumQuery(
    request,
    "status",
    ["active", "archived", "all"]
  );

  if (!status.ok) {
    return status.response;
  }

  try {
    return NextResponse.json({
      ok: true,
      items: listDeclaredResources({
        status: (status.value ?? "active") as
          | "active"
          | "archived"
          | "all",
      }),
    });
  } catch (error) {
    return plannerServerErrorResponse(
      error,
      "Failed to list declared resources"
    );
  }
}
