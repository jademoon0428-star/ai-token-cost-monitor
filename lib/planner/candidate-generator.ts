/*
 * R2 Phase 3.3-C1 Planner candidate generation.
 *
 * A pure composition layer. It owns no estimation logic of its own:
 * capability fit comes from fit-estimator, money from cost-estimator,
 * minutes from time-estimator, and ordering from strategy-rules. This
 * module only decides which models get looked at and stitches the four
 * answers into one record per model.
 *
 * It performs no database read and no database write, opens no file,
 * makes no network call, never reads the current time, never calls a
 * model, and mutates no global state. Every input arrives as an
 * argument. The same arguments always produce the same output, byte for
 * byte.
 *
 * Models come from the existing AI Registry and nowhere else. There is
 * no second model list anywhere in this file. The caller supplies
 * whatever the registry already holds, typically by flattening
 * listAiRegistry(), and this generator treats it as read-only data.
 *
 * The single most important behaviour here is what it does NOT do: it
 * does not filter. A model with no pricing stays in the result with a
 * null cost. A model with an unrecorded capability stays in with an
 * unknown fit. Neither is quietly dropped to make the list look
 * tidier, and neither is turned into a zero. An absent fact is
 * reported as an absent fact, all the way through to the caller.
 */
import type {
  RegistryModel,
  RegistryPricingRow,
} from "@/lib/registry/ai-registry-repository";
import type {
  FitStatus,
  ProjectPreference,
} from "@/lib/repositories/planner-repository";
import {
  estimatePlannerCost,
  type PlannerCostEstimate,
} from "@/lib/planner/cost-estimator";
import {
  estimatePlannerFit,
  type PlannerCapabilityFacts,
  type PlannerFitEstimate,
} from "@/lib/planner/fit-estimator";
import {
  estimatePlannerTime,
  type PlannerTimeEstimate,
} from "@/lib/planner/time-estimator";
import {
  applyPlannerStrategy,
  type PlannerStrategyCandidate,
  type PlannerStrategyResult,
} from "@/lib/planner/strategy-rules";

/*
 * Only the task columns this layer reads. The field names match
 * ProjectTaskRow exactly so a stored task row can be handed over
 * directly, but the shape is declared separately so this module cannot
 * accidentally grow a dependency on the rest of that row.
 */
export type PlannerCandidateTask = {
  category: string;
  complexity: string;
  required_capabilities: string | null;
  estimated_input_tokens_min: number | null;
  estimated_input_tokens_max: number | null;
  estimated_output_tokens_min: number | null;
  estimated_output_tokens_max: number | null;
};

/*
 * A pricing lookup, injected so the generator stays pure. The caller
 * may hand over the repository's resolveRegistryPricing, or leave it
 * out and let the built-in resolver work over the supplied models.
 */
export type PlannerPricingResolver = (
  modelId: string,
  at: string
) => RegistryPricingRow | null;

/*
 * One model considered for one planned step.
 *
 * Every measurement here is nullable on purpose. `fitStatus`,
 * `costMinMicros`, `costMaxMicros`, `costCurrency`, `timeMinMinutes`
 * and `timeMaxMinutes` all carry an explicit unknown as null. None of
 * them has a numeric default.
 *
 * `isStrategyRepresentative` records that strategy-rules surfaced this
 * candidate as one of the distinct cost or time positions worth
 * showing. It describes presentation only. It is not a judgement about
 * the model, and it is never written back anywhere: this phase
 * persists nothing and changes no stored selection.
 */
export type PlannerCandidate = {
  modelId: string;
  providerId: string;
  providerName: string;
  modelName: string;
  toolId: null;
  fitStatus: FitStatus;
  fitReason: string;
  costMinMicros: number | null;
  costMaxMicros: number | null;
  costCurrency: string | null;
  pricingBasis: string | null;
  timeMinMinutes: number | null;
  timeMaxMinutes: number | null;
  timeBasis: string | null;
  rationale: string;
  isStrategyRepresentative: boolean;
};

