import { NextResponse } from "next/server";

import {
  pickFields,
  plannerErrorResponse,
  plannerServerErrorResponse,
  readJsonObject,
  type PlannerFieldSpec,
} from "@/lib/planner-api-errors";
import {
  PlannerServiceError,
  PROJECT_TASK_CATEGORIES,
  PROJECT_TASK_COMPLEXITIES,
  updateProjectTask,
} from "@/lib/services/planner-service";

export const runtime = "nodejs";

/*
 * PATCH /api/planner/plans/[id]/tasks is a different resource; this
 * route updates one planned step wherever it lives.
 *
 * Only the descriptive and estimated fields move. plan_id and
 * sequence are not here, so a step cannot be moved to another plan or
 * reordered by accident, and status is not here either: it follows its
 * own guarded transition, which this phase does not expose.
 */
const PATCH_FIELDS: readonly PlannerFieldSpec[] = [
  { key: "name", type: "string" },
  {
    key: "category",
    type: "enum",
    enumValues: PROJECT_TASK_CATEGORIES,
  },
  {
    key: "complexity",
    type: "enum",
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

/*
 * PATCH /api/planner/tasks/[id]
 *
 * Applies a partial update to one planned step.
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
    Parameters<typeof updateProjectTask>[1]
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
      task: updateProjectTask(
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
      "Failed to update project task"
    );
  }
}
