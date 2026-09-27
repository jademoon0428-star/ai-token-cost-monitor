/*
 * v1.4-B AI Registry seed manifest.
 *
 * Every number in this file was read from a vendor's own public
 * documentation. Nothing here is estimated, averaged, ranked or
 * derived from a third-party price aggregator.
 *
 * Three rules govern this file:
 *
 * 1. Tri-state capabilities. null = Unknown (no official vendor
 *    statement found), 0 = officially documented as unsupported,
 *    1 = officially documented as supported. Never guess a 0.
 *
 * 2. No zero-as-unknown pricing. pricing_versions declares all four
 *    rate columns NOT NULL, so a rate we cannot source is expressed
 *    by writing NO pricing row at all. Absence of a row means
 *    "price unknown", never "price is 0".
 *
 * 3. Only unconditional rates are written. pricing_versions can
 *    express a date range (effective_from / effective_to) but it
 *    cannot express a rate that depends on something other than the
 *    date - a time of day, a request size, a token modality or a
 *    region. Those conditional rates are deliberately NOT seeded;
 *    see the omission notes on each model.
 *
 * effective_from is the date the vendor page was last read, not a
 * guessed publication date. A seeded rate is therefore only ever
 * claimed for usage on or after the day we verified it, which is the
 * conservative direction: historical usage stays Unknown instead of
 * being silently priced with today's card.
 */

export type CapabilityValue = 0 | 1 | null;

export type RegistryPricingSeed = {
  /*
   * Deterministic id: "<model_id>_<effective_from date>".
   */
  id: string;
  currency: "USD";
  inputPerMillion: number;
  outputPerMillion: number;
  cachedPerMillion: number;
  reasoningPerMillion: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  /*
   * The exact vendor condition this row covers, e.g.
   * "text / image / video input, standard tier". Recorded in the
   * manifest because the table itself cannot express it.
   */
  scope: string;
  sourceUrl: string;
};

export type RegistryModelSeed = {
  /*
   * The vendor's API model id. This is what models.name stores, so
   * it matches what usage_records already carries for the same
   * model.
   */
  name: string;
  displayName: string;
  supportsTools: CapabilityValue;
  supportsVision: CapabilityValue;
  supportsReasoning: CapabilityValue;
  contextWindowTokens: number | null;
  maxOutputTokens: number | null;
  capabilitySourceUrl: string;
  /*
   * Per-field provenance and every rate we deliberately left out,
   * so a reviewer can re-derive this row from the vendor page.
   */
  sourceNote: string;
  omittedPricing: string | null;
  pricing: RegistryPricingSeed[];
};

export type RegistryProviderSeed = {
  name: string;
  sourceUrl: string;
  models: RegistryModelSeed[];
};

/*
 * The day these vendor pages were read. Stored on every capability
 * row as source_checked_at.
 */
export const REGISTRY_SOURCE_CHECKED_AT = "2026-09-27";