export type PlannerCandidateGenerationResult = {
  strategy: ProjectPreference;
  planCreatedAt: string;
  candidates: PlannerCandidate[];
  strategyBasis: string;
  strategyResult: PlannerStrategyResult;
};

/*
 * Applies the same effective-window rule that
 * resolveRegistryPricing() applies, over pricing already attached to
 * the supplied model. Kept here so the default path needs no database
 * handle at all.
 *
 * The first matching row wins, which is what the repository does too:
 * pricing arrives ordered by effective_from, so the earliest rate in
 * force is the right one.
 */
function resolvePricingAt(
  model: RegistryModel,
  at: string
): RegistryPricingRow | null {
  const match = model.pricing.find(
    (row) =>
      row.effective_from <= at &&
      (row.effective_to === null ||
        row.effective_to > at)
  );

  return match ?? null;
}

/*
 * RegistryModel.capabilities is already the tri-state shape the fit
 * estimator wants. A model with no capability row at all becomes null,
 * which the fit estimator reads as "nothing is known", not "nothing is
 * required".
 */
function toCapabilityFacts(
  model: RegistryModel
): PlannerCapabilityFacts | null {
  const capabilities = model.capabilities;

  if (capabilities === null) {
    return null;
  }

  return {
    supports_tools: capabilities.supports_tools,
    supports_vision: capabilities.supports_vision,
    supports_reasoning: capabilities.supports_reasoning,
    context_window_tokens:
      capabilities.context_window_tokens,
    max_output_tokens: capabilities.max_output_tokens,
  };
}

/*
 * Adapts a registry pricing row to the cost estimator's input shape.
 *
 * The scope limit is deliberately not passed. pricing_versions has no
 * scope column, and the cost estimator already knows the declared
 * ceiling for a model id, which arrives separately below. Re-deriving
 * it here would risk two sources of truth.
 *
 * There is no currency conversion at this boundary or anywhere below
 * it. The row's own currency is carried through untouched.
 */
function toCostPricing(
  row: RegistryPricingRow
): {
  id: string;
  currency: string;
  inputPerMillion: number;
  outputPerMillion: number;
  effectiveFrom: string;
  effectiveTo: string | null;
} {
  return {
    id: row.id,
    currency: row.currency,
    inputPerMillion: row.input_per_million,
    outputPerMillion: row.output_per_million,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
  };
}

function describeFit(
  fit: PlannerFitEstimate
): string {
  return `capability: ${fit.fitStatus} - ${fit.reason}`;
}

function describeCost(
  cost: PlannerCostEstimate
): string {
  if (
    cost.costMinMicros !== null &&
    cost.costMaxMicros !== null
  ) {
    return `pricing: known, expressed in ${cost.currency}`;
  }

  return `pricing: unknown`;
}

const PLANNER_TIME_BASIS_LABEL =
  "derived from the step, not the model";

function describeTime(
  time: PlannerTimeEstimate
): string {
  if (
    time.minMinutes !== null &&
    time.maxMinutes !== null
  ) {
    return (
      `time: task-level estimate ` +
      `${time.minMinutes}-${time.maxMinutes} min ` +
      `(${PLANNER_TIME_BASIS_LABEL})`
    );
  }

  return "time: unknown";
}

/*
 * Builds the human-readable explanation attached to a candidate.
 *
 * It states what was found and what was not, and nothing else. No
 * numeric grade, no ordinal position, no comparative judgement of the
 * model itself. Two candidates with identical facts get identical
 * text, which is the point.
 */
function buildRationale(
  fit: PlannerFitEstimate,
  cost: PlannerCostEstimate,
  time: PlannerTimeEstimate
): string {
  return [
    describeFit(fit),
    describeCost(cost),
    describeTime(time),
  ].join("; ");
}

/*
 * Generates one candidate per registered model for one planned step.
 *
 * `models` is whatever the AI Registry already holds. `planCreatedAt`
 * is frozen once here and used for every model, so every candidate in
 * a plan is priced at the same instant and the whole set is internally
 * consistent. Passing the current time is the caller's decision to
 * make, not this function's; it never looks one up.
 */
