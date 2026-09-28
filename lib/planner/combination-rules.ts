/*
 * R2 Phase 3.3-A Planner combination rules.
 *
 * A pure function, and the highest layer of the planner logic that
 * still lives off-database. It takes a set of planned steps
 * (project_tasks in shape) and a set of AI resources (registered tools
 * plus registry models, normalised into one pool) and returns a small,
 * deterministic set of whole-project plans.
 *
 * What it does:
 *
 *   derives one role per step      from the step category, unless the
 *                                  caller already declared roles
 *   restricts each role to a
 *     capability-eligible pool     below_minimum is never assigned
 *   prices each step/resource pair api-equivalent via the cost
 *                                  estimator; out-of-pocket via the
 *                                  resource's own access method
 *   builds one plan per strategy   five named strategies, one plan
 *                                  each, no score, no winner
 *   de-duplicates identical plans  by their real assignment mapping
 *   sums time per project          the registry has no per-model speed,
 *                                  so every plan reports the same range
 *
 * What it deliberately does not do:
 *
 *   no score, rank, winner, best,
 *     recommended or tier          combining axes into one number would
 *                                  pretend a judgement the data cannot
 *                                  support
 *   no currency conversion         totals are null across mixed
 *                                  currencies, never silently merged
 *   no automatic registration      a registry-only resource is used as
 *                                  it is, never "promoted"
 *   no guesswork on entitlements    a free/subscription resource whose
 *                                  entitlement is not confirmed has an
 *                                  unknown out-of-pocket cost
 *   no database, clock, network,
 *     randomness or state          deterministic byte for byte
 */
import type { FitStatus } from "@/lib/repositories/planner-repository";
import { estimatePlannerCost } from "@/lib/planner/cost-estimator";
import type { PlannerCostPricing } from "@/lib/planner/cost-estimator";
import { estimatePlannerFit } from "@/lib/planner/fit-estimator";
import type { PlannerCapabilityFacts } from "@/lib/planner/fit-estimator";
import { estimatePlannerTime } from "@/lib/planner/time-estimator";
import { PLANNER_TIME_BASIS_VERSION } from "@/lib/planner/time-estimator";

export const PLANNER_ROLES: ReadonlyArray<string> = Object.freeze([
  "implementer",
  "reviewer",
  "researcher",
  "designer",
  "assistant",
]);

export type PlannerRole =
  | "implementer"
  | "reviewer"
  | "researcher"
  | "designer"
  | "assistant";

export type CombinationRoleSource =
  | "default_from_category"
  | "user";

/*
 * Not every planned step names a human role, so a step without explicit
 * role assignments gets one role derived from its category. The map is
 * the whole decision surface, written so it can be reviewed in one
 * screen; a category with no entry falls back to assistant.
 */
export const DEFAULT_ROLE_BY_CATEGORY: Readonly<
  Record<string, PlannerRole>
> = Object.freeze({
  planning: "assistant",
  architecture: "researcher",
  research: "researcher",
  ui_design: "designer",
  coding: "implementer",
  debugging: "implementer",
  testing: "reviewer",
  documentation: "assistant",
  review: "reviewer",
  deployment: "implementer",
});

export const DEFAULT_ROLE_FALLBACK: PlannerRole = "assistant";

/*
 * The five named strategies, used verbatim in plan labels and basis
 * strings. The order of the array is the order the plans are produced,
 * which is also the report order after de-duplication.
 */
export const COMBINATION_STRATEGIES: ReadonlyArray<CombinationStrategyId> =
  Object.freeze([
    "existing",
    "cost_conscious",
    "mixed",
    "subscription",
    "registry_expanded",
  ]);

export type CombinationStrategyId =
  | "existing"
  | "cost_conscious"
  | "mixed"
  | "subscription"
  | "registry_expanded";

export type CombinationAccessMethod =
  | "free_tier"
  | "subscription"
  | "pay_as_you_go";

