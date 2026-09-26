import Link from "next/link";
import CoreModuleNav from "@/components/core-module-nav";
import { GET as getUsage } from "@/app/api/usage/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type UsageRow = {
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  application?: string | null;
  project?: string | null;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  reasoning_tokens: number;
  total_cost_micros?: number | null;
  accuracy: string;
  source?: string;
};

type UsageApiResponse = {
  currency?: string;
  count?: number;
  usage?: UsageRow[];
  records?: UsageRow[];
  summary?: {
    input_tokens?: number;
    output_tokens?: number;
    cached_tokens?: number;
    total_tokens?: number;
    total_cost_micros?: number;
  };
};

const money = (
  micros: number,
  currency = "CNY"
) => {
  const value =
    Number(micros || 0) / 1_000_000;

  if (currency === "CNY") {
    return `¥${value.toFixed(4)}`;
  }

  if (currency === "EUR") {
    return `€${value.toFixed(4)}`;
  }

  return `$${value.toFixed(4)}`;
};

const compact = (value: number) => {
  const n = Number(value || 0);

  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(2)}M`;
  }

  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }

  return String(n);
};

const REQUEST_TIMEOUT_MS = 10000;

const isVerified = (accuracy: string) => {
  const value =
    String(accuracy || "").toLowerCase();

  return (
    value === "verified" ||
    value === "exact"
  );
};

const singaporeDateKey = (
  timestamp: string
) => {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts =
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Singapore",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

  const result: Record<
    string,
    string
  > = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
  }

  return `${result.year}-${result.month}-${result.day}`;
};

const addDays = (
  dateKey: string,
  days: number
) => {
  const date = new Date(
    `${dateKey}T00:00:00Z`
  );

  date.setUTCDate(
    date.getUTCDate() + days
  );

  return date
    .toISOString()
    .slice(0, 10);
};

const todaySingapore = () => {
  const parts =
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Singapore",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(
      new Date()
    );

  const result: Record<
    string,
    string
  > = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
  }

  return `${result.year}-${result.month}-${result.day}`;
};

const inLastDays = (
  timestamp: string,
  days: number
) => {
  const record =
    singaporeDateKey(timestamp);

  if (!record) {
    return false;
  }

  const today =
    todaySingapore();

  const start = addDays(
    today,
    -(days - 1)
  );

  return (
    record >= start &&
    record <= today
  );
};

async function loadUsage(): Promise<{
  data: UsageApiResponse | null;
  error: string | null;
}> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const response = await Promise.race([
      getUsage(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("Usage data took too long to load."));
        }, REQUEST_TIMEOUT_MS);
      }),
    ]);

    if (!response.ok) {
      return {
        data: null,
        error:
          "Unable to load usage data. Please try again.",
      };
    }

    const data =
      (await response.json()) as UsageApiResponse;

    return {
      data,
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error:
        "Unable to load usage data. Please try again.",
    };
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
  }
}

export default async function UsagePage() {
  const { data, error } =
    await loadUsage();

  const allUsage =
    Array.isArray(data?.usage)
      ? data.usage
      : Array.isArray(data?.records)
        ? data.records
        : [];

  const currency =
    data?.currency || "CNY";

  const recent7d =
    allUsage.filter((row) =>
      inLastDays(
        row.timestamp,
        7
      )
    );

  const recent30d =
    allUsage.filter((row) =>
      inLastDays(
        row.timestamp,
        30
      )
    );

  const recent7dVerified =
    recent7d.filter((row) =>
      isVerified(row.accuracy)
    );

  const recent30dVerified =
    recent30d.filter((row) =>
      isVerified(row.accuracy)
    );

  const displayUsage =
    recent7dVerified.length > 0
      ? recent7dVerified
      : recent30dVerified;

  const displayPeriod =
    recent7dVerified.length > 0
      ? "Last 7 days"
      : "Last 30 days";

  const totalTokens =
    displayUsage.reduce(
      (sum, row) =>
        sum +
        Number(
          row.input_tokens || 0
        ) +
        Number(
          row.output_tokens || 0
        ),
      0
    );

  const inputTokens =
    displayUsage.reduce(
      (sum, row) =>
        sum +
        Number(
          row.input_tokens || 0
        ),
      0
    );

  const outputTokens =
    displayUsage.reduce(
      (sum, row) =>
        sum +
        Number(
          row.output_tokens || 0
        ),
      0
    );

  const cachedTokens =
    displayUsage.reduce(
      (sum, row) =>
        sum +
        Number(
          row.cached_tokens || 0
        ),
      0
    );

  const verifiedCost =
    displayUsage.reduce(
      (sum, row) =>
        sum +
        Number(
          row.total_cost_micros || 0
        ),
      0
    );

  const all30dCost =
    recent30dVerified.reduce(
      (sum, row) =>
        sum +
        Number(
          row.total_cost_micros || 0
        ),
      0
    );

  const providerMap =
    new Map<string, number>();

  const modelMap =
    new Map<string, number>();

  for (const row of recent30dVerified) {
    const provider =
      row.provider ||
      "Unknown provider";

    const model =
      row.model ||
      "Unknown model";

    const cost =
      Number(
        row.total_cost_micros || 0
      );

    providerMap.set(
      provider,
      (providerMap.get(provider) ||
        0) + cost
    );

    modelMap.set(
      model,
      (modelMap.get(model) ||
        0) + cost
    );
  }

  const providers =
    Array.from(
      providerMap.entries()
    )
      .map(
        ([name, cost]) => ({
          name,
          cost,
        })
      )
      .sort(
        (a, b) =>
          b.cost - a.cost
      );

  const models =
    Array.from(
      modelMap.entries()
    )
      .map(
        ([name, cost]) => ({
          name,
          cost,
        })
      )
      .sort(
        (a, b) =>
          b.cost - a.cost
      );

  const topProvider =
    providers[0] || null;

  const topModel =
    models[0] || null;

  const cacheRatio =
    inputTokens > 0
      ? (cachedTokens /
          inputTokens) *
        100
      : null;

  const has7dData =
    recent7dVerified.length >
    0;

  const has30dData =
    recent30dVerified.length >
    0;

  return (
    <main className="usage-page">
      <div className="usage-top">
        <div>
          <CoreModuleNav active="usage" />

          <small>
            MONITOR / USAGE
          </small>

          <h1>Usage</h1>

          <p>
            Understand how much AI
            you used, how much it
            cost, and what is driving
            the spending.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <Link
            className="export"
            href="/usage/import"
          >
            Import official
            usage export
          </Link>

          <Link
            className="export"
            href="/usage/details"
          >
            View details →
          </Link>
        </div>
      </div>

      {error ? (
        <section
          className="usage-card"
          style={{
            marginBottom: "24px",
          }}
        >
          <h2>
            Unable to load usage
            data
          </h2>

          <p
            style={{
              opacity: 0.7,
            }}
          >
            {error}
          </p>
        </section>
      ) : (
        <>
          {!has7dData &&
            has30dData && (
              <section
                className="usage-card"
                style={{
                  marginBottom:
                    "24px",
                  border:
                    "1px solid rgba(255,180,70,.28)",
                }}
              >
                <h2
                  style={{
                    marginBottom:
                      "8px",
                  }}
                >
                  No verified usage
                  recorded in the
                  last 7 days.
                </h2>

                <p
                  style={{
                    margin: 0,
                    opacity: 0.72,
                  }}
                >
                  You have{" "}
                  <strong>
                    {money(
                      all30dCost,
                      currency
                    )}
                  </strong>{" "}
                  of verified
                  spending in the
                  last 30 days.
                </p>
              </section>
            )}

          {!has30dData && (
            <section
              className="usage-card"
              style={{
                marginBottom:
                  "24px",
              }}
            >
              <h2>
                No verified usage
                recorded yet.
              </h2>

              <p
                style={{
                  opacity: 0.7,
                }}
              >
                Import an official
                usage export to start
                tracking verified AI
                spending.
              </p>
            </section>
          )}

          <div className="usage-metrics">
            <div className="um">
              <small>
                TOTAL TOKENS
              </small>

              <b>
                {compact(
                  totalTokens
                )}
              </b>

              <span>
                {displayUsage.length}{" "}
                records
              </span>
            </div>

            <div className="um">
              <small>
                INPUT TOKENS
              </small>

              <b>
                {compact(
                  inputTokens
                )}
              </b>

              <span>
                {currency}
              </span>
            </div>

            <div className="um">
              <small>
                CACHED TOKENS
              </small>

              <b>
                {compact(
                  cachedTokens
                )}
              </b>

              <span>
                {cacheRatio === null
                  ? "—"
                  : `${cacheRatio.toFixed(
                      1
                    )}% of input`}
              </span>
            </div>

            <div className="um">
              <small>
                OUTPUT TOKENS
              </small>

              <b>
                {compact(
                  outputTokens
                )}
              </b>

              <span>
                {currency}
              </span>
            </div>

            <div className="um">
              <small>
                VERIFIED COST
              </small>

              <b>
                {money(
                  verifiedCost,
                  currency
                )}
              </b>

              <span>
                {displayUsage.length}{" "}
                verified
              </span>
            </div>
          </div>

          <section
            className="usage-card"
            style={{
              marginTop: "24px",
            }}
          >
            <div className="card-head">
              <div>
                <h2>
                  Spending overview
                </h2>

                <p>
                  Verified official
                  usage data ·{" "}
                  {displayPeriod}
                </p>
              </div>

              <span className="live">
                ● VERIFIED
              </span>
            </div>

            <div
              className="usage-metrics"
              style={{
                marginTop: 0,
              }}
            >
              <div className="um">
                <small>
                  TOP PROVIDER
                </small>

                <b>
                  {topProvider
                    ? topProvider.name
                    : "—"}
                </b>

                <span>
                  {topProvider
                    ? money(
                        topProvider.cost,
                        currency
                      )
                    : "No verified cost"}
                </span>
              </div>

              <div className="um">
                <small>
                  TOP MODEL
                </small>

                <b>
                  {topModel
                    ? topModel.name
                    : "—"}
                </b>

                <span>
                  {topModel
                    ? money(
                        topModel.cost,
                        currency
                      )
                    : "No verified cost"}
                </span>
              </div>

              <div className="um">
                <small>
                  STORED RECORDS
                </small>

                <b>
                  {data?.count ??
                    allUsage.length}
                </b>

                <span>
                  All-time stored
                  usage records
                </span>
              </div>
            </div>
          </section>

          <section
            className="usage-card"
            style={{
              marginTop: "24px",
            }}
          >
            <div className="card-head">
              <div>
                <h2>
                  Cost by model
                </h2>

                <p>
                  Where verified
                  spending is
                  concentrated.
                </p>
              </div>
            </div>

            <div className="usage-table">
              <div className="tr th">
                <span>
                  MODEL
                </span>

                <span>
                  COST
                </span>

                <span>
                  SHARE
                </span>

                <span>
                  PROVIDER
                </span>
              </div>

              {models
                .slice(0, 5)
                .map((model) => {
                  const share =
                    all30dCost > 0
                      ? (model.cost /
                          all30dCost) *
                        100
                      : 0;

                  const provider =
                    recent30dVerified.find(
                      (row) =>
                        row.model ===
                        model.name
                    )?.provider ||
                    "—";

                  return (
                    <div
                      className="tr"
                      key={
                        model.name
                      }
                    >
                      <span>
                        <b>
                          {model.name}
                        </b>
                      </span>

                      <span>
                        <strong>
                          {money(
                            model.cost,
                            currency
                          )}
                        </strong>
                      </span>

                      <span>
                        {share.toFixed(
                          1
                        )}
                        %
                      </span>

                      <span>
                        {provider}
                      </span>
                    </div>
                  );
                })}

              {!models.length && (
                <div
                  style={{
                    padding:
                      "32px",
                    textAlign:
                      "center",
                    opacity: 0.65,
                  }}
                >
                  No verified
                  cost data
                  available.
                </div>
              )}
            </div>
          </section>

          <section
            className="usage-card"
            style={{
              marginTop: "24px",
            }}
          >
            <div className="card-head">
              <div>
                <h2>
                  What needs
                  attention?
                </h2>

                <p>
                  A simple summary
                  before you open the
                  full usage details.
                </p>
              </div>
            </div>

            {topModel ? (
              <div
                style={{
                  padding:
                    "8px 0 16px",
                }}
              >
                <h3
                  style={{
                    marginBottom:
                      "8px",
                  }}
                >
                  {topModel.name} is
                  the largest
                  verified model
                  cost driver.
                </h3>

                <p
                  style={{
                    margin: 0,
                    opacity: 0.72,
                  }}
                >
                  It represents{" "}
                  {all30dCost > 0
                    ? (
                        (topModel.cost /
                          all30dCost) *
                        100
                      ).toFixed(1)
                    : "0.0"}
                  % of verified
                  spending in the
                  last 30 days.
                </p>
              </div>
            ) : (
              <div
                style={{
                  padding:
                    "16px 0",
                  opacity: 0.7,
                }}
              >
                No verified cost
                data is available
                yet.
              </div>
            )}

            <Link
              className="export"
              href="/usage/details"
            >
              Open full usage
              details →
            </Link>
          </section>
        </>
      )}
    </main>
  );
}