export function generatePlannerCandidates(input: {
  task: PlannerCandidateTask;
  planCreatedAt: string;
  strategy: ProjectPreference;
  models: ReadonlyArray<RegistryModel>;
  pricingResolver?: PlannerPricingResolver;
}): PlannerCandidateGenerationResult {
  const {
    task,
    planCreatedAt,
    strategy,
    models,
    pricingResolver,
  } = input;

  const resolvePricing: PlannerPricingResolver =
    pricingResolver ??
    ((modelId, at) => {
      const model = models.find(
        (entry) => entry.id === modelId
      );

      return model === undefined
        ? null
        : resolvePricingAt(model, at);
    });

  /*
   * Time is a property of the step, not of the model. It is computed
   * once and shared, so a model with no speed data cannot be given a
   * different number here.
   */
  const time = estimatePlannerTime({
    category: task.category,
    complexity: task.complexity,
  });

  const built = models.map((model) => {
    const fit = estimatePlannerFit({
      requiredCapabilitiesJson:
        task.required_capabilities,
      estimatedInputTokensMax:
        task.estimated_input_tokens_max,
      estimatedOutputTokensMax:
        task.estimated_output_tokens_max,
      capabilities: toCapabilityFacts(model),
    });

    const pricingRow = resolvePricing(
      model.id,
      planCreatedAt
    );

    const cost = estimatePlannerCost({
      task: {
        estimatedInputTokensMin:
          task.estimated_input_tokens_min,
        estimatedInputTokensMax:
          task.estimated_input_tokens_max,
        estimatedOutputTokensMin:
          task.estimated_output_tokens_min,
        estimatedOutputTokensMax:
          task.estimated_output_tokens_max,
      },
      pricing:
        pricingRow === null
          ? null
          : toCostPricing(pricingRow),
      planCreatedAt,
      modelId: model.id,
    });

    return {
      model,
      fit,
      cost,
      time,
      rationale: buildRationale(fit, cost, time),
    };
  });

  /*
   * The shape strategy-rules already understands. Feeding it the real
   * estimates means no ordering rule is reimplemented here.
   */
  const strategyCandidates: PlannerStrategyCandidate[] =
    built.map((entry) => ({
      modelId: entry.model.id,
      fitStatus: entry.fit.fitStatus,
      cost: entry.cost,
      time: entry.time,
    }));

  const strategyResult = applyPlannerStrategy({
    strategy,
    candidates: strategyCandidates,
  });

  const representativeIds = new Set(
    strategyResult.representatives.map(
      (entry) => entry.modelId
    )
  );

  const byModelId = new Map(
    built.map((entry) => [
      entry.model.id,
      entry,
    ])
  );

  const candidates: PlannerCandidate[] =
    strategyResult.order.map((ordered) => {
      const entry = byModelId.get(ordered.modelId);

      if (entry === undefined) {
        throw new Error(
          `strategy-rules returned an unknown model id: ${ordered.modelId}`
        );
      }

      return {
        modelId: entry.model.id,
        providerId: entry.model.provider_id,
        providerName: entry.model.provider_name,
        modelName: entry.model.name,
        /*
         * Fixed for this phase. user_ai_tools has no real inventory
         * and no input path, so the tool dimension stays empty rather
         * than being invented or auto-bound.
         */
        toolId: null,
        fitStatus: entry.fit.fitStatus,
        fitReason: entry.fit.reason,
        costMinMicros: entry.cost.costMinMicros,
        costMaxMicros: entry.cost.costMaxMicros,
        costCurrency: entry.cost.currency,
        pricingBasis: entry.cost.pricingBasis,
        timeMinMinutes: entry.time.minMinutes,
        timeMaxMinutes: entry.time.maxMinutes,
        timeBasis: entry.time.basis,
        rationale: entry.rationale,
        isStrategyRepresentative:
          representativeIds.has(entry.model.id),
      };
    });

  return {
    strategy,
    planCreatedAt,
    candidates,
    strategyBasis: strategyResult.basis,
    strategyResult,
  };
}