export type CombinationTaskRole = {
  role: PlannerRole;
};

/*
 * One planned step, shaped like the project_tasks columns the planners
 * read but carrying no primary key of its own. `projectTaskId` is the
 * caller's reference and is never renumbered or guessed.
 */
export type CombinationTask = {
  projectTaskId: string;
  category: string;
  complexity: string;
  requiredCapabilitiesJson: string | null;
  estimatedInputTokensMin: number | null;
  estimatedInputTokensMax: number | null;
  estimatedOutputTokensMin: number | null;
  estimatedOutputTokensMax: number | null;
  roleAssignments?: ReadonlyArray<CombinationTaskRole>;
};

/*
 * One resource in the combined pool. `source` says where it came from:
 * "registered" is a tool the user explicitly registered in ai_resources,
 * "registry" is a model that only exists in the AI Registry. The two
 * are never confused with each other, and "not registered" is never
 * read as "free" or "unavailable".
 */
export type CombinationResource = {
  candidateResourceId: string;
  source: "registered" | "registry";
  modelId: string;
  modelName: string | null;
  providerName: string | null;
  toolId: string | null;
  toolName: string | null;
  accessMethod: CombinationAccessMethod | null;
  entitlementConfirmed: boolean;
  capabilities: PlannerCapabilityFacts | null;
  pricing: PlannerCostPricing | null;
};

export type CombinationCostFacts = {
  costMinMicros: number | null;
  costMaxMicros: number | null;
  currency: string | null;
  basis: string | null;
};

export type CombinationAssignment = {
  projectTaskId: string;
  candidateResourceId: string;
  source: "registered" | "registry";
  modelId: string;
  modelName: string | null;
  toolId: string | null;
  toolName: string | null;
  accessMethod: CombinationAccessMethod | null;
  role: PlannerRole;
  roleSource: CombinationRoleSource;
  fitStatus: FitStatus;
  fitReason: string;
  apiEquivalent: CombinationCostFacts;
  outOfPocket: CombinationCostFacts;
  rationale: string;
};

export type CombinationTotals = {
  costMinMicros: number | null;
  costMaxMicros: number | null;
  currency: string | null;
};

export type CombinationPlan = {
  label: string;
  strategy: CombinationStrategyId;
  mappingKey: string;
  assignments: CombinationAssignment[];
  apiEquivalentTotals: CombinationTotals;
  outOfPocketTotals: CombinationTotals;
  totalEstimatedMinMinutes: number | null;
  totalEstimatedMaxMinutes: number | null;
  timeBasis: string;
  note: string;
};

export type CombinationEvaluation = {
  planCreatedAt: string;
  strategies: CombinationStrategyId[];
  plans: CombinationPlan[];
  totalEstimatedMinMinutes: number | null;
  totalEstimatedMaxMinutes: number | null;
  timeBasis: string;
  note: string;
};

function assertValidRole(
  role: unknown
): asserts role is PlannerRole {
  if (
    typeof role !== "string" ||
    !(PLANNER_ROLES as ReadonlyArray<string>).includes(role)
  ) {
    throw new Error(
      `invalid role "${String(role)}": must be one of ${PLANNER_ROLES.join(", ")}`
    );
  }
}

function assertValidResourceId(id: unknown): void {
  if (
    typeof id !== "string" ||
    id.trim() === ""
  ) {
    throw new Error(
      "candidateResourceId must be a non-empty string"
    );
  }
}

function assertValidSource(
  source: unknown
): asserts source is "registered" | "registry" {
  if (source !== "registered" && source !== "registry") {
    throw new Error(
      `invalid source "${String(source)}": must be "registered" or "registry"`
    );
  }
}

function isInstant(value: string): boolean {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    Number.isFinite(Date.parse(value))
  );
}

function isKnownCost(
  facts: CombinationCostFacts
): boolean {
  return (
    facts.costMinMicros !== null &&
    facts.costMaxMicros !== null &&
    typeof facts.currency === "string" &&
    facts.currency.trim() !== ""
  );
}

