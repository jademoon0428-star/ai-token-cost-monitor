import {
  ConnectionTestResult,
  ProviderConnector,
  UsageSyncResult,
} from "./types";

const API_BASE =
  "https://api.anthropic.com/v1";

const ANTHROPIC_VERSION =
  "2023-06-01";

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
      "x-api-key": apiKey,
      "anthropic-version":
        ANTHROPIC_VERSION,
      "content-type": "application/json",
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
        `Anthropic API error: ${response.status}`
    );
  }

  return data;
}

export const anthropicConnector: ProviderConnector =
  {
    definition: {
      id: "anthropic",
      name: "Anthropic",
      description:
        "Connect an Anthropic organization and sync official usage data.",
      keyPlaceholder: "sk-ant-admin...",
      requiresAdminKey: true,
    },

    async testConnection(
      apiKey: string
    ): Promise<ConnectionTestResult> {
      try {
        await request(
          "/organizations/usage_report/messages",
          apiKey,
          new URLSearchParams({
            starting_at: new Date(
              Date.now() - 3600000
            ).toISOString(),
            ending_at: new Date().toISOString(),
            bucket_width: "1h",
            limit: "1",
          })
        );

        return {
          success: true,
          provider: "anthropic",
          message:
            "Anthropic connection successful.",
        };
      } catch (error) {
        return {
          success: false,
          provider: "anthropic",
          message:
            error instanceof Error
              ? error.message
              : "Anthropic connection failed.",
        };
      }
    },

    async syncUsage(
      apiKey: string,
      startTime: Date,
      endTime: Date
    ): Promise<UsageSyncResult> {
      try {
        const params = new URLSearchParams();

        params.set(
          "starting_at",
          startTime.toISOString()
        );

        params.set(
          "ending_at",
          endTime.toISOString()
        );

        params.set(
          "bucket_width",
          "1d"
        );

        params.set(
          "limit",
          "31"
        );

        params.append(
          "group_by[]",
          "model"
        );

        const data = await request(
          "/organizations/usage_report/messages",
          apiKey,
          params
        );

        let records = 0;

        if (Array.isArray(data?.data)) {
          for (const bucket of data.data) {
            if (!Array.isArray(bucket?.results)) {
              continue;
            }

            records += bucket.results.length;
          }
        }

        return {
          success: true,
          provider: "anthropic",
          records,
          totalCost: null,
          currency: "USD",
          accuracy: "verified",
          message:
            "Anthropic usage data retrieved successfully. Cost calculation will use stored pricing.",
        };
      } catch (error) {
        return {
          success: false,
          provider: "anthropic",
          records: 0,
          totalCost: null,
          currency: null,
          accuracy: "estimated",
          message:
            error instanceof Error
              ? error.message
              : "Anthropic synchronization failed.",
        };
      }
    },
  };