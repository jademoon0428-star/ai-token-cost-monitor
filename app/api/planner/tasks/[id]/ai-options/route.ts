import { NextResponse } from "next/server";

import {
  pickFields,
  plannerErrorResponse,
  plannerNotFoundResponse,
  plannerServerErrorResponse,
  readJsonObject,
  type PlannerFieldSpec,
} from "@/lib/planner-api-errors";
import {
  getProjectTask,
  listProjectTaskAiOptions,
} from "@/lib/repositories/planner-repository";
import {
  createProjectTaskAiOption,
  FIT_STATUSES,
  PlannerServiceError,
} from "@/lib/services/planner-service";

export const runtime = "nodejs";

/*
 * POST /api/planner/tasks/[id]/ai-options
 *
 * Records one candidate way of running a planned step.
 *
 * isSelected is not in this list, and that is the whole point. A new
 * option always starts unselected. Selecting one is a separate,
 * explicit user decision made through the select endpoint, so a
 * client cannot install itself as the chosen option by creating a
 * row. A body containing isSelected or is_selected is rejected with a
 * 400 by the field whitelist rather than being quietly dropped.
 *
 * fitStatus is a capability fact about this step's own
 * required_capabilities, validated as a fixed enum and never derived
 * from cost, price or deadline.
 *
 * Cost fields follow the Phase 1 rule: a known price carries all
 * three of cost_min_micros, cost_max_micros and cost_currency, and an
 * unknown one carries none of them. Nothing here converts CNY to USD
 * or fills in a currency the client did not send.
 */
const CREATE_FIELDS: readonly PlannerFieldSpec[] = [
  { key: "modelId", type: "string", required: true },
  { key: "toolId", type: "string" },
  { key: "costMinMicros", type: "number" },
  { key: "costMaxMicros", type: "number" },
  { key: "costCurrency", type: "string" },
  { key: "timeMinMinutes", type: "number" },
  { key: "timeMaxMinutes", type: "number" },
  {
    key: "fitStatus",
    type: "enum",
    enumValues: FIT_STATUSES,
  },
  { key: "excludedReason", type: "string" },
  { key: "pricingBasis", type: "string" },
  { key: "rationale", type: "string" },
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
      Parameters<typeof createProjectTaskAiOption>[0],
      "projectTaskId"
    >
  >(
    body.value,
    CREATE_FIELDS
  );

  if (!picked.ok) {
    return picked.response;
  }

  try {
    if (!getProjectTask(id)) {
      return plannerNotFoundResponse(
        "PROJECT_TASK_NOT_FOUND",
        `Project task "${id}" does not exist.`
      );
    }

    /*
     * projectTaskId is not in the whitelist: it comes from the path,
     * never from the body. isSelected is not in the whitelist either,
     * so a new option is always stored with is_selected = 0 and the
     * only way to change that is the select endpoint.
     */
    const option = createProjectTaskAiOption({
      projectTaskId: id,
      ...picked.value,
    });

    return NextResponse.json(
      { ok: true, option },
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
      "Failed to create AI option"
    );
  }
}

/*
 * GET /api/planner/tasks/[id]/ai-options
 *
 * Lists the candidates for one planned step in a neutral insertion
 * order. That order is not a ranking: nothing compares cost, time or
 * fit_status to decide it, and no option is presented as better than
 * another.
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
    if (!getProjectTask(id)) {
      return plannerNotFoundResponse(
        "PROJECT_TASK_NOT_FOUND",
        `Project task "${id}" does not exist.`
      );
    }

    return NextResponse.json({
      ok: true,
      items: listProjectTaskAiOptions(
        id
      ),
    });
  } catch (error) {
    return plannerServerErrorResponse(
      error,
      "Failed to list AI options"
    );
  }
}