function formatCost(
  facts: CombinationCostFacts
): string {
  if (!isKnownCost(facts)) {
    return "unknown";
  }

  return `${facts.costMinMicros}-${facts.costMaxMicros} micros in ${facts.currency}`;
}

/*
 * Derives the role for a step that declared none. The category map
 * above is applied in full; only a category absent from the map falls
 * back to assistant, and that is stated rather than hidden.
 */
export function derivePlannerRole(category: string): {
  role: PlannerRole;
  roleSource: CombinationRoleSource;
} {
  const derived = DEFAULT_ROLE_BY_CATEGORY[category];

  if (derived === undefined) {
    return {
      role: DEFAULT_ROLE_FALLBACK,
      roleSource: "default_from_category",
    };
  }

  return {
    role: derived,
    roleSource: "default_from_category",
  };
}

/*
 * Reads a step's declared roles. When the step declares none it yields
 * a single derived role. Duplicate roles within one step are rejected
 * outright: a step cannot be assigned the implementer twice.
 */
function rolesForTask(
  task: CombinationTask
): Array<{
  role: PlannerRole;
  roleSource: CombinationRoleSource;
}> {
  const declared = task.roleAssignments;

  if (
    declared === undefined ||
    declared.length === 0
  ) {
    const derived = derivePlannerRole(task.category);

    return [
      {
        role: derived.role,
        roleSource: derived.roleSource,
      },
    ];
  }

  const seen = new Set<string>();

  for (const entry of declared) {
    const role = entry.role;
    assertValidRole(role);

    if (seen.has(role)) {
      throw new Error(
        `duplicate role "${role}" in task ${task.projectTaskId}`
      );
    }

    seen.add(role);
  }

  return declared.map((entry) => ({
    role: entry.role,
    roleSource: "user" as const,
  }));
}

/*
 * Estimates whether one resource can handle one step, delegating to the
 * fit estimator so the tri-state rules live in exactly one place.
 */
function fitForTaskResource(
  task: CombinationTask,
  resource: CombinationResource
): { fitStatus: FitStatus; reason: string } {
  const fit = estimatePlannerFit({
    requiredCapabilitiesJson: task.requiredCapabilitiesJson,
    estimatedInputTokensMax: task.estimatedInputTokensMax,
    estimatedOutputTokensMax: task.estimatedOutputTokensMax,
    capabilities: resource.capabilities,
  });

  return {
    fitStatus: fit.fitStatus,
    reason: fit.reason,
  };
}

/*
 * A resource can be assigned to a step only when the registry has not
 * refused it. below_minimum is a stated failure and is never offered;
 * unknown stays assignable because unknown is not a refusal.
 */
function isEligible(
  fitStatus: FitStatus
): boolean {
  return fitStatus !== "below_minimum";
}

function costPricing(
  task: CombinationTask
): {
  estimatedInputTokensMin: number | null;
  estimatedInputTokensMax: number | null;
  estimatedOutputTokensMin: number | null;
  estimatedOutputTokensMax: number | null;
} {
  return {
    estimatedInputTokensMin: task.estimatedInputTokensMin,
    estimatedInputTokensMax: task.estimatedInputTokensMax,
    estimatedOutputTokensMin: task.estimatedOutputTokensMin,
    estimatedOutputTokensMax: task.estimatedOutputTokensMax,
  };
}

/*
 * The api-equivalent cost of one step on one resource, delegated to the
 * cost estimator with the frozen plan instant.
 */
function apiEquivalentFor(
  task: CombinationTask,
  resource: CombinationResource,
  planCreatedAt: string
): CombinationCostFacts {
  const estimated = estimatePlannerCost({
    task: costPricing(task),
    pricing: resource.pricing,
    planCreatedAt,
    modelId: resource.modelId,
  });

  return {
    costMinMicros: estimated.costMinMicros,
    costMaxMicros: estimated.costMaxMicros,
    currency: estimated.currency,
    basis: estimated.pricingBasis,
  };
}

