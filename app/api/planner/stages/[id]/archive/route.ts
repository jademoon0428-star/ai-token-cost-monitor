import { NextResponse } from "next/server";

import {
  plannerErrorResponse,
  plannerServerErrorResponse,
} from "@/lib/planner-api-errors";
import {
  archiveProjectStage,
  PlannerServiceError,
} from "@/lib/services/planner-service";

export const runtime = "nodejs";

/*
 * POST /api/planner/stages/[id]/archive
 *
 * Archives one stage. The request has no body: the call itself is
 * the decision, and any body that is sent is ignored.
 *
 * This is the dedicated structural operation for a stage. It never
 * deletes the row, so historical plans keep the grouping they were
 * planned with, and it is allowed whether or not planned steps
 * still reference the stage - unlike DELETE, which is refused
 * while the stage is referenced.
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
    return NextResponse.json({
      ok: true,
      stage: archiveProjectStage(id),
    });
  } catch (error) {
    if (error instanceof PlannerServiceError) {
      return plannerErrorResponse(
        error
      );
    }

    return plannerServerErrorResponse(
      error,
      "Failed to archive project stage"
    );
  }
}
