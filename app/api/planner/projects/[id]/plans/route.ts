import { NextResponse } from "next/server";

import {
  pickFields,
  plannerErrorResponse,
  plannerNotFoundResponse,
  plannerServerErrorResponse,
  readJsonObject,
  type PlannerFieldSpec,
} from "@/lib/planner-api-errors";
import {
  getProject,
  listProjectPlans,
} from "@/lib/repositories/planner-repository";
import {
  createProjectPlan,
  PlannerServiceError,
  PROJECT_PREFERENCES,
} from "@/lib/services/planner-service";

export const runtime = "nodejs";

/*
 * POST /api/planner/projects/[id]/plans
 *
 * Adds the next plan version to a project.
 *
 * There is no version in the body and there never will be. The
 * service assigns one more than the highest version the project
 * already has, which is what keeps UNIQUE(project_id, version)
 * satisfied. Plans are immutable, so this is the only way to add
 * one: a new plan is a new version, never an edit of an old one.
 */
const CREATE_FIELDS: readonly PlannerFieldSpec[] = [
  {
    key: "strategy",
    type: "enum",
    required: true,
    enumValues: PROJECT_PREFERENCES,
  },
  { key: "summary", type: "string" },
];

export async function POST(
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
    Omit<
      Parameters<typeof createProjectPlan>[0],
      "projectId"
    >
  >(
    body.value,
    CREATE_FIELDS
  );

  if (!picked.ok) {
    return picked.response;
  }

  try {
    if (!getProject(id)) {
      return plannerNotFoundResponse(
        "PROJECT_NOT_FOUND",
        `Project "${id}" does not exist.`
      );
    }

    /*
     * projectId is not in the whitelist: it comes from the path,
     * never from the body.
     */
    const plan = createProjectPlan({
      projectId: id,
      ...picked.value,
    });

    return NextResponse.json(
      { ok: true, plan },
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
      "Failed to create plan"
    );
  }
}

/*
 * GET /api/planner/projects/[id]/plans
 *
 * Lists the plan versions oldest first, so a client can show "v1,
 * v2, v3" without sorting anything itself.
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
    if (!getProject(id)) {
      return plannerNotFoundResponse(
        "PROJECT_NOT_FOUND",
        `Project "${id}" does not exist.`
      );
    }

    return NextResponse.json({
      ok: true,
      items: listProjectPlans(id),
    });
  } catch (error) {
    return plannerServerErrorResponse(
      error,
      "Failed to list plans"
    );
  }
}