/*
 * The out-of-pocket cost is not derivable from the api-equivalent cost
 * because the two answer different questions:
 *
 *   free_tier / subscription  with the entitlement confirmed, the
 *                             out-of-pocket cost is zero by definition;
 *                             the same access without a confirmed
 *                             entitlement is unknown, never assumed
 *   pay_as_you_go             the out-of-pocket cost equals the
 *                             api-equivalent cost of the request
 *   unknown access            unknown; nothing is guessed
 */
function outOfPocketFor(
  resource: CombinationResource,
  apiEquivalent: CombinationCostFacts
): CombinationCostFacts {
  const access = resource.accessMethod;

  if (
    access === "free_tier" ||
    access === "subscription"
  ) {
    if (resource.entitlementConfirmed) {
      return {
        costMinMicros: 0,
        costMaxMicros: 0,
        currency: apiEquivalent.currency,
        basis:
          `out-of-pocket cost is zero because the ${access} entitlement is confirmed`,
      };
    }

    return {
      costMinMicros: null,
      costMaxMicros: null,
      currency: null,
      basis:
        `out-of-pocket cost unknown: the ${access} entitlement is not confirmed`,
    };
  }

  if (access === "pay_as_you_go") {
    return {
      costMinMicros: apiEquivalent.costMinMicros,
      costMaxMicros: apiEquivalent.costMaxMicros,
      currency: apiEquivalent.currency,
      basis:
        "out-of-pocket cost equals the api-equivalent cost because the access method is pay_as_you_go",
    };
  }

  return {
    costMinMicros: null,
    costMaxMicros: null,
    currency: null,
    basis:
      "out-of-pocket cost unknown: the resource access method is not recorded",
  };
}

function describeResource(
  resource: CombinationResource
): string {
  const tool =
    resource.toolId === null
      ? "no tool"
      : `tool ${resource.toolId}`;

  const access =
    resource.accessMethod === null
      ? "unknown access"
      : resource.accessMethod;

  return `${resource.source} resource ${resource.candidateResourceId} (model ${resource.modelId}, ${tool}, ${access})`;
}

function buildRationale(
  task: CombinationTask,
  resource: CombinationResource,
  role: PlannerRole,
  roleSource: CombinationRoleSource,
  fit: { fitStatus: FitStatus; reason: string },
  apiEquivalent: CombinationCostFacts,
  outOfPocket: CombinationCostFacts
): string {
  return (
    `step ${task.projectTaskId} role ${role} (${roleSource}); ` +
    `capability fit=${fit.fitStatus}; ` +
    `api-equivalent cost=${formatCost(apiEquivalent)}; ` +
    `out-of-pocket cost=${formatCost(outOfPocket)}; ` +
    `assigned ${describeResource(resource)}`
  );
}

/*
 * One step's worth of estimation for every resource in the pool, worked
 * out once per step so each strategy compares the same facts.
 */
type StepAssessment = {
  resource: CombinationResource;
  fit: { fitStatus: FitStatus; reason: string };
  apiEquivalent: CombinationCostFacts;
  outOfPocket: CombinationCostFacts;
};

function assessStep(
  task: CombinationTask,
  pool: ReadonlyArray<CombinationResource>,
  planCreatedAt: string
): StepAssessment[] {
  return pool.map((resource) => {
    const apiEquivalent = apiEquivalentFor(
      task,
      resource,
      planCreatedAt
    );

    return {
      resource,
      fit: fitForTaskResource(task, resource),
      apiEquivalent,
      outOfPocket: outOfPocketFor(
        resource,
        apiEquivalent
      ),
    };
  });
}

/*
 * Sorts one step's eligible pool into the pick order of one strategy.
 * Every comparator ends in candidateResourceId so the order can never
 * be ambiguous, and the input array is never mutated.
 */