export const AI_REGISTRY_SEED: RegistryProviderSeed[] = [
  {
    name: "DeepSeek",
    sourceUrl: "https://api-docs.deepseek.com/quick_start/pricing",
    models: [
      {
        name: "deepseek-flash",
        displayName: "DeepSeek-V4.1-Flash",
        supportsTools: 1,
        supportsVision: 1,
        supportsReasoning: 1,
        contextWindowTokens: 1000000,
        maxOutputTokens: 384000,
        capabilitySourceUrl:
          "https://api-docs.deepseek.com/quick_start/pricing",
        sourceNote:
          "Pricing page: model version DeepSeek-V4.1-Flash, context 1M, max output 384K, thinking mode supported (default), images accepted and billed as input tokens. Tool support per the official Function Calling guide at https://api-docs.deepseek.com/guides/function_calling.",
        omittedPricing:
          "Every DeepSeek rate is time-banded: off-peak is half of peak, and peak hours are 01:00-04:00 and 06:00-10:00 UTC Monday-Friday. pricing_versions has no time-of-day dimension, so no rate is written. Current off-peak card is 0.003 cache-hit input / 0.15 cache-miss input / 0.60 output per 1M tokens; peak doubles all three.",
        pricing: [],
      },
      {
        name: "deepseek-v4-pro",
        displayName: "DeepSeek-V4-Pro-0813",
        supportsTools: 1,
        supportsVision: null,
        supportsReasoning: 1,
        contextWindowTokens: 1000000,
        maxOutputTokens: 384000,
        capabilitySourceUrl:
          "https://api-docs.deepseek.com/quick_start/pricing",
        sourceNote:
          "Pricing page: model version DeepSeek-V4-Pro-0813, context 1M, max output 384K, thinking mode supported. Vision left Unknown on purpose: the pricing page does not state that this model rejects images, so a 0 would not be an official confirmation.",
        omittedPricing:
          "Same peak/off-peak time bands as deepseek-flash. Current off-peak card is 0.022 cache-hit input / 0.66 cache-miss input / 1.98 output per 1M tokens; peak doubles all three.",
        pricing: [],
      },
    ],
  },
  {
    name: "OpenAI",
    sourceUrl: "https://developers.openai.com/api/docs/pricing",
    models: [
      {
        name: "gpt-5.6-sol",
        displayName: "GPT-5.6 Sol",
        supportsTools: 1,
        supportsVision: null,
        supportsReasoning: 1,
        contextWindowTokens: 1050000,
        maxOutputTokens: 128000,
        capabilitySourceUrl:
          "https://developers.openai.com/api/docs/models/gpt-5.6-sol",
        sourceNote:
          "Model page: 1,050,000 context window, 128,000 max output tokens, Reasoning.effort supports none/low/medium/high/xhigh/max. Tools supported via the Responses API. Vision left Unknown: the model page does not state image input support. Reasoning tokens bill at the output rate, so reasoning_per_million equals output_per_million.",
        omittedPricing:
          "Prompts over 272K input tokens are priced at 2x input and 1.5x output for the whole request. That depends on request size, not on the date, so only the short-context rate is written. Cache writes bill at 1.25x uncached input and have no separate column, so they are not represented.",
        pricing: [
          {
            id: "provider_openai_gpt_5_6_sol_2026-09-27",
            currency: "USD",
            inputPerMillion: 4,
            outputPerMillion: 20,
            cachedPerMillion: 0.4,
            reasoningPerMillion: 20,
            effectiveFrom: REGISTRY_SOURCE_CHECKED_AT,
            effectiveTo: null,
            scope: "short context (up to 272K input tokens), standard tier",
            sourceUrl:
              "https://developers.openai.com/api/docs/pricing",
          },
        ],
      },
      {
        name: "gpt-5.6-terra",
        displayName: "GPT-5.6 Terra",
        supportsTools: 1,
        supportsVision: null,
        supportsReasoning: 1,
        contextWindowTokens: 1050000,
        maxOutputTokens: 128000,
        capabilitySourceUrl:
          "https://developers.openai.com/api/docs/models/gpt-5.6-terra",
        sourceNote:
          "Model page: 1,050,000 context window, 128,000 max output tokens, Reasoning.effort supported. Vision left Unknown. Reasoning tokens bill at the output rate.",
        omittedPricing:
          "Long-context tier above 272K input tokens not written; see gpt-5.6-sol.",
        pricing: [
          {
            id: "provider_openai_gpt_5_6_terra_2026-09-27",
            currency: "USD",
            inputPerMillion: 2,
            outputPerMillion: 12,
            cachedPerMillion: 0.2,
            reasoningPerMillion: 12,
            effectiveFrom: REGISTRY_SOURCE_CHECKED_AT,
            effectiveTo: null,
            scope: "short context (up to 272K input tokens), standard tier",
            sourceUrl:
              "https://developers.openai.com/api/docs/pricing",
          },
        ],
      },
      {
        name: "gpt-5.6-luna",
        displayName: "GPT-5.6 Luna",
        supportsTools: 1,
        supportsVision: null,
        supportsReasoning: 1,
        contextWindowTokens: 1050000,
        maxOutputTokens: 128000,
        capabilitySourceUrl:
          "https://developers.openai.com/api/docs/models/gpt-5.6-luna",
        sourceNote:
          "Model page: 1,050,000 context window, 128,000 max output tokens, Reasoning.effort supported. Vision left Unknown. Reasoning tokens bill at the output rate.",
        omittedPricing:
          "Long-context tier above 272K input tokens not written; see gpt-5.6-sol.",
        pricing: [
          {
            id: "provider_openai_gpt_5_6_luna_2026-09-27",
            currency: "USD",
            inputPerMillion: 0.2,
            outputPerMillion: 1.2,
            cachedPerMillion: 0.02,
            reasoningPerMillion: 1.2,
            effectiveFrom: REGISTRY_SOURCE_CHECKED_AT,
            effectiveTo: null,
            scope: "short context (up to 272K input tokens), standard tier",
            sourceUrl:
              "https://developers.openai.com/api/docs/pricing",
          },
        ],
      },
    ],
  },
  {
    name: "Anthropic",
    sourceUrl:
      "https://platform.claude.com/docs/en/about-claude/models/overview",
    models: [
      {
        name: "claude-opus-5",
        displayName: "Claude Opus 5",
        supportsTools: 1,
        supportsVision: 1,
        supportsReasoning: 1,
        contextWindowTokens: 1000000,
        maxOutputTokens: 128000,
        capabilitySourceUrl:
          "https://platform.claude.com/docs/en/models/opus-5/overview",
        sourceNote:
          "Model page: 1M context window, 128K max output, adaptive thinking, text and image input, tool use. All current models support text and image input, text output, vision and tool use. Thinking blocks bill as output tokens, so reasoning_per_million equals output_per_million.",
        omittedPricing:
          "Batch API, US-only inference (1.1x) and 1-hour cache-write rates are separate SKUs and are not written; only the standard global row is seeded.",
        pricing: [
          {
            id: "provider_anthropic_claude-opus-5_2026-09-27",
            currency: "USD",
            inputPerMillion: 5,
            outputPerMillion: 25,
            cachedPerMillion: 0.5,
            reasoningPerMillion: 25,
            effectiveFrom: REGISTRY_SOURCE_CHECKED_AT,
            effectiveTo: null,
            scope:
              "standard global tier; cached = cache read at 0.1x base input",
            sourceUrl:
              "https://platform.claude.com/docs/en/build-with-claude/prompt-caching",
          },
        ],
      },
      {
        name: "claude-sonnet-5",
        displayName: "Claude Sonnet 5",
        supportsTools: 1,
        supportsVision: 1,
        supportsReasoning: 1,
        contextWindowTokens: 1000000,
        maxOutputTokens: 128000,
        capabilitySourceUrl:
          "https://platform.claude.com/docs/en/about-claude/models/overview",
        sourceNote:
          "Models overview: 1M context window, 128K max output, adaptive thinking, text and image input, tool use. Thinking blocks bill as output tokens.",
        omittedPricing:
          "Batch API and US-only inference rates not written; see claude-opus-5.",
        pricing: [
          {
            id: "provider_anthropic_claude-sonnet-5_2026-09-27",
            currency: "USD",
            inputPerMillion: 2,
            outputPerMillion: 10,
            cachedPerMillion: 0.2,
            reasoningPerMillion: 10,
            effectiveFrom: REGISTRY_SOURCE_CHECKED_AT,
            effectiveTo: null,
            scope:
              "standard global tier; cached = cache read at 0.1x base input",
            sourceUrl:
              "https://platform.claude.com/docs/en/build-with-claude/prompt-caching",
          },
        ],
      },
      {
        name: "claude-haiku-4-5-20251001",
        displayName: "Claude Haiku 4.5",
        supportsTools: 1,
        supportsVision: 1,
        supportsReasoning: 1,
        contextWindowTokens: 200000,
        maxOutputTokens: 64000,
        capabilitySourceUrl:
          "https://platform.claude.com/docs/en/models/haiku-4-5/overview",
        sourceNote:
          "Model page: 200K context window, 64K max output, extended thinking via thinking.type enabled, text and image input, tool use. The API id is the pinned snapshot; claude-haiku-4-5 is only an alias for it. Thinking blocks bill as output tokens.",
        omittedPricing:
          "Batch API and US-only inference rates not written; see claude-opus-5.",
        pricing: [
          {
            id: "provider_anthropic_claude_haiku_4_5_20251001_2026-09-27",
            currency: "USD",
            inputPerMillion: 1,
            outputPerMillion: 5,
            cachedPerMillion: 0.1,
            reasoningPerMillion: 5,
            effectiveFrom: REGISTRY_SOURCE_CHECKED_AT,
            effectiveTo: null,
            scope:
              "standard global tier; cached = cache read at 0.1x base input",
            sourceUrl:
              "https://platform.claude.com/docs/en/build-with-claude/prompt-caching",
          },
        ],
      },
    ],
  },
  {
    name: "Google",
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    models: [
      {
        name: "gemini-3.8-flash",
        displayName: "Gemini 3.8 Flash",
        supportsTools: 1,
        supportsVision: 1,
        supportsReasoning: 1,
        contextWindowTokens: 1000000,
        maxOutputTokens: 65536,
        capabilitySourceUrl:
          "https://ai.google.dev/gemini-api/docs/latest-model",
        sourceNote:
          "Gemini 3 developer guide lists Gemini 3 models at a 1 million token input context window and up to 64k tokens of output (stored as 65536). All Gemini 3 models support Google Search, Maps grounding, File Search, Code Execution, URL Context and standard function calling, and are multimodal. The pricing page labels the output rate as including thinking tokens, so reasoning_per_million equals output_per_million.",
        omittedPricing:
          "Audio input, Batch/Flex rates, per-hour context-cache storage and non-global regional rates are not written: they depend on modality, API surface or region rather than on the date.",
        pricing: [
          {
            id: "provider_google_gemini_3_8_flash_2026-09-27",
            currency: "USD",
            inputPerMillion: 0.75,
            outputPerMillion: 3.75,
            cachedPerMillion: 0.075,
            reasoningPerMillion: 3.75,
            effectiveFrom: REGISTRY_SOURCE_CHECKED_AT,
            effectiveTo: "2027-01-01",
            scope: "introductory rate, text / image / video / audio input",
            sourceUrl:
              "https://ai.google.dev/gemini-api/docs/pricing",
          },
          {
            id: "provider_google_gemini_3_8_flash_2027-01-01",
            currency: "USD",
            inputPerMillion: 1.5,
            outputPerMillion: 7.5,
            cachedPerMillion: 0.15,
            reasoningPerMillion: 7.5,
            effectiveFrom: "2027-01-01",
            effectiveTo: null,
            scope: "standard rate, text / image / video / audio input",
            sourceUrl:
              "https://ai.google.dev/gemini-api/docs/pricing",
          },
        ],
      },
      {
        name: "gemini-3.1-flash-lite",
        displayName: "Gemini 3.1 Flash-Lite",
        supportsTools: 1,
        supportsVision: 1,
        supportsReasoning: 1,
        contextWindowTokens: 1000000,
        maxOutputTokens: 65536,
        capabilitySourceUrl:
          "https://ai.google.dev/gemini-api/docs/gemini-3",
        sourceNote:
          "Gemini 3 developer guide: 1M / 64k context window (stored as 1000000 / 65536), multimodal, function calling, thinking supported. Output rate includes thinking tokens.",
        omittedPricing:
          "Audio input is priced separately (0.50 input / 0.05 cached) and is not written. Batch/Flex rates and non-global regional rates not written.",
        pricing: [
          {
            id: "provider_google_gemini_3_1_flash_lite_2026-09-27",
            currency: "USD",
            inputPerMillion: 0.25,
            outputPerMillion: 1.5,
            cachedPerMillion: 0.025,
            reasoningPerMillion: 1.5,
            effectiveFrom: REGISTRY_SOURCE_CHECKED_AT,
            effectiveTo: null,
            scope:
              "standard tier, text / image / video input (audio excluded)",
            sourceUrl:
              "https://ai.google.dev/gemini-api/docs/pricing",
          },
        ],
      },
      {
        name: "gemini-3-flash-preview",
        displayName: "Gemini 3 Flash Preview",
        supportsTools: 1,
        supportsVision: 1,
        supportsReasoning: 1,
        contextWindowTokens: 1000000,
        maxOutputTokens: 65536,
        capabilitySourceUrl:
          "https://ai.google.dev/gemini-api/docs/gemini-3",
        sourceNote:
          "Gemini 3 developer guide: 1M / 64k context window (stored as 1000000 / 65536), multimodal, function calling, thinking supported. Preview model, so its limits and rates can change. Output rate includes thinking tokens.",
        omittedPricing:
          "Audio input is priced separately (1.00 input / 0.10 cached) and is not written. Batch/Flex rates and non-global regional rates not written.",
        pricing: [
          {
            id: "provider_google_gemini_3_flash_preview_2026-09-27",
            currency: "USD",
            inputPerMillion: 0.5,
            outputPerMillion: 3,
            cachedPerMillion: 0.05,
            reasoningPerMillion: 3,
            effectiveFrom: REGISTRY_SOURCE_CHECKED_AT,
            effectiveTo: null,
            scope:
              "standard tier, text / image / video input (audio excluded)",
            sourceUrl:
              "https://ai.google.dev/gemini-api/docs/pricing",
          },
        ],
      },
    ],
  },
];
