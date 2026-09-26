import type {
  ConnectionTestResult,
  ProviderConnector,
  UsageSyncResult,
} from "./types";

const OPENROUTER_MODELS_URL =
  "https://openrouter.ai/api/v1/models";

async function testConnection(
  apiKey: string
): Promise<ConnectionTestResult> {
  if (!apiKey?.trim()) {
    return {
      success: false,
      provider: "openrouter",
      message: "API key is required.",
    };
  }

  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();

      return {
        success: false,
        provider: "openrouter",
        message:
          `OpenRouter connection failed (${response.status}). ` +
          `${text.slice(0, 300)}`,
      };
    }

    return {
      success: true,
      provider: "openrouter",
      message: "OpenRouter API key is valid.",
    };
  } catch (error) {
    return {
      success: false,
      provider: "openrouter",
      message:
        error instanceof Error
          ? error.message
          : "Unknown connection error.",
    };
  }
}

async function syncUsage(
  apiKey: string,
  startTime: Date,
  endTime: Date
): Promise<UsageSyncResult> {
  void startTime;
  void endTime;

  if (!apiKey?.trim()) {
    return {
      success: false,
      provider: "openrouter",
      records: 0,
      totalCost: null,
      currency: "USD",
      accuracy: "verified",
      message: "API key is required.",
    };
  }

  /*
   * V1.3 Phase 1:
   *
   * We only verify the OpenRouter API key.
   *
   * Do NOT estimate historical costs from model pricing.
   * OpenRouter can return actual usage/cost information
   * through inference usage accounting, but this connector
   * does not yet implement historical usage synchronization.
   */
  return {
    success: true,
    provider: "openrouter",
    records: 0,
    totalCost: null,
    currency: "USD",
    accuracy: "verified",
    message:
      "OpenRouter connection verified. " +
      "Historical usage sync will be added in a later phase.",
  };
}

export const openrouterConnector: ProviderConnector = {
  definition: {
    id: "openrouter",
    name: "OpenRouter",
    description:
      "Connect OpenRouter to verify API access and prepare usage synchronization.",
    keyPlaceholder: "sk-or-...",
    requiresAdminKey: false,
  },

  testConnection,

  syncUsage,
};