function orderByStrategy(
  strategy: CombinationStrategyId,
  eligible: StepAssessment[]
): StepAssessment[] {
  const byId = (
    a: StepAssessment,
    b: StepAssessment
  ): number =>
    a.resource.candidateResourceId <
    b.resource.candidateResourceId
      ? -1
      : a.resource.candidateResourceId >
          b.resource.candidateResourceId
        ? 1
        : 0;

  const sourceOrder = (
    assessment: StepAssessment
  ): number =>
    assessment.resource.source === "registered" ? 0 : 1;

  const bySourceThenId = (
    a: StepAssessment,
    b: StepAssessment
  ): number => {
    const bySource = sourceOrder(a) - sourceOrder(b);

    return bySource !== 0 ? bySource : byId(a, b);
  };

  const byCostThenId = (
    a: StepAssessment,
    b: StepAssessment
  ): number => {
    const oopA = isKnownCost(a.outOfPocket);
    const oopB = isKnownCost(b.outOfPocket);

    if (oopA !== oopB) {
      return oopA ? -1 : 1;
    }

    if (oopA && oopB) {
      if (
        a.outOfPocket.costMinMicros !== b.outOfPocket.costMinMicros
      ) {
        return a.outOfPocket.costMinMicros! - b.outOfPocket.costMinMicros!;
      }

      if (
        a.outOfPocket.costMaxMicros !== b.outOfPocket.costMaxMicros
      ) {
        return a.outOfPocket.costMaxMicros! - b.outOfPocket.costMaxMicros!;
      }
    }

    const apiA = isKnownCost(a.apiEquivalent);
    const apiB = isKnownCost(b.apiEquivalent);

    if (apiA !== apiB) {
      return apiA ? -1 : 1;
    }

    if (apiA && apiB) {
      if (
        a.apiEquivalent.costMinMicros !== b.apiEquivalent.costMinMicros
      ) {
        return a.apiEquivalent.costMinMicros! - b.apiEquivalent.costMinMicros!;
      }

      if (
        a.apiEquivalent.costMaxMicros !== b.apiEquivalent.costMaxMicros
      ) {
        return a.apiEquivalent.costMaxMicros! - b.apiEquivalent.costMaxMicros!;
      }
    }

    return byId(a, b);
  };

  const sorted = [...eligible];

  if (strategy === "existing") {
    return sorted.sort(bySourceThenId);
  }

  if (strategy === "registry_expanded") {
    return sorted.sort(
      (a, b) => sourceOrder(b) - sourceOrder(a) || byId(a, b)
    );
  }

  if (strategy === "cost_conscious") {
    return sorted.sort(byCostThenId);
  }

  if (strategy === "subscription") {
    const accessRank = (
      assessment: StepAssessment
    ): number => {
      if (assessment.resource.accessMethod === "free_tier") {
        return 0;
      }

      if (assessment.resource.accessMethod === "subscription") {
        return 1;
      }

      if (assessment.resource.accessMethod === "pay_as_you_go") {
        return 2;
      }

      return 3;
    };

    return sorted.sort(
      (a, b) => {
        const byAccess = accessRank(a) - accessRank(b);

        if (byAccess !== 0) {
          return byAccess;
        }

        return byCostThenId(a, b);
      }
    );
  }

  throw new Error(`unknown strategy "${strategy}"`);
}

