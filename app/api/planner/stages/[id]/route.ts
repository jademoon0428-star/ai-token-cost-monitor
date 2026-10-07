import { NextResponse } from "next/server";

import {
  pickFields,
  plannerErrorResponse,
  plannerServerErrorResponse,
  readJsonObject,
  type PlannerFieldSpec,
} from "@/lib/planner-api-errors";
import {
  deleteProjectStage,
  PlannerServiceError,
  updateProjectStage,
} from "@/lib/services/planner-service";

export const runtime = "nodejs";

/*
 * PATCH /api/planner/stages/[id]
 *
 * Renames, re-describes or reorders one stage.
 *
 * sequence is accepted here (unlike task sequences) because
 * reordering stages is a legal structural change; the service
 * still requires a whole number of 1 or more, and a sequence that
 * collides with another stage of the same project is refused by
 * UNIQUE(project_id, sequence) rather than by shuffling other rows.
 *
 * status is not in this whitelist: archiving is its own command
 * (POST .../archive) and deletion is DELETE, so there is exactly
 * one way to do each.
 */
const PATCH_FIELDS: readonly PlannerFieldSpec[] = [
  { key: "name", type: "string" },
  { key: "description", type: "string" },
  { key: "sequence", type: "number" },
];

/*
 * PATCH /api/planner/stages/[id]
 *
 * Applies a partial update to one stage.
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
    Parameters<typeof updateProjectStage>[1]
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
      stage: updateProjectStage(
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
      "Failed to update project stage"
    );
  }
}

/*
 * DELETE /api/planner/stages/[id]
 *
 * Physically removes a stage - the only Planner route that deletes
 * a row. The service refuses while planned steps still reference
 * the stage (STAGE_HAS_TASKS, reported as a 409): historical plans
 * keep the grouping they were planned with, so a referenced stage
 * can only be archived. A stage that does not exist is a 404
 * (STAGE_NOT_FOUND).
 */
export async function DELETE(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await params;

  try {
    deleteProjectStage(id);

    return NextResponse.json({
      ok: true,
      id,
    });
  } catch (error) {
    if (error instanceof PlannerServiceError) {
      return plannerErrorResponse(
        error
      );
    }

    return plannerServerErrorResponse(
      error,
      "Failed to delete project stage"
    );
  }
}
