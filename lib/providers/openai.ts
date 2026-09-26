import {
  ConnectionTestResult,
  ProviderConnector,
  UsageSyncResult,
} from "./types";

const API_BASE = "https://api.openai.com/v1";

async function request(
  path: string,
  apiKey: string,
  params?: URLSearchParams
) {
  const url = new URL(`${API_BASE}${path}`);

  if (params) {
    url.search = params.toString();
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const text = await response.text();

  let data: any;

  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data?.error?.message ??
        `OpenAI API error: ${response.status}`
    );
  }

  return data;
}

export const openaiConnector: ProviderConnector = {
  definition: {
    id: "openai",
    name: "OpenAI",
    description:
      "Connect an OpenAI organization and sync official usage and cost data.",
    keyPlaceholder: "sk-admin-...",
    requiresAdminKey: true,
  },

  async testConnection(
    apiKey: string
  ): Promise<ConnectionTestResult> {
    try {
      await request(
        "/organization/usage/completions",
        apiKey,
        new URLSearchParams({
          start_time: String(
            Math.floor(Date.now() / 1000) - 3600
          ),
          limit: "1",
          bucket_width: "1h",
        })
      );

      return {
        success: true,
        provider: "openai",
        message: "OpenAI connection successful.",
      };
    } catch (error) {
      return {
        success: false,
        provider: "openai",
        message:
          error instanceof Error
            ? error.message
            : "OpenAI connection failed.",
      };
    }
  },

  async syncUsage(
    apiKey: string,
    startTime: Date,
    endTime: Date
  ): Promise<UsageSyncResult> {
    try {
      const start = Math.floor(
        startTime.getTime() / 1000
      );

      const end = Math.floor(
        endTime.getTime() / 1000
      );

      const params = new URLSearchParams({
        start_time: String(start),
        end_time: String(end),
        bucket_width: "1d",
        limit: "180",
        group_by: "model",
      });

      const usage = await request(
        "/organization/usage/completions",
        apiKey,
        params
      );

      const costParams = new URLSearchParams({
        start_time: String(start),
        end_time: String(end),
        bucket_width: "1d",
        limit: "180",
      });

      const costs = await request(
        "/organization/costs",
        apiKey,
        costParams
      );

      let records = 0;
      let totalCost = 0;
      let currency = "USD";

      if (Array.isArray(costs?.data)) {
        for (const bucket of costs.data) {
          if (!Array.isArray(bucket?.results)) {
            continue;
          }

          for (const row of bucket.results) {
            const value = Number(
              row?.amount?.value ?? 0
            );

            if (Number.isFinite(value)) {
              totalCost += value;
              records++;
            }

            if (row?.amount?.currency) {
              currency = String(
                row.amount.currency
              ).toUpperCase();
            }
          }
        }
      }

      return {
        success: true,
        provider: "openai",
        records,
        totalCost,
        currency,
        accuracy: "verified",
        message:
          "OpenAI usage and cost data retrieved successfully.",
      };
    } catch (error) {
      return {
        success: false,
        provider: "openai",
        records: 0,
        totalCost: null,
        currency: null,
        accuracy: "estimated",
        message:
          error instanceof Error
            ? error.message
            : "OpenAI synchronization failed.",
      };
    }
  },
};