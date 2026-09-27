import { NextResponse } from "next/server";

import {
  plannerErrorResponse,
  plannerNotFoundResponse,
  plannerServerErrorResponse,
} from "@/lib/planner-api-errors";
import {
  getProjectTask,
  getProjectTaskAiOption,
} from "@/lib/repositories/planner-repository";
import {
  PlannerServiceError,
  selectProjectTaskAiOption,
} from "@/lib/services/planner-service";

export const runtime = "nodejs";

/*
 * POST /api/planner/tasks/[id]/ai-options/[optionId]/select
 *
 * Records an explicit user choice. There is no request body: the
 * decision is the call itself.
 *
 * This is a command, not a query and not a recommendation. It sets
 * this one option to selected and clears the flag on the other
 * options of the same planned step. It does not look at cost, time or
 * fit_status, it does not rank anything, and it does not touch any
 * other planned step, any model, or the Task Session layer.
 */
export async function POST(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
      optionId: string;
    }>;
  }
) {
  const { id, optionId } = await params;

  try {
    if (!getProjectTask(id)) {
      return plannerNotFoundResponse(
        "PROJECT_TASK_NOT_FOUND",
        `Project task "${id}" does not exist.`
      );
    }

    /*
     * The option must belong to this planned step. Checking it here
     * means a valid option id used against the wrong step is a plain
     * 404 instead of silently selecting something elsewhere.
     */
    const option =
      getProjectTaskAiOption(
        optionId
      );

    if (
      !option ||
      option.project_task_id !== id
    ) {
      return plannerNotFoundResponse(
        "AI_OPTION_NOT_FOUND",
        `AI option "${optionId}" does not exist on project task "${id}".`
      );
    }

    return NextResponse.json({
      ok: true,
      option: selectProjectTaskAiOption(
        optionId
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
      "Failed to select AI option"
    );
  }
}
