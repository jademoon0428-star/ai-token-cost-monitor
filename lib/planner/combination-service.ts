/*
 * R2 Phase 3.3-B Planner combination persistence service.
 *
 * This is the ONLY layer that turns an R2 3.3-A combination evaluation
 * into rows in project_plans + plan_resource_assignments. It does
 * three jobs and no more:
 *
 *   1. Reads what a project actually has: its project rows, its plans
 *      and the tasks of its current (highest-version) plan.
 *   2. Builds the ONE combined resource pool the rules evaluate:
 *      the user's active ai_resources ("registered") plus every model
 *      the AI Registry knows about ("registry"). A registry-only model
 *      is used as it is; it is never written into ai_resources.
 *   3. Calls evaluateCombinations (the only combination logic there
 *      is), maps the result onto plan + assignment rows and persists
 *      the whole evaluation atomically.
 *
 * What it deliberately does not do:
 *
 *   - It re-implements no combination rule. Cost, fit, time, roles,
 *     strategies and de-duplication all come from combination-rules.ts.
 *   - It never writes to usage_records, cost_records, task_sessions,
 *     task_usage_records, ai_resources or project_task_ai_options.
 *   - It selects nothing. is_primary stays 0 on every row; there is
 *     no winner, recommendation or pick anywhere in a combination
 *     plan.
 *   - It prices nothing against the wall clock: the pricing instant is
 *     one shared value decided once per generation.
 *
 * The pricing instant (D5):
 *
 *   pricing_basis_at is ONE instant shared by all combination plans of
 *   a project. If the project already recorded a valid one on an older
 *   plan, that value is reused, so re-generating tomorrow prices with
 *   yesterday's rate card. Only when nothing valid exists is the
 *   current (single, generation-time) instant used, and it is then
 *   stored on every new plan so a later generation can reuse it.
 */
import { randomUUID } from "node:crypto";

import { getDb } from "@/lib/db";
import {
  COMBINATION_STRATEGIES,
  evaluateCombinations,
} from "@/lib/planner/combination-rules";
import type { CombinationResource } from "@/lib/planner/combination-rules";
import type { PlannerCostPricing } from "@/lib/planner/cost-estimator";
import type { PlannerCapabilityFacts } from "@/lib/planner/fit-estimator";
import { estimatePlannerTime } from "@/lib/planner/time-estimator";
import {
  getProject,
  getProjectPlan,
  listPlanResourceAssignments,
  listProjectPlans,
  listProjectTasks,
  saveCombinationPlans,
} from "@/lib/repositories/planner-repository";
import { listAiResources } from "@/lib/repositories/ai-resource-repository";
import {
  listAiRegistry,
  resolveRegistryPricing,
} from "@/lib/registry/ai-registry-repository";
import type { RegistryPricingRow } from "@/lib/registry/ai-registry-repository";
import { PlannerServiceError } from "@/lib/services/planner-service";

export type GeneratedCombinationResult = {
  pricingBasisAt: string;
  createdAt: string;
  plans: Array<{
    id: string;
    version: number;
    strategy: string;
    summary: string | null;
    assignmentCount: number;
  }>;
};

function isInstant(value: string): boolean {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    Number.isFinite(Date.parse(value))
  );
}

function fail(
  code: string,
  message: string
): never {
  throw new PlannerServiceError(code, message);
}

/*
 * The repository's resolver is the single authority on which rate
 * applies at an instant. The row is adapted to the cost estimator's
 * input shape; a model with no rate in force stays null ("unknown"),
 * never 0.
 */
function toPlannerCostPricing(
  row: RegistryPricingRow | null
): PlannerCostPricing | null {
  if (row === null) {
    return null;
  }

  return {
    id: row.id,
    currency: row.currency,
    inputPerMillion: row.input_per_million,
    outputPerMillion: row.output_per_million,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
  };
}

/*
 * The flattened registry view the two pool builders share. providerName
 * is attached per model so neither builder has to walk providers.
 */
type RegistryModelView = {
  id: string;
  name: string;
  providerName: string;
  capabilities: PlannerCapabilityFacts | null;
};

function registryModelViews(): RegistryModelView[] {
  return listAiRegistry().flatMap((provider) =>
    provider.models.map((model) => ({
      id: model.id,
      name: model.name,
      providerName: provider.name,
      capabilities: model.capabilities,
    }))
  );
}

/*
 * The "registered" half of the pool: every active ai_resources row.
 * A resource is exactly what the user owns - a model reached directly
 * or through one tool, with a specific access method. access_method
 * "unknown" becomes null (unknown access), and entitlement counts as
 * confirmed only when the row recorded a verification instant and a
 * name; unconfirmed stays unconfirmed and costs out-of-pocket as
 * unknown, never as zero.
 */
