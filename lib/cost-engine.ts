import type { NormalizedUsage } from "@/providers/types";

export interface PricingRule {
  inputPerMillion: number;
  outputPerMillion: number;
  cachedPerMillion?: number;
  reasoningPerMillion?: number;
  currency?: string;
  version: string;
}

export interface CostResult {
  inputCostMicros: number;
  outputCostMicros: number;
  cachedCostMicros: number;
  reasoningCostMicros: number;
  totalCostMicros: number;
  currency: string;
  pricingVersion: string;
}

const microsPerCurrencyUnit = 1_000_000;

function costMicros(
  tokens: number,
  pricePerMillion: number
) {
  return Math.round(
    (tokens / 1_000_000) *
      pricePerMillion *
      microsPerCurrencyUnit
  );
}

export function calculateCost(
  usage: NormalizedUsage,
  pricing: PricingRule
): CostResult {
  const cached = Math.max(
    0,
    usage.cachedTokens ?? 0
  );

  const input = Math.max(
    0,
    usage.inputTokens - cached
  );

  const output = Math.max(
    0,
    usage.outputTokens
  );

  const reasoning = Math.max(
    0,
    usage.reasoningTokens ?? 0
  );

  const inputCostMicros = costMicros(
    input,
    pricing.inputPerMillion
  );

  const cachedCostMicros = costMicros(
    cached,
    pricing.cachedPerMillion ?? 0
  );

  const outputCostMicros = costMicros(
    output,
    pricing.outputPerMillion
  );

  const reasoningCostMicros = costMicros(
    reasoning,
    pricing.reasoningPerMillion ?? 0
  );

  return {
    inputCostMicros,
    outputCostMicros,
    cachedCostMicros,
    reasoningCostMicros,

    totalCostMicros:
      inputCostMicros +
      outputCostMicros +
      cachedCostMicros +
      reasoningCostMicros,

    currency:
      pricing.currency ?? "USD",

    pricingVersion:
      pricing.version,
  };
}