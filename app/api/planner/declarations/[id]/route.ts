import { NextResponse } from "next/server";

import {
  pickFields,
  plannerErrorResponse,
  plannerServerErrorResponse,
  readJsonObject,
  type PlannerFieldSpec,
} from "@/lib/planner-api-errors";
import {
  DECLARED_CHANNELS,
  DECLARED_ENTITLEMENTS,
  DECLARED_PRICING_STATES,
  DeclaredResourceServiceError,
  getDeclaredResourceById,
  updateDeclaredResource,
} from "@/lib/services/declared-resource-service";

export const runtime = "nodejs";

/*
 * The same writable business fields as create, minus the required
 * flag: PATCH is a partial update. status is absent on purpose —
 * status follows its own guarded transition through the archive
 * endpoint — and so are id, created_at, updated_at and every price,
 * score, rank or selection field. Any body key outside this list is
 * rejected.
 *
 * An explicit null clears an optional value, including a capability
 * the user wants to mark as not stated again.
 */
const PATCH_FIELDS: readonly PlannerFieldSpec[] = [
  { key: "name", type: "string" },
  { key: "providerName", type: "string" },
  { key: "modelName", type: "string" },
  {
    key: "channel",
    type: "enum",
    enumValues: DECLARED_CHANNELS,
  },
  {
    key: "entitlement",
    type: "enum",
    enumValues: DECLARED_ENTITLEMENTS,
  },
  {
    key: "pricingState",
    type: "enum",
    enumValues: DECLARED_PRICING_STATES,
  },
  { key: "supportsTools", type: "number" },
  { key: "supportsVision", type: "number" },
  { key: "supportsReasoning", type: "number" },
  { key: "contextWindowTokens", type: "number" },
  { key: "maxOutputTokens", type: "number" },
  { key: "notes", type: "string" },
];

/*
 * GET /api/planner/declarations/[id]
 *
 * Returns the declaration. An archived declaration is still readable
 * here: archive never deletes, so a stored candidate that points at
 * one keeps resolving.
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
      declaration: getDeclaredResourceById(id),
    });
  } catch (error) {
    if (error instanceof DeclaredResourceServiceError) {
      return plannerErrorResponse(error);
    }

    return plannerServerErrorResponse(
      error,
      "Failed to load declared resource"
    );
  }
}

/*
 * PATCH /api/planner/declarations/[id]
 *
 * Applies a partial update to the business fields. Only the fields
 * sent are changed; an explicit null clears an optional value. Status
 * cannot be given here, so it cannot be flipped through this endpoint.
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
    Parameters<typeof updateDeclaredResource>[1]
  >(body.value, PATCH_FIELDS);

  if (!picked.ok) {
    return picked.response;
  }

  try {
    return NextResponse.json({
      ok: true,
      declaration: updateDeclaredResource(
        id,
        picked.value
      ),
    });
  } catch (error) {
    if (error instanceof DeclaredResourceServiceError) {
      return plannerErrorResponse(error);
    }

    return plannerServerErrorResponse(
      error,
      "Failed to update declared resource"
    );
  }
}
