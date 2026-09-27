import { NextResponse } from "next/server";

import {
  plannerNotFoundResponse,
  plannerServerErrorResponse,
} from "@/lib/planner-api-errors";
import { getProjectPlan } from "@/lib/repositories/planner-repository";

export const runtime = "nodejs";

/*
 * GET /api/planner/plans/[id]
 *
 * Returns one plan version. There is no PATCH and no DELETE here on
 * purpose: a plan is immutable, so changing it means creating the
 * next version on the project.
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
    const plan = getProjectPlan(id);

    if (!plan) {
      return plannerNotFoundResponse(
        "PLAN_NOT_FOUND",
        `Plan "${id}" does not exist.`
      );
    }

    return NextResponse.json({
      ok: true,
      plan,
    });
  } catch (error) {
    return plannerServerErrorResponse(
      error,
      "Failed to load plan"
    );
  }
}
