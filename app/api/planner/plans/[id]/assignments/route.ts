import { NextResponse } from "next/server";

import {
  plannerNotFoundResponse,
  plannerServerErrorResponse,
} from "@/lib/planner-api-errors";
import {
  getProjectPlan,
  listPlanResourceAssignments,
} from "@/lib/repositories/planner-repository";

export const runtime = "nodejs";

/*
 * GET /api/planner/plans/[id]/assignments
 *
 * Lists the resource assignments of one plan in step order
 * (sequence, then id). A manual or combination plan with no
 * assignments simply returns an empty list.
 *
 * The rows are stored facts: role, cost and time ranges, fit_status,
 * cost_basis and the resource reference (exactly one of
 * ai_resource_id or registry_model_id). Nothing here is a judgement,
 * and is_primary is always 0.
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
      items: listPlanResourceAssignments(id),
    });
  } catch (error) {
    return plannerServerErrorResponse(
      error,
      "Failed to list plan resource assignments"
    );
  }
}