"use client";

import { useEffect, useMemo, useState } from "react";

type Period = "today" | "7d" | "30d" | "all";

const PRODUCT_TIMEZONE = "Asia/Singapore";

interface CostResponse {
  success: boolean;
  summary?: {
    recordCount: number;
    sourceCostRecordCount: number;
    totalSourceCost: number;
    currency: string | null;
    costPolicy: string;
  };
  byProvider?: Array<{
    provider: string;
    recordCount: number;
    sourceCost: number;
  }>;
  byModel?: Array<{
    provider: string;
    model: string;
    recordCount: number;
    sourceCost: number;
  }>;
  records?: Array<{
    id: string;
    source: string;
    provider: string;
    model: string;
    timestamp: string;
    cost: {
      amount: number | null;
      currency: string | null;
    };
    accuracy: string;
  }>;
}

function money(amount: number, currency: string | null) {
  if (!Number.isFinite(amount)) {
    return "—";
  }

  if (currency === "CNY") {
    return `¥${amount.toFixed(4)}`;
  }

  if (currency === "USD") {
    return `$${amount.toFixed(4)}`;
  }

  if (currency === "EUR") {
    return `€${amount.toFixed(4)}`;
  }

  return `${currency ?? ""} ${amount.toFixed(4)}`.trim();
}

function formatDate(timestamp: string) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: PRODUCT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isVerified(accuracy: string) {
  const value = String(accuracy || "").toLowerCase();

  return value === "verified" || value === "exact";
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "14px",
        padding: "22px",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <h2
        style={{
          margin: "0 0 18px",
          fontSize: "16px",
          fontWeight: 700,
          color: "#111827",
        }}
      >
        {title}
      </h2>

      {children}
    </section>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: "28px 12px",
        textAlign: "center",
        color: "#6b7280",
        fontSize: "14px",
      }}
    >
      No recorded cost for this period.
    </div>
  );
}

function LoadingText() {
  return (
    <div
      style={{
        color: "#94a3b8",
        fontSize: "14px",
      }}
    >
      Loading data...
    </div>
  );
}

