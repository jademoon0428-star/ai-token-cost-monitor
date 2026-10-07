import { NextResponse } from "next/server";

import {
  pickFields,
  plannerErrorResponse,
  plannerServerErrorResponse,
  readJsonObject,
  type PlannerFieldSpec,
} from "@/lib/planner-api-errors";
import {
  createProjectStage,
  getProjectStages,
  PlannerServiceError,
} from "@/lib/services/planner-service";

export const runtime = "nodejs";

/*
 * POST /api/planner/projects/[id]/stages
 *
 * Adds the next stage to a project. There is no sequence in the
 * body: the service assigns one more than the highest sequence the
 * project already has, which is what keeps UNIQUE(project_id,
 * sequence) satisfied. projectId comes from the path, never from
 * the body, so a stage can only be created under its own project.
 *
 * Stages belong to the project rather than to a plan, which is why
 * this route hangs off the project and not off a plan id: every
 * plan version and every generated combination plan of the project
 * shares these stages.
 */
const CREATE_FIELDS: readonly PlannerFieldSpec[] = [
  { key: "name", type: "string", required: true },
  { key: "description", type: "string" },
];

export async function POST(
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
    Omit<
      Parameters<typeof createProjectStage>[0],
      "projectId"
    >
  >(
    body.value,
    CREATE_FIELDS
  );

  if (!picked.ok) {
    return picked.response;
  }

  try {
    const stage = createProjectStage({
      projectId: id,
      ...picked.value,
    });

    return NextResponse.json(
      { ok: true, stage },
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
      "Failed to create project stage"
    );
  }
}

/*
 * GET /api/planner/projects/[id]/stages
 *
 * Lists the project's stages in planned (sequence) order. Archived
 * stages are included: archiving moves a row out of the active
 * view, it does not hide it from a reader that asked for the
 * project's structure, and the status column says which is which.
 * A missing project is a 404 through the service's PROJECT_NOT_FOUND.
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
    return NextResponse.json({
      ok: true,
      items: getProjectStages(id),
    });
  } catch (error) {
    if (error instanceof PlannerServiceError) {
      return plannerErrorResponse(
        error
      );
    }

    return plannerServerErrorResponse(
      error,
      "Failed to list project stages"
    );
  }
}
