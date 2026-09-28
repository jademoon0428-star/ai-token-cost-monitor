/*
 * R2 Phase 3.3-B Planner cost estimator.
 *
 * A pure function. It opens no database, reads no file, makes no
 * network call, holds no state and depends on no clock of its own:
 * the pricing instant is always passed in as `planCreatedAt`.
 *
 * Formula (fixed by the Phase 3.3-A rules):
 *
 *   cost_min = input_min  * input_price  +  output_min * output_price
 *   cost_max = input_max  * input_price  +  output_max * output_price
 *
 * Only input and output tokens are used. There is deliberately no
 * cached and no reasoning term: `project_tasks` has no cached or
 * reasoning token estimate, and `estimated_output_tokens_*` is
 * officially defined as the step's TOTAL expected output tokens, which
 * already includes any reasoning tokens. Adding a reasoning term on
 * top would double-count it.
 *
 * Every component is rounded on its own and the rounded values are
 * then added, mirroring cost-engine.ts exactly.
 *
 * Unknown is a first-class answer, never a zero. If a complete and
 * reliable range cannot be formed, all three of costMinMicros,
 * costMaxMicros and currency are null together.
 *
 * No currency conversion happens here. The returned currency is the
 * one carried by the pricing row and nothing else.
 */

/*
 * Input token ceiling that a seeded pricing row actually covers.
 *
 * pricing_versions has no scope column, so the scope statement lives
 * only in the seed manifest (ai-registry-seed.ts, `scope`). These
 * limits mirror those statements for the rows whose scope is narrower
 * than the model headline context window, so the estimator refuses to
 * price an estimate that the rate does not cover instead of quietly
 * understating it.
 *
 * A caller may also pass `inputScopeLimitTokens` directly on a
 * pricing row; an explicit value always wins.
 */
export const DECLARED_INPUT_SCOPE_LIMITS: Readonly<
  Record<string, number>
> = Object.freeze({
  provider_openai_gpt_5_6_sol: 272000,
  provider_openai_gpt_5_6_terra: 272000,
  provider_openai_gpt_5_6_luna: 272000,
});

/*
 * The only token fields the cost estimator reads. It deliberately does
 * not accept a whole task row so it can never reach a column it has no
 * business reading.
 */
export type PlannerCostTask = {
  estimatedInputTokensMin: number | null;
  estimatedInputTokensMax: number | null;
  estimatedOutputTokensMin: number | null;
  estimatedOutputTokensMax: number | null;
};

/*
 * The pricing facts needed to price one model at one instant. This
 * mirrors the shape of RegistryPricingRow plus the two provenance
 * extras the estimator may report in its basis string.
 */
export type PlannerCostPricing = {
  id: string;
  currency: string;
  inputPerMillion: number;
  outputPerMillion: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  inputScopeLimitTokens?: number | null;
  sourceUrl?: string | null;
};

export type PlannerCostEstimate = {
  costMinMicros: number | null;
  costMaxMicros: number | null;
  currency: string | null;
  pricingBasis: string | null;
};

/*
 * Identical rounding contract to cost-engine.ts: micros = round(
 * (tokens / 1e6) * perMillion * 1e6 ), which is round(tokens *
 * perMillion). Kept byte-for-byte in behaviour so a planned figure and
 * a later measured figure for the same token count agree exactly.
 */
function costMicros(
  tokens: number,
  pricePerMillion: number
): number {
  return Math.round(
    (tokens / 1_000_000) *
      pricePerMillion *
      1_000_000
  );
}

function isTokenCount(
  value: number | null
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isRate(
  value: number | null
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
  );
}

function isInstant(
  value: string | null
): value is string {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    Number.isFinite(
      Date.parse(value)
    )
  );
}

/*
 * A pricing row may be used only if it is actually in force at the
 * plan's creation instant. This is what keeps an old plan from being
 * repriced by whatever today's card happens to be.
 */
function coversInstant(
  pricing: PlannerCostPricing,
  at: string
): boolean {
  if (
    !isInstant(pricing.effectiveFrom) ||
    pricing.effectiveFrom > at
  ) {
    return false;
  }

  if (
    pricing.effectiveTo !== null &&
    pricing.effectiveTo <= at
  ) {
    return false;
  }

  return true;
}

function unknown(
  reason: string
): PlannerCostEstimate {
  return {
    costMinMicros: null,
    costMaxMicros: null,
    currency: null,
    pricingBasis: `unknown cost: ${reason}`,
  };
}

function describeScope(
  limit: number
): string {
  return `; input_scope_limit_tokens=${limit}`;
}