export default function CostsPage() {
  const [period, setPeriod] = useState<Period>("7d");

  const [data, setData] = useState<CostResponse | null>(null);

  const [fallback30dData, setFallback30dData] =
    useState<CostResponse | null>(null);

  // First load gets a dedicated loading state.
  const [initialLoading, setInitialLoading] = useState(true);

  // Refreshing no longer clears the current screen.
  const [refreshing, setRefreshing] = useState(false);

  const [loadingFallback, setLoadingFallback] = useState(false);

  const [error, setError] = useState<string | null>(null);

  async function fetchCosts(
    requestedPeriod: Period
  ): Promise<CostResponse> {
    const response = await fetch(
      `/api/costs/unified?period=${requestedPeriod}&timezone=${encodeURIComponent(
        PRODUCT_TIMEZONE
      )}`,
      {
        cache: "no-store",
      }
    );

    const result = (await response.json()) as CostResponse & {
      error?: string;
    };

    if (!response.ok || !result.success) {
      throw new Error(
        result.error ?? "Failed to load cost data."
      );
    }

    return result;
  }

  async function loadCosts() {
    const isFirstLoad = data === null;

    try {
      if (isFirstLoad) {
        setInitialLoading(true);
      } else {
        setRefreshing(true);
      }

      setError(null);

      const currentData = await fetchCosts(period);

      setData(currentData);
      setFallback30dData(null);

      const currentRecordCount =
        currentData.summary?.recordCount ?? 0;

      const currentCost =
        currentData.summary?.totalSourceCost ?? 0;

      const shouldLoadFallback =
        (period === "today" || period === "7d") &&
        currentRecordCount === 0 &&
        currentCost <= 0;

      if (shouldLoadFallback) {
        try {
          setLoadingFallback(true);

          const fallback = await fetchCosts("30d");

          setFallback30dData(fallback);
        } catch {
          setFallback30dData(null);
        } finally {
          setLoadingFallback(false);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load cost data."
      );

      // Important:
      // keep old data on screen when a refresh fails.
      if (isFirstLoad) {
        setData(null);
        setFallback30dData(null);
      }
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadCosts();
  }, [period]);

  const summary = data?.summary;

  const providers = useMemo(() => {
    return [...(data?.byProvider ?? [])]
      .filter(
        (item) => Number(item.sourceCost || 0) > 0
      )
      .sort(
        (a, b) => b.sourceCost - a.sourceCost
      );
  }, [data]);

  const models = useMemo(() => {
    return [...(data?.byModel ?? [])]
      .filter(
        (item) => Number(item.sourceCost || 0) > 0
      )
      .sort(
        (a, b) => b.sourceCost - a.sourceCost
      );
  }, [data]);

  const records = useMemo(() => {
    return [...(data?.records ?? [])]
      .filter(
        (record) =>
          record.cost.amount != null &&
          isVerified(record.accuracy)
      )
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() -
          new Date(a.timestamp).getTime()
      );
  }, [data]);

  const totalCost =
    summary?.totalSourceCost ?? 0;

  const topProvider =
    providers[0] ?? null;

  const topModel =
    models[0] ?? null;

  const currency =
    summary?.currency ??
    fallback30dData?.summary?.currency ??
    "CNY";

  const hasCurrentCost =
    totalCost > 0 && records.length > 0;

  const fallback30dCost =
    fallback30dData?.summary?.totalSourceCost ?? 0;

  const fallback30dRecords =
    fallback30dData?.summary?.sourceCostRecordCount ?? 0;

  const showSmartDataState =
    !initialLoading &&
    !error &&
    !hasCurrentCost &&
    (period === "today" || period === "7d") &&
    (fallback30dCost > 0 || fallback30dRecords > 0);

  const showTrueEmptyState =
    !initialLoading &&
    !error &&
    !hasCurrentCost &&
    !showSmartDataState &&
    (data?.summary?.recordCount ?? 0) === 0;

  const modelPercent = (cost: number) => {
    if (totalCost <= 0) {
      return 0;
    }

    return Math.min(100, (cost / totalCost) * 100);
  };

  const dailyCosts = useMemo(() => {
    const map = new Map<
      string,
      {
        cost: number;
        currency: string | null;
      }
    >();

    for (const record of records) {
      if (record.cost.amount == null) {
        continue;
      }

      const date = formatDate(record.timestamp);

      const existing = map.get(date);

      map.set(date, {
        cost:
          (existing?.cost ?? 0) +
          Number(record.cost.amount),
        currency:
          existing?.currency ??
          record.cost.currency,
      });
    }

    return Array.from(map.entries())
      .map(([date, value]) => ({
        date,
        ...value,
      }))
      .sort((a, b) =>
        a.date.localeCompare(b.date)
      );
  }, [records]);

  const maxDailyCost = Math.max(
    ...dailyCosts.map((item) => item.cost),
    0
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        padding: "32px",
        color: "#111827",
      }}
    >
      <div
        style={{
          maxWidth: "1180px",
          margin: "0 auto",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "20px",
            marginBottom: "28px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "#64748b",
                marginBottom: "8px",
              }}
            >
              MONITOR / COSTS
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: "32px",
                lineHeight: 1.15,
                fontWeight: 800,
              }}
            >
              Cost Breakdown
            </h1>

            <p
              style={{
                margin: "10px 0 0",
                color: "#64748b",
                fontSize: "15px",
              }}
            >
              See exactly where your recorded AI cost is going.
            </p>
          </div>

          <button
            onClick={loadCosts}
            disabled={initialLoading || refreshing}
            style={{
              border: "1px solid #d1d5db",
              background: "#ffffff",
              borderRadius: "9px",
              padding: "10px 16px",
              cursor:
                initialLoading || refreshing
                  ? "default"
                  : "pointer",
              fontWeight: 600,
              color: "#374151",
              opacity:
                initialLoading || refreshing
                  ? 0.65
                  : 1,
            }}
          >
            {refreshing
              ? "Refreshing..."
              : "↻ Refresh"}
          </button>
        </div>

        {/* Period */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "22px",
            flexWrap: "wrap",
          }}
        >
          {(
            [
              ["today", "Today"],
              ["7d", "Last 7 days"],
              ["30d", "Last 30 days"],
              ["all", "All time"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setPeriod(value)}
              disabled={initialLoading || refreshing}
              style={{
                border:
                  period === value
                    ? "1px solid #111827"
                    : "1px solid #d1d5db",
                background:
                  period === value
                    ? "#111827"
                    : "#ffffff",
                color:
                  period === value
                    ? "#ffffff"
                    : "#374151",
                borderRadius: "8px",
                padding: "8px 13px",
                fontSize: "13px",
                fontWeight: 600,
                cursor:
                  initialLoading || refreshing
                    ? "default"
                    : "pointer",
                opacity:
                  initialLoading || refreshing
                    ? 0.75
                    : 1,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div
            style={{
              marginBottom: "20px",
              padding: "14px 16px",
              borderRadius: "10px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              fontSize: "14px",
            }}
          >
            {error}
          </div>
        )}

        {/* Initial loading state */}
        {initialLoading && (
          <section
            style={{
              marginBottom: "20px",
              padding: "18px 22px",
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "14px",
              color: "#64748b",
              fontSize: "14px",
            }}
          >
            Loading cost data...
          </section>
        )}

        {/* Smart data state */}
        {showSmartDataState && (
          <section
            style={{
              marginBottom: "20px",
              padding: "20px 22px",
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "14px",
            }}
          >
            <div
              style={{
                fontSize: "14px",
                color: "#374151",
                lineHeight: 1.6,
              }}
            >
              No verified cost recorded in the last{" "}
              {period === "today" ? "day" : "7 days"}.
            </div>

            {loadingFallback ? (
              <div
                style={{
                  marginTop: "8px",
                  color: "#64748b",
                  fontSize: "14px",
                }}
              >
                Checking the last 30 days...
              </div>
            ) : (
              <>
                <div
                  style={{
                    marginTop: "8px",
                    color: "#374151",
                    fontSize: "14px",
                  }}
                >
                  You have{" "}
                  <strong>
                    {money(
                      fallback30dCost,
                      fallback30dData?.summary?.currency ??
                        currency
                    )}
                  </strong>{" "}
                  of verified spending in the last 30 days.
                </div>

                <button
                  onClick={() => setPeriod("30d")}
                  style={{
                    marginTop: "14px",
                    border: "1px solid #111827",
                    background: "#111827",
                    color: "#ffffff",
                    borderRadius: "8px",
                    padding: "9px 14px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  View last 30 days
                </button>
              </>
            )}
          </section>
        )}

        {/* True empty state */}
        {showTrueEmptyState && (
          <section
            style={{
              marginBottom: "20px",
              padding: "20px 22px",
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "14px",
            }}
          >
            <div
              style={{
                fontSize: "14px",
                color: "#374151",
                lineHeight: 1.6,
              }}
            >
              No recorded cost data is available yet.
            </div>

            <div
              style={{
                marginTop: "6px",
                color: "#64748b",
                fontSize: "13px",
              }}
            >
              Import an official usage export to start tracking
              verified AI costs.
            </div>

            <a
              href="/usage/import"
              style={{
                display: "inline-block",
                marginTop: "14px",
                textDecoration: "none",
                border: "1px solid #111827",
                background: "#111827",
                color: "#ffffff",
                borderRadius: "8px",
                padding: "9px 14px",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              Import usage
            </a>
          </section>
        )}

        {/* Hero cost */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(280px, 1.5fr) repeat(2, minmax(180px, 1fr))",
            gap: "16px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              background: "#111827",
              color: "#ffffff",
              borderRadius: "16px",
              padding: "24px",
              minHeight: "150px",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                opacity: 0.65,
              }}
            >
              TOTAL RECORDED COST
            </div>

            <div
              style={{
                marginTop: "14px",
                fontSize: "36px",
                fontWeight: 800,
                letterSpacing: "-0.03em",
              }}
            >
              {initialLoading
                ? "..."
                : money(
                    totalCost,
                    summary?.currency ?? currency
                  )}
            </div>

            <div
              style={{
                marginTop: "10px",
                fontSize: "13px",
                opacity: 0.7,
              }}
            >
              {initialLoading
                ? "Loading verified records..."
                : `${
                    summary?.sourceCostRecordCount ?? 0
                  } verified cost records`}
            </div>
          </div>

          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "16px",
              padding: "22px",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#64748b",
              }}
            >
              LARGEST PROVIDER
            </div>

            <div
              style={{
                marginTop: "16px",
                fontSize: "21px",
                fontWeight: 750,
              }}
            >
              {initialLoading
                ? "Loading..."
                : topProvider?.provider ?? "—"}
            </div>

            <div
              style={{
                marginTop: "7px",
                color: "#64748b",
                fontSize: "13px",
              }}
            >
              {initialLoading
                ? "Checking cost data"
                : topProvider
                  ? money(
                      topProvider.sourceCost,
                      summary?.currency ?? currency
                    )
                  : "No recorded cost"}
            </div>
          </div>

          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "16px",
              padding: "22px",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#64748b",
              }}
            >
              LARGEST MODEL
            </div>

            <div
              style={{
                marginTop: "16px",
                fontSize: "17px",
                fontWeight: 750,
                wordBreak: "break-word",
              }}
            >
              {initialLoading
                ? "Loading..."
                : topModel?.model ?? "—"}
            </div>

            <div
              style={{
                marginTop: "7px",
                color: "#64748b",
                fontSize: "13px",
              }}
            >
              {initialLoading
                ? "Checking cost data"
                : topModel
                  ? money(
                      topModel.sourceCost,
                      summary?.currency ?? currency
                    )
                  : "No recorded cost"}
            </div>
          </div>
        </section>

        {/* Main breakdown */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(0, 1fr) minmax(0, 1fr)",
            gap: "20px",
            marginBottom: "20px",
          }}
        >
          <Card title="By Provider">
            {initialLoading ? (
              <LoadingText />
            ) : providers.length === 0 ? (
              <EmptyState />
            ) : (
              providers.map((item) => {
                const percent = modelPercent(
                  item.sourceCost
                );

                return (
                  <div
                    key={item.provider}
                    style={{
                      marginBottom: "18px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        marginBottom: "7px",
                        fontSize: "14px",
                      }}
                    >
                      <strong>{item.provider}</strong>

                      <span
                        style={{
                          fontWeight: 700,
                        }}
                      >
                        {money(
                          item.sourceCost,
                          summary?.currency ?? currency
                        )}
                      </span>
                    </div>

                    <div
                      style={{
                        height: "8px",
                        background: "#e5e7eb",
                        borderRadius: "999px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${percent}%`,
                          height: "100%",
                          background: "#111827",
                          borderRadius: "999px",
                        }}
                      />
                    </div>

                    <div
                      style={{
                        marginTop: "5px",
                        color: "#64748b",
                        fontSize: "12px",
                      }}
                    >
                      {percent.toFixed(1)}% of recorded cost
                    </div>
                  </div>
                );
              })
            )}
          </Card>

          <Card title="By Model">
            {initialLoading ? (
              <LoadingText />
            ) : models.length === 0 ? (
              <EmptyState />
            ) : (
              models.map((item) => {
                const percent = modelPercent(
                  item.sourceCost
                );

                return (
                  <div
                    key={`${item.provider}-${item.model}`}
                    style={{
                      marginBottom: "18px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        marginBottom: "7px",
                        fontSize: "14px",
                      }}
                    >
                      <div>
                        <strong>{item.model}</strong>

                        <div
                          style={{
                            marginTop: "3px",
                            color: "#64748b",
                            fontSize: "12px",
                          }}
                        >
                          {item.provider}
                        </div>
                      </div>

                      <span
                        style={{
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {money(
                          item.sourceCost,
                          summary?.currency ?? currency
                        )}
                      </span>
                    </div>

                    <div
                      style={{
                        height: "8px",
                        background: "#e5e7eb",
                        borderRadius: "999px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${percent}%`,
                          height: "100%",
                          background: "#475569",
                          borderRadius: "999px",
                        }}
                      />
                    </div>

                    <div
                      style={{
                        marginTop: "5px",
                        color: "#64748b",
                        fontSize: "12px",
                      }}
                    >
                      {percent.toFixed(1)}% of recorded cost
                    </div>
                  </div>
                );
              })
            )}
          </Card>
        </section>

        {/* Cost over time */}
        <div
          style={{
            marginBottom: "20px",
          }}
        >
          <Card title="Cost over time">
            {initialLoading ? (
              <LoadingText />
            ) : dailyCosts.length === 0 ? (
              <EmptyState />
            ) : (
              <div>
                {dailyCosts.map((item) => {
                  const width =
                    maxDailyCost > 0
                      ? (item.cost / maxDailyCost) * 100
                      : 0;

                  return (
                    <div
                      key={item.date}
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "95px minmax(0, 1fr) 100px",
                        alignItems: "center",
                        gap: "12px",
                        marginBottom: "14px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "13px",
                          color: "#64748b",
                        }}
                      >
                        {item.date}
                      </div>

                      <div
                        style={{
                          height: "18px",
                          background: "#f1f5f9",
                          borderRadius: "5px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${width}%`,
                            height: "100%",
                            background: "#111827",
                            borderRadius: "5px",
                            minWidth:
                              item.cost > 0
                                ? "3px"
                                : "0",
                          }}
                        />
                      </div>

                      <div
                        style={{
                          textAlign: "right",
                          fontSize: "13px",
                          fontWeight: 700,
                        }}
                      >
                        {money(
                          item.cost,
                          item.currency
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Largest cost driver */}
        <div
          style={{
            marginBottom: "20px",
          }}
        >
          <Card title="Where is the money going?">
            {initialLoading ? (
              <LoadingText />
            ) : topModel ? (
              <div
                style={{
                  padding: "18px",
                  borderRadius: "10px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#64748b",
                    marginBottom: "7px",
                  }}
                >
                  LARGEST RECORDED COST DRIVER
                </div>

                <div
                  style={{
                    fontSize: "19px",
                    fontWeight: 800,
                  }}
                >
                  {topModel.model}
                </div>

                <div
                  style={{
                    marginTop: "6px",
                    color: "#64748b",
                    fontSize: "13px",
                  }}
                >
                  Provider: {topModel.provider}
                </div>

                <div
                  style={{
                    marginTop: "12px",
                    fontSize: "24px",
                    fontWeight: 800,
                  }}
                >
                  {money(
                    topModel.sourceCost,
                    summary?.currency ?? currency
                  )}
                </div>

                <div
                  style={{
                    marginTop: "4px",
                    color: "#64748b",
                    fontSize: "12px",
                  }}
                >
                  {modelPercent(
                    topModel.sourceCost
                  ).toFixed(1)}
                  % of recorded cost in this period
                </div>
              </div>
            ) : (
              <EmptyState />
            )}
          </Card>
        </div>

        {/* Data integrity */}
        <div
          style={{
            padding: "14px 16px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "10px",
            color: "#64748b",
            fontSize: "12px",
            lineHeight: 1.6,
          }}
        >
          <strong
            style={{
              color: "#475569",
            }}
          >
            Data note:
          </strong>{" "}
          This page uses verified recorded source costs only.
          It does not mix historical costs into the selected
          period, infer application attribution, or invent
          savings estimates.
        </div>
      </div>
    </main>
  );
}