function buildRegisteredResources(
  at: string,
  models: ReadonlyMap<string, RegistryModelView>,
  toolNames: ReadonlyMap<string, string>
): CombinationResource[] {
  return listAiResources({ status: "active" }).map((row) => {
    const model = models.get(row.model_id);

    return {
      candidateResourceId: row.id,
      source: "registered",
      modelId: row.model_id,
      modelName: model?.name ?? null,
      providerName: model?.providerName ?? null,
      toolId: row.tool_id,
      toolName:
        row.tool_id === null
          ? null
          : (toolNames.get(row.tool_id) ?? null),
      accessMethod:
        row.access_method === "unknown"
          ? null
          : row.access_method,
      entitlementConfirmed:
        row.entitlement_checked_at !== null &&
        row.entitlement_name !== null,
      capabilities: model?.capabilities ?? null,
      pricing: toPlannerCostPricing(
        resolveRegistryPricing(row.model_id, at)
      ),
    };
  });
}

/*
 * The "registry" half of the pool: every model the AI Registry knows,
 * used exactly as it is. No access method (the registry records
 * none), no entitlement, no tool - and crucially no ai_resources row.
 */
function buildRegistryResources(
  at: string,
  models: ReadonlyArray<RegistryModelView>
): CombinationResource[] {
  return models.map((model) => ({
    candidateResourceId: model.id,
    source: "registry",
    modelId: model.id,
    modelName: model.name,
    providerName: model.providerName,
    toolId: null,
    toolName: null,
    accessMethod: null,
    entitlementConfirmed: false,
    capabilities: model.capabilities,
    pricing: toPlannerCostPricing(
      resolveRegistryPricing(model.id, at)
    ),
  }));
}

/*
 * The pricing instant for this generation (D5).
 *
 * A project that already recorded a valid instant on any plan reuses
 * it. A project that never did (typical of pre-3.3-B rows, or a first
 * generation) gets the single generation instant, which is then
 * written on every new plan so it becomes the shared basis for every
 * later generation too.
 */
function resolvePricingBasisAt(
  plans: ReadonlyArray<{ pricing_basis_at: string | null }>,
  now: string
): string {
  const existing = plans.find(
    (plan) =>
      plan.pricing_basis_at !== null &&
      isInstant(plan.pricing_basis_at)
  );

  return existing?.pricing_basis_at ?? now;
}

/*
 * Generates and persists the combination plans of one project.
 *
 * Options are for tests only: `now` pins the shared pricing instant
 * and created_at so a smoke can re-run generation deterministically.
 */
