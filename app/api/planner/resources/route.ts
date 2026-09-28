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
  CHANNELS,
  createAiResource,
  PRICING_BASIS_KINDS,
} from "@/lib/services/ai-resource-service";

export const runtime = "nodejs";

/*
 * POST /api/planner/resources
 *
 * Records one way the user can access one model. id, created_at,
 * updated_at, owner and status are server-owned and are not in this
 * list: owner is always 'user' for UI-created rows and status is
 * always 'active' on create (moving one out of the active view is the
 * separate archive command).
 *
 * channel is optional: when omitted it defaults to 'unknown'. It is a
 * recorded reachability fact and nothing more; no key is stored, no
 * provider connection is opened and no cost is calculated here. Any
 * body key outside this list, including owner, is rejected.
 *
 * pricingBasisKind is optional and defaults to 'none'; the allowed
 * values are the facts from the R3.4-B1 contract ('registry' or
 * 'none'). pricingVersionId may pin one registry pricing_versions
 * row and pricingBasisCheckedAt stamps when the fact was set — all
 * three are facts only, never a price, and a measured/verified-usage
 * basis is not offered. The service refuses an unknown
 * pricingVersionId (404) and a pricingVersionId paired with 'none'
 * (400).
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
  {
    key: "channel",
    type: "enum",
    enumValues: CHANNELS,
  },
  { key: "entitlementName", type: "string" },
  { key: "entitlementSourceUrl", type: "string" },
  { key: "entitlementCheckedAt", type: "string" },
  { key: "notes", type: "string" },
  {
    key: "pricingBasisKind",
    type: "enum",
    enumValues: PRICING_BASIS_KINDS,
  },
  { key: "pricingVersionId", type: "string" },
  { key: "pricingBasisCheckedAt", type: "string" },
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