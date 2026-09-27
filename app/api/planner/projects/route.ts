import { NextResponse } from "next/server";

import {
  pickFields,
  plannerErrorResponse,
  plannerServerErrorResponse,
  readEnumQuery,
  readJsonObject,
  type PlannerFieldSpec,
} from "@/lib/planner-api-errors";
import { listProjects } from "@/lib/repositories/planner-repository";
import {
  createProject,
  PlannerServiceError,
  PROJECT_PREFERENCES,
  PROJECT_STATUSES,
} from "@/lib/services/planner-service";

export const runtime = "nodejs";

/*
 * POST /api/planner/projects
 *
 * Creates a planned project. The id, both timestamps and the status
 * are decided by the server; status always starts at "planning". A
 * request that tries to set any of them is rejected with a 400 by the
 * field whitelist, so there is exactly one way to do this.
 */
const CREATE_FIELDS: readonly PlannerFieldSpec[] = [
  { key: "name", type: "string", required: true },
  { key: "goal", type: "string" },
  { key: "description", type: "string" },
  {
    key: "preference",
    type: "enum",
    enumValues: PROJECT_PREFERENCES,
  },
  { key: "budgetMinMicros", type: "number" },
  { key: "budgetMaxMicros", type: "number" },
  { key: "budgetCurrency", type: "string" },
  { key: "deadlineDays", type: "number" },
];

export async function POST(
  request: Request
) {
  const body = await readJsonObject(
    request
  );

  if (!body.ok) {
    return body.response;
  }

  const picked = pickFields<
    Parameters<typeof createProject>[0]
  >(
    body.value,
    CREATE_FIELDS
  );

  if (!picked.ok) {
    return picked.response;
  }

  try {
    const project = createProject(
      picked.value
    );

    return NextResponse.json(
      { ok: true, project },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof PlannerServiceError) {
      return plannerErrorResponse(
        error
      );
    }

    return plannerServerErrorResponse(
      error,
      "Failed to create project"
    );
  }
}

/*
 * GET /api/planner/projects
 *
 * Lists projects newest first. ?status= filters; an unrecognised
 * value is a 400 rather than a silently empty list.
 */
export async function GET(
  request: Request
) {
  const status = readEnumQuery(
    request,
    "status",
    PROJECT_STATUSES
  );

  if (!status.ok) {
    return status.response;
  }

  try {
    return NextResponse.json({
      ok: true,
      items: listProjects(
        status.value === undefined
          ? {}
          : { status: status.value }
      ),
    });
  } catch (error) {
    return plannerServerErrorResponse(
      error,
      "Failed to list projects"
    );
  }
}
