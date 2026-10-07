/*
 * R2 Phase 3.3-C1 Planner candidate generation.
 *
 * A pure composition layer. It owns no estimation logic of its own:
 * capability fit comes from fit-estimator, money from cost-estimator,
 * minutes from time-estimator, and ordering from strategy-rules. This
 * module only decides which resources get looked at and stitches the
 * four answers into one record per resource.
 *
 * It performs no database read and no database write, opens no file,
 * makes no network call, never reads the current time, never calls a
 * model, and mutates no global state. Every input arrives as an
 * argument. The same arguments always produce the same output, byte for
 * byte.
 *
 * The thing to look at is an entry of the AI Resource Universe, which
 * is the registry plus the user's active registered resources,
 * assembled by lib/planner/resource-universe. The caller supplies that
 * list. When a caller supplies only the plain registry model list it
 * used to supply, each model is lifted into the same shape first, so
 * there is still exactly one candidate path in this file and no second
 * model list has appeared anywhere.
 *
 * The single most important behaviour here is what it does NOT do: it
 * does not filter. A model with no pricing stays in the result with a
 * null cost. A model with an unrecorded capability stays in with an
 * unknown fit. A resource this app cannot reach stays in with an
 * availability of "external" or "unknown". None is quietly dropped to
 * make the list look tidier, and none is turned into a zero. An absent
 * fact is reported as an absent fact, all the way through to the
 * caller.
 */
