import { NextResponse } from "next/server";

import {
  pickFields,
  plannerErrorResponse,
  plannerNotFoundResponse,
  plannerServerErrorResponse,
  readJsonObject,
  type PlannerFieldSpec,
} from "@/lib/planner-api-errors";
import { getAiResource } from "@/lib/repositories/ai-resource-repository";
import {
  ACCESS_METHODS,
  AiResourceServiceError,
  updateAiResource,
} from "@/lib/services/ai-resource-service";

export const runtime = "nodejs";

/*
 * The same writable business fields as create, minus the required
 * flag: PATCH is a partial update. status is absent on purpose — it
 * follows its own guarded transition through the archive endpoint —
 * and so are id, created_at, updated_at and every cost / role /
 * score / rank / selected / recommended field.
 */
const PATCH_FIELDS: readonly PlannerFieldSpec[] = [
  { key: "name", type: "string" },
  { key: "modelId", type: "string" },
  { key: "toolId", type: "string" },
  {
    key: "accessMethod",
    type: "enum",
    enumValues: ACCESS_METHODS,
  },
  { key: "entitlementName", type: "string" },
  { key: "entitlementSourceUrl", type: "string" },
  { key: "entitlementCheckedAt", type: "string" },
  { key: "notes", type: "string" },
];

/*
 * GET /api/planner/resources/[id]
 *
 * Returns the resource row. An archived resource is still readable
 * here: archive never deletes, so historical references resolve.
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
    const resource = getAiResource(id);

    if (!resource) {
      return plannerNotFoundResponse(
        "AI_RESOURCE_NOT_FOUND",
        `AI resource "${id}" does not exist.`
      );
    }

    return NextResponse.json({
      ok: true,
      resource,
    });
  } catch (error) {
    return plannerServerErrorResponse(
      error,
      "Failed to load AI resource"
    );
  }
}

/*
 * PATCH /api/planner/resources/[id]
 *
 * Applies a partial update to the business fields. Only the fields
 * sent are changed; an explicit null clears an optional value.
 * Status cannot be given here, so it cannot be flipped through this
 * endpoint.
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

  const body = await readJsonObject(request);

  if (!body.ok) {
    return body.response;
  }

  const picked = pickFields<
    Parameters<typeof updateAiResource>[1]
  >(body.value, PATCH_FIELDS);

  if (!picked.ok) {
    return picked.response;
  }

  try {
    return NextResponse.json({
      ok: true,
      resource: updateAiResource(
        id,
        picked.value
      ),
    });
  } catch (error) {
    if (error instanceof AiResourceServiceError) {
      return plannerErrorResponse(error);
    }

    return plannerServerErrorResponse(
      error,
      "Failed to update AI resource"
    );
  }
}