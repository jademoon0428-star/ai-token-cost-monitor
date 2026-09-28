import { NextResponse } from "next/server";

import {
  plannerErrorResponse,
  plannerNotFoundResponse,
  plannerServerErrorResponse,
} from "@/lib/planner-api-errors";
import { generateProjectPlanCombinations } from "@/lib/planner/combination-service";
import { getProject } from "@/lib/repositories/planner-repository";
import { PlannerServiceError } from "@/lib/services/planner-service";

export const runtime = "nodejs";

/*
 * POST /api/planner/projects/[id]/combinations
 *
 * Generates and persists the combination plans of one project.
 *
 * There is no request body and any body that is sent is ignored: the
 * pricing instant is server-owned. The service decides the one shared
 * pricing_basis_at (reusing a project's existing valid one), appends
 * one new plan version per surviving strategy and writes every
 * assignment atomically. A client cannot pass `now`, a version or a
 * strategy here.
 *
 * This is a command with side effects, not a query. Nothing is
 * selected or recommended: is_primary stays 0 on every assignment, so
 * the result is a set of facts, never a pick.
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
    if (!getProject(id)) {
      return plannerNotFoundResponse(
        "PROJECT_NOT_FOUND",
        `Project "${id}" does not exist.`
      );
    }

    const generation = generateProjectPlanCombinations(
      id
    );

    return NextResponse.json(
      { ok: true, generation },
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
      "Failed to generate combination plans"
    );
  }
}