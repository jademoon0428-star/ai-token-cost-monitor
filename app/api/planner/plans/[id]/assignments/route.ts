import { NextResponse } from "next/server";

import {
  plannerNotFoundResponse,
  plannerServerErrorResponse,
} from "@/lib/planner-api-errors";
import { getAiResource } from "@/lib/repositories/ai-resource-repository";
import {
  getProjectPlan,
  listPlanResourceAssignments,
} from "@/lib/repositories/planner-repository";
import {
  getVerifiedUsageEvidenceByModels,
  type VerifiedUsageEvidence,
} from "@/lib/repositories/usage-repository";

export const runtime = "nodejs";

/*
 * Resolves each stored assignment back to its model id - the evidence
 * identity - without changing anything about how the assignment is
 * read. A registry assignment's model id IS its registry_model_id; a
 * registered assignment's model id comes from its ai_resources row.
 */
function modelIdForAssignment(
  assignment: {
    ai_resource_id: string | null;
    registry_model_id: string | null;
    resource_source: string;
  },
  modelByResource: ReadonlyMap<
    string,
    string
  >
): string | null {
  if (
    assignment.resource_source === "registry"
  ) {
    return assignment.registry_model_id;
  }

  if (assignment.ai_resource_id === null) {
    return null;
  }

  return (
    modelByResource.get(
      assignment.ai_resource_id
    ) ?? null
  );
}

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
 *
 * Each item also carries evidenceSummary, a separate optional field
 * with the verified historical usage evidence of that assignment's
 * model. It is display context only: it never feeds planned_cost_*,
 * cost_basis or pricing_basis_kind, and never becomes a nominal price.
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

    const items =
      listPlanResourceAssignments(id);

    const registeredIds = [
      ...new Set(
        items
          .filter(
            (item) =>
              item.resource_source ===
                "registered" &&
              item.ai_resource_id !== null
          )
          .map(
            (item) => item.ai_resource_id!
          )
      ),
    ];

    const modelByResource = new Map<
      string,
      string
    >();

    for (const resourceId of registeredIds) {
      const resource = getAiResource(
        resourceId
      );

      if (resource) {
        modelByResource.set(
          resourceId,
          resource.model_id
        );
      }
    }

    const modelIds = [
      ...new Set(
        items
          .map((item) =>
            modelIdForAssignment(
              item,
              modelByResource
            )
          )
          .filter(
            (modelId): modelId is string =>
              modelId !== null
          )
      ),
    ];

    const evidenceByModel =
      getVerifiedUsageEvidenceByModels(
        modelIds
      );

    const itemsWithEvidence = items.map(
      (item) => {
        const modelId = modelIdForAssignment(
          item,
          modelByResource
        );

        const evidenceSummary:
          | VerifiedUsageEvidence[]
          | null =
          modelId === null
            ? null
            : (evidenceByModel[modelId] ??
                null);

        return {
          ...item,
          evidenceSummary,
        };
      }
    );

    return NextResponse.json({
      ok: true,
      items: itemsWithEvidence,
    });
  } catch (error) {
    return plannerServerErrorResponse(
      error,
      "Failed to list plan resource assignments"
    );
  }
}