/*
 * Estimates what one planned step would cost on one model.
 *
 * `pricing` is the row already resolved by the caller for
 * `planCreatedAt`; pass null when no rate covers that instant. The
 * estimator re-checks the effective window anyway so a mismatched row
 * can never be priced silently.
 */
export function estimatePlannerCost(input: {
  task: PlannerCostTask;
  pricing: PlannerCostPricing | null;
  planCreatedAt: string;
  modelId?: string | null;
}): PlannerCostEstimate {
  const { task, pricing, planCreatedAt } = input;

  if (!isInstant(planCreatedAt)) {
    return unknown(
      "planCreatedAt is not a valid instant"
    );
  }

  if (pricing === null) {
    return unknown(
      "no pricing version covers the plan creation instant"
    );
  }

  if (!coversInstant(pricing, planCreatedAt)) {
    return unknown(
      `pricing ${pricing.id} is not in force at ${planCreatedAt}`
    );
  }

  if (
    !isRate(pricing.inputPerMillion) ||
    !isRate(pricing.outputPerMillion)
  ) {
    return unknown(
      `pricing ${pricing.id} has no usable rate`
    );
  }

  if (
    typeof pricing.currency !== "string" ||
    pricing.currency.trim() === ""
  ) {
    return unknown(
      `pricing ${pricing.id} states no currency`
    );
  }

  const {
    estimatedInputTokensMin,
    estimatedInputTokensMax,
    estimatedOutputTokensMin,
    estimatedOutputTokensMax,
  } = task;

  /*
   * All four bounds are required. A partially known range still yields
   * a fully unknown cost, because the stored shape is all-or-nothing:
   * a known minimum next to an unknown maximum is not representable.
   */
  if (!isTokenCount(estimatedInputTokensMin)) {
    return unknown(
      "estimated_input_tokens_min is missing or not a whole number"
    );
  }

  if (!isTokenCount(estimatedInputTokensMax)) {
    return unknown(
      "estimated_input_tokens_max is missing or not a whole number"
    );
  }

  if (!isTokenCount(estimatedOutputTokensMin)) {
    return unknown(
      "estimated_output_tokens_min is missing or not a whole number"
    );
  }

  if (!isTokenCount(estimatedOutputTokensMax)) {
    return unknown(
      "estimated_output_tokens_max is missing or not a whole number"
    );
  }

  if (estimatedInputTokensMin > estimatedInputTokensMax) {
    return unknown(
      "estimated input token minimum exceeds its maximum"
    );
  }

  if (estimatedOutputTokensMin > estimatedOutputTokensMax) {
    return unknown(
      "estimated output token minimum exceeds its maximum"
    );
  }

  /*
   * A narrower-than-headline rate must not be applied to an estimate
   * that runs past its ceiling. Refusing is the honest answer; using
   * the short-context rate would understate the real figure.
   */
  const scopeLimit =
    pricing.inputScopeLimitTokens ??
    (input.modelId !== undefined &&
    input.modelId !== null
      ? DECLARED_INPUT_SCOPE_LIMITS[input.modelId] ?? null
      : null);

  if (
    scopeLimit !== null &&
    scopeLimit !== undefined &&
    isTokenCount(scopeLimit) &&
    estimatedInputTokensMax > scopeLimit
  ) {
    return unknown(
      `estimated_input_tokens_max ${estimatedInputTokensMax} exceeds the priced input scope of ${scopeLimit} tokens`
    );
  }

  const costMinMicros =
    costMicros(
      estimatedInputTokensMin,
      pricing.inputPerMillion
    ) +
    costMicros(
      estimatedOutputTokensMin,
      pricing.outputPerMillion
    );

  const costMaxMicros =
    costMicros(
      estimatedInputTokensMax,
      pricing.inputPerMillion
    ) +
    costMicros(
      estimatedOutputTokensMax,
      pricing.outputPerMillion
    );

  const scopeNote =
    scopeLimit !== null &&
    scopeLimit !== undefined &&
    isTokenCount(scopeLimit)
      ? describeScope(scopeLimit)
      : "";

  const sourceNote =
    typeof pricing.sourceUrl === "string" &&
    pricing.sourceUrl.trim() !== ""
      ? `; source=${pricing.sourceUrl}`
      : "";

  return {
    costMinMicros,
    costMaxMicros,
    currency: pricing.currency,
    pricingBasis:
      `registry pricing id=${pricing.id}` +
      `; effective_from=${pricing.effectiveFrom}` +
      `; effective_to=${
        pricing.effectiveTo ?? "none"
      }` +
      `; currency=${pricing.currency}` +
      `; resolved_for_plan_created_at=${planCreatedAt}` +
      `; basis=registry` +
      scopeNote +
      sourceNote,
  };
}
