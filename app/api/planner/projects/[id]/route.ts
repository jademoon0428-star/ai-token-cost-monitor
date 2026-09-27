import { NextResponse } from "next/server";

import {
  pickFields,
  plannerErrorResponse,
  plannerNotFoundResponse,
  plannerServerErrorResponse,
  readJsonObject,
  type PlannerFieldSpec,
} from "@/lib/planner-api-errors";
import { getProject } from "@/lib/repositories/planner-repository";
import {
  PlannerServiceError,
  PROJECT_PREFERENCES,
  updateProject,
} from "@/lib/services/planner-service";

export const runtime = "nodejs";

/*
 * The same writable fields as create, minus the server-owned ones.
 * status is absent on purpose: it moves through its own guarded
 * transition, and this phase does not expose that endpoint.
 */
const PATCH_FIELDS: readonly PlannerFieldSpec[] = [
  { key: "name", type: "string" },
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

/*
 * GET /api/planner/projects/[id]
 *
 * Returns the project row only. This is deliberately not an aggregate
 * view: plans, planned steps and AI options each have their own
 * endpoint, so one of them can change shape without breaking the
 * others.
 */
export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await params;

  try {
    const project = getProject(id);

    if (!project) {
      return plannerNotFoundResponse(
        "PROJECT_NOT_FOUND",
        `Project "${id}" does not exist.`
      );
    }

    return NextResponse.json({
      ok: true,
      project,
    });
  } catch (error) {
    if (error instanceof PlannerServiceError) {
      return plannerErrorResponse(
        error
      );
    }

    return plannerServerErrorResponse(
      error,
      "Failed to load project"
    );
  }
}

/*
 * PATCH /api/planner/projects/[id]
 *
 * Applies a partial update. Only the fields sent are changed; an
 * explicit null clears an optional value.
 */
export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await params;

  const body = await readJsonObject(
    request
  );

  if (!body.ok) {
    return body.response;
  }

  const picked = pickFields<
    Parameters<typeof updateProject>[1]
  >(
    body.value,
    PATCH_FIELDS
  );

  if (!picked.ok) {
    return picked.response;
  }

  try {
    return NextResponse.json({
      ok: true,
      project: updateProject(
        id,
        picked.value
      ),
    });
  } catch (error) {
    if (error instanceof PlannerServiceError) {
      return plannerErrorResponse(
        error
      );
    }

    return plannerServerErrorResponse(
      error,
      "Failed to update project"
    );
  }
}
