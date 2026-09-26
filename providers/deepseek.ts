import type { NormalizedUsage } from "./types";

export interface DeepSeekResponseLike {
  id?: string;
  model: string;
  created?: number;
  created_at?: number;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
  };
}

function nonNegative(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function normalizeDeepSeekResponse(response: DeepSeekResponseLike): NormalizedUsage {
  const usage = response.usage ?? {};
  const inputTokens = nonNegative(usage.input_tokens ?? usage.prompt_tokens);
  const outputTokens = nonNegative(usage.output_tokens ?? usage.completion_tokens);
  const cachedTokens = nonNegative(
    usage.input_tokens_details?.cached_tokens ?? usage.prompt_cache_hit_tokens,
  );
  const reasoningTokens = nonNegative(usage.output_tokens_details?.reasoning_tokens);
  const created = response.created_at ?? response.created;
  const timestamp = created
    ? new Date(created * 1000).toISOString()
    : new Date().toISOString();

  return {
    id: response.id,
    provider: "deepseek",
    model: response.model,
    timestamp,
    inputTokens,
    outputTokens,
    cachedTokens,
    reasoningTokens,
    source: "official_api",
    accuracy: "verified",
  };
}

/**
 * DeepSeek V4 pricing as published by DeepSeek on 2026-08-16.
 * Peak: 01:00-04:00 and 06:00-10:00 UTC, Monday-Friday.
 * Off-peak rates are half the peak rates.
 */
export function getDeepSeekPricing(timestamp: string, model: string) {
  const date = new Date(timestamp);
  const day = date.getUTCDay();
  const hour = date.getUTCHours();
  const weekday = day >= 1 && day <= 5;
  const peak = weekday && ((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10));

  const base = model === "deepseek-v4-pro"
    ? { cache: 0.022, input: 0.66, output: 1.98 }
    : { cache: 0.007, input: 0.22, output: 0.66 };

  const multiplier = peak ? 2 : 1;

  return {
    inputPerMillion: base.input * multiplier,
    outputPerMillion: base.output * multiplier,
    cachedPerMillion: base.cache * multiplier,
    reasoningPerMillion: 0,
    currency: "USD",
    version: `deepseek-v4-${peak ? "peak" : "offpeak"}-2026-08-16`,
  };
}
