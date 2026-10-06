import { NextResponse } from "next/server";

import {
  plannerNotFoundResponse,
  plannerServerErrorResponse,
} from "@/lib/planner-api-errors";
import { getProjectPlan } from "@/lib/repositories/planner-repository";
import {
  getPlanProductivity,
} from "@/lib/services/productivity-service";

export const runtime = "nodejs";

/*
 * GET /api/planner/plans/[id]/productivity
 *
 * Read-only AI Productivity report for one plan: planned estimates,
 * actual execution usage, coverage and range deltas, exactly as
 * productivity-service computed them. The response carries facts
 * only - no score, no rank, no recommendation - and this handler
 * writes nothing on either side of the planner/execution boundary.
 *
 * Missing plans map to the shared PLAN_NOT_FOUND 404 body; anything
 * unexpected maps to the shared 500 body. A plan with no linked
 * execution tasks is a normal 200 with actual = null rows, not an
 * error.
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

    const report = getPlanProductivity(id);

    return NextResponse.json({
      ok: true,
      ...report,
    });
  } catch (error) {
    return plannerServerErrorResponse(
      error,
      "Failed to compute plan productivity"
    );
  }
}