export function generateProjectPlanCombinations(
  projectId: string,
  options: { now?: string } = {}
): GeneratedCombinationResult {
  const now = options.now ?? new Date().toISOString();

  if (!isInstant(now)) {
    fail(
      "INVALID_INSTANT",
      `now "${now}" is not a valid instant`
    );
  }

  const project = getProject(projectId);

  if (!project) {
    fail(
      "PROJECT_NOT_FOUND",
      `project "${projectId}" does not exist`
    );
  }

  const plans = listProjectPlans(projectId);

  if (plans.length === 0) {
    fail(
      "PROJECT_HAS_NO_PLANS",
      `project "${projectId}" has no plan to evaluate tasks from`
    );
  }

  /*
   * A combination plan is a derived copy of a source plan's tasks and
   * never owns tasks itself, so the source is the newest plan that
   * actually owns a task set. Picking the highest-version plan blindly
   * would hit a previous generation's empty plan the second time around.
   */
  let sourcePlan: (typeof plans)[number] | undefined;

  for (let i = plans.length - 1; i >= 0; i--) {
    if (listProjectTasks(plans[i].id).length > 0) {
      sourcePlan = plans[i];
      break;
    }
  }

  if (!sourcePlan) {
    fail(
      "PLAN_HAS_NO_TASKS",
      `project "${projectId}" has no plan that owns a task set to plan assignments for`
    );
  }

  const tasks = listProjectTasks(sourcePlan.id);

  const pricingBasisAt = resolvePricingBasisAt(plans, now);

  /*
   * The one resource list the rules will see. Built once here from the
   * two real facts layers and handed to evaluateCombinations as plain
   * data; the rules never touch a database.
   */
  const models = registryModelViews();

  const modelsById = new Map(
    models.map((model) => [model.id, model])
  );

  const toolNames = new Map(
    (
      getDb()
        .prepare(
          `SELECT id, name FROM user_ai_tools`
        )
        .all() as Array<{ id: string; name: string }>
    ).map((tool) => [tool.id, tool.name])
  );

  const resources: CombinationResource[] = [
    ...buildRegisteredResources(
      pricingBasisAt,
      modelsById,
      toolNames
    ),
    ...buildRegistryResources(
      pricingBasisAt,
      models
    ),
  ];

  /*
   * project_tasks.sequence ascending is the project's own step order;
   * listProjectTasks already returns it that way. The rules produce
   * assignments in the same order (step by step, role by role), which
   * is exactly the order persisted as `sequence`.
   */
  const combinationTasks = tasks.map((task) => ({
    projectTaskId: task.id,
    category: task.category,
    complexity: task.complexity,
    requiredCapabilitiesJson: task.required_capabilities,
    estimatedInputTokensMin: task.estimated_input_tokens_min,
    estimatedInputTokensMax: task.estimated_input_tokens_max,
    estimatedOutputTokensMin: task.estimated_output_tokens_min,
    estimatedOutputTokensMax: task.estimated_output_tokens_max,
  }));

  const evaluation = evaluateCombinations({
    planCreatedAt: pricingBasisAt,
    tasks: combinationTasks,
    resources,
  });

  if (evaluation.plans.length === 0) {
    fail(
      "NO_COMBINATION_PLAN_GENERATED",
      `no combination plan could be generated for project "${projectId}"`
    );
  }

  /*
   * planned_time is a property of the step, not of the resource or the
   * role. Each step's range is computed once and copied onto every
   * assignment row of that step, in every plan.
   */
  const taskTimes = new Map(
    tasks.map((task) => {
      const estimate = estimatePlannerTime({
        category: task.category,
        complexity: task.complexity,
      });

      return [
        task.id,
        {
          min: estimate.minMinutes,
          max: estimate.maxMinutes,
        },
      ] as const;
    })
  );

  const savedPlanIds: string[] = [];

  const plansToSave = evaluation.plans.map((plan) => {
    const planId = randomUUID();
    savedPlanIds.push(planId);

    let sequence = 0;

    const assignments = plan.assignments.map(
      (assignment) => {
        if (
          assignment.fitStatus === "below_minimum"
        ) {
          /*
           * The rules never assign below_minimum (it is a stated
           * failure and is filtered out of the pool). If one ever
           * reaches here it is a bug in the rules, and silently
           * persisting it would make an internal error look like a
           * stored fact.
           */
          throw new Error(
            `internal consistency error: combination rules produced below_minimum for task "${assignment.projectTaskId}" and resource "${assignment.candidateResourceId}"`
          );
        }

        sequence += 1;

        const time = taskTimes.get(
          assignment.projectTaskId
        );

        return {
          id: randomUUID(),
          planId,
          projectTaskId: assignment.projectTaskId,
          aiResourceId:
            assignment.source === "registered"
              ? assignment.candidateResourceId
              : undefined,
          registryModelId:
            assignment.source === "registry"
              ? assignment.candidateResourceId
              : undefined,
          resourceSource: assignment.source,
          role: assignment.role,
          roleSource: assignment.roleSource,
          isPrimary: 0 as const,
          sequence,
          plannedCostMinMicros:
            assignment.outOfPocket.costMinMicros,
          plannedCostMaxMicros:
            assignment.outOfPocket.costMaxMicros,
          plannedCostCurrency:
            assignment.outOfPocket.currency,
          plannedTimeMinMinutes: time?.min ?? null,
          plannedTimeMaxMinutes: time?.max ?? null,
          fitStatus: assignment.fitStatus,
          costBasis: assignment.outOfPocket.basis,
          rationale: assignment.rationale,
          createdAt: now,
        };
      }
    );

    return {
      id: planId,
      strategy: plan.strategy,
      summary: `${plan.label} (${plan.strategy}). ${plan.note}`,
      pricingBasisAt,
      assignments,
    };
  });

  for (const plan of plansToSave) {
    if (
      !COMBINATION_STRATEGIES.includes(
        plan.strategy as (typeof COMBINATION_STRATEGIES)[number]
      )
    ) {
      throw new Error(
        `internal consistency error: unknown combination strategy "${plan.strategy}" reached persistence`
      );
    }
  }

  saveCombinationPlans({
    projectId,
    createdAt: now,
    plans: plansToSave,
  });

  const savedPlans = savedPlanIds.map((id) => {
    const row = getProjectPlan(id);

    if (!row) {
      throw new Error(
        `combination plan "${id}" was not persisted`
      );
    }

    return {
      id,
      version: row.version,
      strategy: row.strategy,
      summary: row.summary,
      assignmentCount:
        listPlanResourceAssignments(id).length,
    };
  });

  return {
    pricingBasisAt,
    createdAt: now,
    plans: savedPlans,
  };
}