function buildPlan(
  strategy: CombinationStrategyId,
  tasks: ReadonlyArray<CombinationTask>,
  pool: ReadonlyArray<CombinationResource>,
  planCreatedAt: string,
  time: {
    totalEstimatedMinMinutes: number | null;
    totalEstimatedMaxMinutes: number | null;
    timeBasis: string;
  }
): CombinationPlan | null {
  const sortKey = (
    assignment: CombinationAssignment
  ): string =>
    `${assignment.projectTaskId}|${assignment.role}|${assignment.candidateResourceId}`;

  const assignments: CombinationAssignment[] = [];
  let mixCursor = 0;

  for (const task of tasks) {
    const roles = rolesForTask(task);

    const assessments = assessStep(task, pool, planCreatedAt);
    const eligible = assessments.filter((entry) =>
      isEligible(entry.fit.fitStatus)
    );

    if (eligible.length === 0) {
      return null;
    }

    /*
     * "mixed" walks the existing-strategy order, picking the next slot
     * from where the previous slot stopped. Every other strategy uses
     * one single pick order for the whole step and takes its head for
     * every role, because those strategies are statements about which
     * resource a project would run on, not about how to divide roles.
     */
    const order = orderByStrategy(
      strategy === "mixed" ? "existing" : strategy,
      eligible
    );

    const pickHeads = strategy !== "mixed";

    for (const roleEntry of roles) {
      const chosen = pickHeads
        ? order[0]
        : order[mixCursor % order.length];

      mixCursor += 1;

      assignments.push({
        projectTaskId: task.projectTaskId,
        candidateResourceId: chosen.resource.candidateResourceId,
        source: chosen.resource.source,
        modelId: chosen.resource.modelId,
        modelName: chosen.resource.modelName,
        toolId: chosen.resource.toolId,
        toolName: chosen.resource.toolName,
        accessMethod: chosen.resource.accessMethod,
        role: roleEntry.role,
        roleSource: roleEntry.roleSource,
        fitStatus: chosen.fit.fitStatus,
        fitReason: chosen.fit.reason,
        apiEquivalent: chosen.apiEquivalent,
        outOfPocket: chosen.outOfPocket,
        rationale: buildRationale(
          task,
          chosen.resource,
          roleEntry.role,
          roleEntry.roleSource,
          chosen.fit,
          chosen.apiEquivalent,
          chosen.outOfPocket
        ),
      });
    }
  }

  const mappingKey = assignments
    .map(sortKey)
    .sort()
    .join(";");

  return {
    label: "",
    strategy,
    mappingKey,
    assignments,
    apiEquivalentTotals: sumCosts(assignments, "api"),
    outOfPocketTotals: sumCosts(assignments, "oop"),
    totalEstimatedMinMinutes: time.totalEstimatedMinMinutes,
    totalEstimatedMaxMinutes: time.totalEstimatedMaxMinutes,
    timeBasis: time.timeBasis,
    note:
      "Plan time is the project-wide range, which is the same for every plan because the registry records no per-model speed data.",
  };
}

function planLabel(index: number): string {
  if (index < 26) {
    return `Plan ${String.fromCharCode(65 + index)}`;
  }

  return `Plan ${index + 1}`;
}

/*
 * Sums one cost axis across a plan. The total is reported only when
 * every assignment on that axis carries a known cost and currency and
 * all share one currency; a single unknown or a single mixed currency
 * makes the whole total null. Micros are integers, so the sum is exact.
 */
function sumCosts(
  assignments: ReadonlyArray<CombinationAssignment>,
  axis: "api" | "oop"
): CombinationTotals {
  const unknown: CombinationTotals = {
    costMinMicros: null,
    costMaxMicros: null,
    currency: null,
  };

  let sumMin = 0;
  let sumMax = 0;
  let currency: string | null = null;

  for (const assignment of assignments) {
    const facts =
      axis === "api"
        ? assignment.apiEquivalent
        : assignment.outOfPocket;

    if (!isKnownCost(facts)) {
      return unknown;
    }

    sumMin += facts.costMinMicros!;
    sumMax += facts.costMaxMicros!;

    if (currency === null) {
      currency = facts.currency;
    } else if (currency !== facts.currency) {
      return unknown;
    }
  }

  if (assignments.length === 0) {
    return unknown;
  }

  return {
    costMinMicros: sumMin,
    costMaxMicros: sumMax,
    currency,
  };
}

