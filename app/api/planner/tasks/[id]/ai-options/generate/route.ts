import { NextResponse } from "next/server";

import {
  plannerErrorResponse,
  plannerNotFoundResponse,
  plannerServerErrorResponse,
} from "@/lib/planner-api-errors";
import {
  getProjectTask,
} from "@/lib/repositories/planner-repository";
import {
  PlannerServiceError,
  generateProjectTaskAiOptions,
} from "@/lib/services/planner-service";

export const runtime = "nodejs";

/*
 * POST /api/planner/tasks/[id]/ai-options/generate
 *
 * Replaces one planned step's candidate set with the full generated
 * batch. There is no request body: the source data is the task's own
 * category, complexity, required capabilities and token estimates,
 * the plan's frozen created_at basis, and the registry plus the
 * user's active registered resources. A client cannot pass a model, a
 * strategy, a version, `now` or an assignment here.
 *
 * The service decides and the write is a replace, not an append: the
 * previous candidate set is deleted and the generated rows inserted
 * in one atomic transaction. Every row is written with is_selected =
 * 0, so regenerating a step leaves it unselected. Selection stays a
 * separate, explicit user action made through the select endpoint.
 *
 * This is a command with side effects, not a query. Generation writes
 * facts, not recommendations: it never filters, never ranks and never
 * picks a winner.
 */
export async function POST(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await params;

  try {
    if (!getProjectTask(id)) {
      return plannerNotFoundResponse(
        "PROJECT_TASK_NOT_FOUND",
        `Project task "${id}" does not exist.`
      );
    }

    const items = generateProjectTaskAiOptions(id);

    return NextResponse.json({
      ok: true,
      items,
    });
  } catch (error) {
    if (error instanceof PlannerServiceError) {
      return plannerErrorResponse(
        error
      );
    }

    return plannerServerErrorResponse(
      error,
      "Failed to generate AI options"
    );
  }
}