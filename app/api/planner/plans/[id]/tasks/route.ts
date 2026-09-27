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
  getProjectPlan,
  listProjectTasks,
} from "@/lib/repositories/planner-repository";
import {
  createProjectTask,
  PlannerServiceError,
  PROJECT_TASK_CATEGORIES,
  PROJECT_TASK_COMPLEXITIES,
} from "@/lib/services/planner-service";

export const runtime = "nodejs";

/*
 * POST /api/planner/plans/[id]/tasks
 *
 * Adds a planned step to a plan.
 *
 * There is no sequence in the body. The service assigns one more than
 * the highest sequence the plan already has, which is what keeps
 * UNIQUE(plan_id, sequence) satisfied.
 *
 * taskId is accepted because it is the one and only link between the
 * Planner and the Task Session layer: it points at an existing row in
 * tasks. No session is created, started or read here.
 */
const CREATE_FIELDS: readonly PlannerFieldSpec[] = [
  { key: "name", type: "string", required: true },
  {
    key: "category",
    type: "enum",
    required: true,
    enumValues: PROJECT_TASK_CATEGORIES,
  },
  {
    key: "complexity",
    type: "enum",
    required: true,
    enumValues: PROJECT_TASK_COMPLEXITIES,
  },
  { key: "description", type: "string" },
  { key: "requiredCapabilities", type: "string" },
  { key: "estimatedInputTokensMin", type: "number" },
  { key: "estimatedInputTokensMax", type: "number" },
  { key: "estimatedOutputTokensMin", type: "number" },
  { key: "estimatedOutputTokensMax", type: "number" },
  { key: "taskId", type: "string" },
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
      Parameters<typeof createProjectTask>[0],
      "planId"
    >
  >(
    body.value,
    CREATE_FIELDS
  );

  if (!picked.ok) {
    return picked.response;
  }

  try {
    if (!getProjectPlan(id)) {
      return plannerNotFoundResponse(
        "PLAN_NOT_FOUND",
        `Plan "${id}" does not exist.`
      );
    }

    /*
     * planId is not in the whitelist: it comes from the path, never
     * from the body.
     */
    const task = createProjectTask({
      planId: id,
      ...picked.value,
    });

    return NextResponse.json(
      { ok: true, task },
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
      "Failed to create project task"
    );
  }
}

/*
 * GET /api/planner/plans/[id]/tasks
 *
 * Lists the planned steps in sequence order.
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
    if (!getProjectPlan(id)) {
      return plannerNotFoundResponse(
        "PLAN_NOT_FOUND",
        `Plan "${id}" does not exist.`
      );
    }

    return NextResponse.json({
      ok: true,
      items: listProjectTasks(id),
    });
  } catch (error) {
    return plannerServerErrorResponse(
      error,
      "Failed to list project tasks"
    );
  }
}
