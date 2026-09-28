import { NextResponse } from "next/server";

import {
  pickFields,
  plannerErrorResponse,
  plannerServerErrorResponse,
  readEnumQuery,
  readJsonObject,
  type PlannerFieldSpec,
} from "@/lib/planner-api-errors";
import { listAiResources } from "@/lib/repositories/ai-resource-repository";
import {
  ACCESS_METHODS,
  AiResourceServiceError,
  createAiResource,
} from "@/lib/services/ai-resource-service";

export const runtime = "nodejs";

/*
 * POST /api/planner/resources
 *
 * Records one way the user can access one model. id, created_at and
 * updated_at are server-owned and are not in this list; status is
 * deliberate absent too, because a new resource is always active and
 * moving one out of the active view is the separate archive command.
 *
 * No cost field appears here and no role / score / rank / selected /
 * recommended field either: a resource is inventory, not a price and
 * not a judgement.
 */
const CREATE_FIELDS: readonly PlannerFieldSpec[] = [
  { key: "name", type: "string", required: true },
  { key: "modelId", type: "string", required: true },
  { key: "toolId", type: "string" },
  {
    key: "accessMethod",
    type: "enum",
    required: true,
    enumValues: ACCESS_METHODS,
  },
  { key: "entitlementName", type: "string" },
  { key: "entitlementSourceUrl", type: "string" },
  { key: "entitlementCheckedAt", type: "string" },
  { key: "notes", type: "string" },
];

export async function POST(request: Request) {
  const body = await readJsonObject(request);

  if (!body.ok) {
    return body.response;
  }

  const picked = pickFields<
    Parameters<typeof createAiResource>[0]
  >(body.value, CREATE_FIELDS);

  if (!picked.ok) {
    return picked.response;
  }

  try {
    return NextResponse.json(
      {
        ok: true,
        resource: createAiResource(
          picked.value
        ),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AiResourceServiceError) {
      return plannerErrorResponse(error);
    }

    return plannerServerErrorResponse(
      error,
      "Failed to create AI resource"
    );
  }
}

/*
 * GET /api/planner/resources?status=active|archived|all
 *
 * Lists resources in neutral insertion order. That order is not a
 * ranking: nothing compares resources against each other, and no row
 * is presented as better than another. When the query parameter is
 * absent the active view is returned; archived rows move out of it
 * but are never deleted and remain readable by id.
 */
export async function GET(request: Request) {
  const status = readEnumQuery(
    request,
    "status",
    ["active", "archived", "all"]
  );

  if (!status.ok) {
    return status.response;
  }

  try {
    return NextResponse.json({
      ok: true,
      items: listAiResources({
        status:
          (status.value ??
            "active") as
            | "active"
            | "archived"
            | "all",
      }),
    });
  } catch (error) {
    return plannerServerErrorResponse(
      error,
      "Failed to list AI resources"
    );
  }
}