import type {
  RegistryModel,
  RegistryPricingRow,
} from "@/lib/registry/ai-registry-repository";
import type {
  FitStatus,
  ProjectPreference,
} from "@/lib/repositories/planner-repository";
import type {
  AiResourceChannel,
} from "@/lib/repositories/ai-resource-repository";
import type {
  ResourceAvailabilityState,
  ResourceCapabilityState,
  ResourceEntitlementState,
  ResourcePricingState,
  ResourceRegistrationState,
  ResourceSource,
  ResourceUniverseEntry,
} from "@/lib/planner/resource-universe";
import { buildRegistryEntry } from "@/lib/planner/resource-universe";
import {
  estimatePlannerCost,
  type PlannerCostEstimate,
} from "@/lib/planner/cost-estimator";
import {
  estimatePlannerFit,
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
 * One resource considered for one planned step.
 *
 * Every measurement here is nullable on purpose. `fitStatus`,
 * `costMinMicros`, `costMaxMicros`, `costCurrency`, `timeMinMinutes`
 * and `timeMaxMinutes` all carry an explicit unknown as null. None of
 * them has a numeric default.
 *
 * The reference side is nullable the same way and for the same reason:
 * `modelId` names the registry model this candidate is about, and it
 * stays nullable only because the stored column is. Every candidate
 * this generator builds carries a registry model.
 *
 * `resourceSource` and the five state fields say where the resource
 * came from and what is currently known about it. They are provenance
 * and facts, not judgement: a source never implies better or worse,
 * and every one of them has an explicit unknown arm that is taken
 * rather than guessed.
 *
 * `isStrategyRepresentative` records that strategy-rules surfaced this
 * candidate as one of the distinct cost or time positions worth
 * showing. It describes presentation only. It is not a judgement about
 * the model, and it is never written back anywhere: this phase
 * persists nothing and changes no stored selection.
 */
export type PlannerCandidate = {
  modelId: string | null;
  resourceSource: ResourceSource;
  registrationState: ResourceRegistrationState;
  channel: AiResourceChannel;
  entitlement: ResourceEntitlementState;
  availability: ResourceAvailabilityState;
  pricingState: ResourcePricingState;
  capabilityState: ResourceCapabilityState;
  providerId: string | null;
  providerName: string | null;
  modelName: string | null;
  displayName: string;
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
 * Generates one candidate per resource for one planned step.
 *
 * `universe` carries everything worth showing for this plan: registry
 * models and the user's active registered resources, in one list. It
 * is optional only so the plain `models` shape the earlier phases
 * supplied keeps working; when it is absent, every supplied model is
 * lifted into the same entry shape first, so both inputs run through a
 * single candidate path and produce the same output for the same
 * facts.
 *
 * `planCreatedAt` is frozen once here and used for every resource, so
 * every candidate in a plan is priced at the same instant and the whole
 * set is internally consistent. Passing the current time is the
 * caller's decision to make, not this function's; it never looks one
 * up.
 */
export function generatePlannerCandidates(input: {
  task: PlannerCandidateTask;
  planCreatedAt: string;
  strategy: ProjectPreference;
  models: ReadonlyArray<RegistryModel>;
  universe?: ReadonlyArray<ResourceUniverseEntry>;
  pricingResolver?: PlannerPricingResolver;
}): PlannerCandidateGenerationResult {
  const {
    task,
    planCreatedAt,
    strategy,
    models,
    universe,
    pricingResolver,
  } = input;

  const entries: ResourceUniverseEntry[] =
    universe === undefined
      ? models.map(buildRegistryEntry)
      : [...universe];

  /*
   * The default resolver only ever sees registry models. The lookup
   * covers both the supplied model list and whatever the universe
   * already carries, so handing over a universe without repeating the
   * model list still resolves the same rates.
   */
  const modelsById = new Map<string, RegistryModel>();

  for (const model of models) {
    modelsById.set(model.id, model);
  }

  for (const entry of entries) {
    if (entry.registryModel !== null) {
      modelsById.set(
        entry.registryModel.id,
        entry.registryModel
      );
    }
  }

  const resolvePricing: PlannerPricingResolver =
    pricingResolver ??
    ((modelId, at) => {
      const model = modelsById.get(modelId);

      return model === undefined
        ? null
        : resolvePricingAt(model, at);
    });

  /*
   * Time is a property of the step, not of the resource. It is computed
   * once and shared, so a resource with no speed data cannot be given a
   * different number here.
   */
  const time = estimatePlannerTime({
    category: task.category,
    complexity: task.complexity,
  });

  const built = entries.map((entry) => {
    const fit = estimatePlannerFit({
      requiredCapabilitiesJson:
        task.required_capabilities,
      estimatedInputTokensMax:
        task.estimated_input_tokens_max,
      estimatedOutputTokensMax:
        task.estimated_output_tokens_max,
      capabilities: entry.capabilities,
    });

    const pricingRow =
      entry.modelId === null
        ? null
        : resolvePricing(entry.modelId, planCreatedAt);

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
      modelId: entry.modelId,
    });

    /*
     * The pricing state of this candidate, as opposed to the one the
     * universe records. It is the estimate that decides: a rate exists
     * only if a figure came out at the plan's frozen instant, and "no
     * rate covers this instant" is an unknown, never a free.
     */
    const costIsKnown =
      cost.costMinMicros !== null &&
      cost.costMaxMicros !== null;

    const pricingState: ResourcePricingState =
      costIsKnown ? "known" : "unknown";

    const pricingBasis = cost.pricingBasis;

    return {
      entry,
      fit,
      cost,
      time,
      pricingState,
      pricingBasis,
      rationale: buildRationale(fit, cost, time),
    };
  });

  /*
   * The shape strategy-rules already understands. Feeding it the real
   * estimates means no ordering rule is reimplemented here. The id it
   * carries is a resource key; strategy-rules treats it as an opaque
   * label and hands it straight back.
   */
  const strategyCandidates: PlannerStrategyCandidate[] =
    built.map((item) => ({
      modelId: item.entry.key,
      fitStatus: item.fit.fitStatus,
      cost: item.cost,
      time: item.time,
    }));

  const strategyResult = applyPlannerStrategy({
    strategy,
    candidates: strategyCandidates,
  });

  const representativeKeys = new Set(
    strategyResult.representatives.map(
      (entry) => entry.modelId
    )
  );

  const byKey = new Map(
    built.map((item) => [item.entry.key, item])
  );

  const candidates: PlannerCandidate[] =
    strategyResult.order.map((ordered) => {
      const item = byKey.get(ordered.modelId);

      if (item === undefined) {
        throw new Error(
          `strategy-rules returned an unknown resource key: ${ordered.modelId}`
        );
      }

      const entry = item.entry;

      return {
        modelId: entry.modelId,
        resourceSource: entry.source,
        registrationState: entry.registrationState,
        channel: entry.channel,
        entitlement: entry.entitlement,
        availability: entry.availability,
        pricingState: item.pricingState,
        capabilityState: entry.capabilityState,
        providerId: entry.providerId,
        providerName: entry.providerName,
        modelName: entry.modelName,
        displayName: entry.displayName,
        /*
         * Fixed for this phase. user_ai_tools has no real inventory
         * and no input path, so the tool dimension stays empty rather
         * than being invented or auto-bound.
         */
        toolId: null,
        fitStatus: item.fit.fitStatus,
        fitReason: item.fit.reason,
        costMinMicros: item.cost.costMinMicros,
        costMaxMicros: item.cost.costMaxMicros,
        costCurrency: item.cost.currency,
        pricingBasis: item.pricingBasis,
        timeMinMinutes: item.time.minMinutes,
        timeMaxMinutes: item.time.maxMinutes,
        timeBasis: item.time.basis,
        rationale: item.rationale,
        isStrategyRepresentative: representativeKeys.has(
          entry.key
        ),
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
