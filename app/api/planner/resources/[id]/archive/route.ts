import { NextResponse } from "next/server";

import {
  plannerErrorResponse,
  plannerServerErrorResponse,
} from "@/lib/planner-api-errors";
import {
  AiResourceServiceError,
  archiveAiResource,
} from "@/lib/services/ai-resource-service";

export const runtime = "nodejs";

/*
 * POST /api/planner/resources/[id]/archive
 *
 * Marks one resource as archived. The request has no body: the call
 * itself is the decision, and any body that is sent is ignored.
 *
 * This is a command, not a query. It never deletes the row, so the
 * resource stays readable by id and historical references keep
 * resolving; it only moves the row out of the active view.
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
      resource: archiveAiResource(id),
    });
  } catch (error) {
    if (error instanceof AiResourceServiceError) {
      return plannerErrorResponse(error);
    }

    return plannerServerErrorResponse(
      error,
      "Failed to archive AI resource"
    );
  }
}