/*
 * Normalises the pool so the same surface does not appear twice. Two
 * rows with the same source, model, tool and access method are the same
 * resource; the first occurrence in caller order wins. Two rows that
 * differ in access method stay distinct, because a model reached two
 * ways is priced two ways.
 */
function normalisePool(
  resources: ReadonlyArray<CombinationResource>
): CombinationResource[] {
  const seen = new Set<string>();
  const pool: CombinationResource[] = [];

  for (const resource of resources) {
    assertValidResourceId(resource.candidateResourceId);
    assertValidSource(resource.source);

    const key =
      `${resource.source}|${resource.modelId}|${resource.toolId ?? ""}|${resource.accessMethod ?? ""}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    pool.push(resource);
  }

  return pool;
}

/*
 * Sums the per-step time ranges sequentially across the project. The
 * registry has no per-model latency or speed, so the range depends only
 * on what each step says it is, and every plan in one evaluation reports
 * the same total.
 */
function timeSummary(
  tasks: ReadonlyArray<CombinationTask>
): {
  totalEstimatedMinMinutes: number | null;
  totalEstimatedMaxMinutes: number | null;
  timeBasis: string;
} {
  const perTask = tasks.map((task) =>
    estimatePlannerTime({
      category: task.category,
      complexity: task.complexity,
    })
  );

  let totalMin = 0;
  let totalMax = 0;

  for (const estimate of perTask) {
    if (
      estimate.minMinutes === null ||
      estimate.maxMinutes === null
    ) {
      return {
        totalEstimatedMinMinutes: null,
        totalEstimatedMaxMinutes: null,
        timeBasis:
          `unknown time: ${PLANNER_TIME_BASIS_VERSION} cannot price every step, ` +
          "so the project total is not reported",
      };
    }

    totalMin += estimate.minMinutes;
    totalMax += estimate.maxMinutes;
  }

  return {
    totalEstimatedMinMinutes: totalMin,
    totalEstimatedMaxMinutes: totalMax,
    timeBasis:
      `${PLANNER_TIME_BASIS_VERSION}; ` +
      `sequential sum across ${tasks.length} step(s); ` +
      "no per-model speed data exists in the registry",
  };
}

/*
 * Builds the whole-project plan report.
 *
 * Validation is strict and upfront: a step that duplicates a role, a
 * resource without an id and a step using an unknown strategy name all
 * throw, because each is a caller bug that a silent default would hide.
 */
export function evaluateCombinations(input: {
  planCreatedAt: string;
  tasks: ReadonlyArray<CombinationTask>;
  resources: ReadonlyArray<CombinationResource>;
}): CombinationEvaluation {
  const { planCreatedAt, tasks, resources } = input;

  if (!isInstant(planCreatedAt)) {
    throw new Error(
      `planCreatedAt "${String(planCreatedAt)}" is not a valid instant`
    );
  }

  const pool = normalisePool(resources);
  const time = timeSummary(tasks);

  const seenKeys = new Set<string>();
  const plans: CombinationPlan[] = [];

  for (const strategy of COMBINATION_STRATEGIES) {
    const plan = buildPlan(
      strategy,
      tasks,
      pool,
      planCreatedAt,
      time
    );

    if (plan === null || seenKeys.has(plan.mappingKey)) {
      continue;
    }

    seenKeys.add(plan.mappingKey);

    plans.push({
      ...plan,
      label: planLabel(plans.length),
    });
  }

  return {
    planCreatedAt,
    strategies: [...COMBINATION_STRATEGIES],
    plans,
    totalEstimatedMinMinutes: time.totalEstimatedMinMinutes,
    totalEstimatedMaxMinutes: time.totalEstimatedMaxMinutes,
    timeBasis: time.timeBasis,
    note:
      "Plans are named by the strategy that produced them. Combined totals are " +
      "reported only when every component is known and in one currency. " +
      "Plans are presented as facts, never as a judgement.",
  };
}