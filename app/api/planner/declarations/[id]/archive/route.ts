import { NextResponse } from "next/server";

import {
  plannerErrorResponse,
  plannerServerErrorResponse,
} from "@/lib/planner-api-errors";
import {
  DeclaredResourceServiceError,
  archiveDeclaredResource,
} from "@/lib/services/declared-resource-service";

export const runtime = "nodejs";

/*
 * POST /api/planner/declarations/[id]/archive
 *
 * Marks one declaration as archived. The request has no body: the call
 * itself is the decision, and any body that is sent is ignored.
 *
 * This is a command, not a query. It never deletes the row, so the
 * declaration stays readable by id and a stored candidate that points
 * at one keeps resolving; it only moves the row out of the active
 * view, which is what stops it from entering newly generated candidate
 * sets.
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
      declaration: archiveDeclaredResource(id),
    });
  } catch (error) {
    if (error instanceof DeclaredResourceServiceError) {
      return plannerErrorResponse(error);
    }

    return plannerServerErrorResponse(
      error,
      "Failed to archive declared resource"
    );
  }
}
