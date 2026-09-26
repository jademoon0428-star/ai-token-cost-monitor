"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type SavingData = {
  success: boolean;
  timezone: string;
  period: {
    type?: string;
    start?: string;
    end?: string;
  };
  dataPolicy: {
    monetarySource: string;
    accuracy: string;
    savingsEstimates: boolean;
    message: string;
  };
  summary: {
    totalVerifiedCost: number;
    currency: string | null;
    verifiedRecordCount: number;
    visibleRecordCount: number;
  };
  biggestCostDriver: {
    provider: string | null;
    model: string | null;
    cost: number;
    currency: string | null;
    percentage: number;
    recordCount: number;
  } | null;
  highestSpendingDay: {
    date: string | null;
    cost: number;
    currency: string | null;
    percentage: number;
  } | null;
  cacheEfficiency: {
    cachedInputPercentage: number;
    inputTokens: number;
    cachedTokens: number;
  } | null;
  recommendations: Array<{
    id: string;
    severity: "high" | "medium" | "low";
    title: string;
    explanation: string;
    action: string;
    evidence: Array<{
      type: string;
      value: string;
    }>;
  }>;
  modelBreakdown: Array<{
    provider: string | null;
    model: string | null;
    cost: number;
    currency: string | null;
    percentage: number;
    recordCount: number;
  }>;
  dailySpending: Array<{
    date: string;
    cost: number;
  }>;
};

const PERIOD = "30d";
const TIMEZONE = "Asia/Singapore";
const REQUEST_TIMEOUT = 15000;

function formatMoney(value: number, currency: string | null) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  if (!currency) {
    return value.toFixed(2);
  }

  if (currency === "CNY") {
    return `¥${value.toFixed(2)}`;
  }

  return `${value.toFixed(2)} ${currency}`;
}

function formatDate(date: string | null) {
  if (!date) {
    return "—";
  }

  const parsed = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return parsed.toLocaleDateString("en-SG", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: TIMEZONE,
  });
}

function severityStyle(
  severity: "high" | "medium" | "low"
) {
  if (severity === "high") {
    return {
      badge: "bg-red-100 text-red-700",
      icon: "🔴",
    };
  }

  if (severity === "medium") {
    return {
      badge: "bg-amber-100 text-amber-700",
      icon: "🟡",
    };
  }

  return {
    badge: "bg-emerald-100 text-emerald-700",
    icon: "🟢",
  };
}

function LoadingState() {
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-40 rounded bg-slate-200" />
            <div className="h-4 w-80 rounded bg-slate-200" />

            <div className="flex gap-2">
              <div className="h-6 w-24 rounded-full bg-slate-200" />
              <div className="h-6 w-32 rounded-full bg-slate-200" />
              <div className="h-6 w-36 rounded-full bg-slate-200" />
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="h-44 animate-pulse rounded-2xl bg-white shadow-sm" />
          <div className="h-44 animate-pulse rounded-2xl bg-white shadow-sm" />
          <div className="h-44 animate-pulse rounded-2xl bg-white shadow-sm" />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-48 rounded bg-slate-200" />
            <div className="h-4 w-72 rounded bg-slate-200" />
            <div className="h-20 rounded bg-slate-100" />
          </div>
        </section>
      </div>
    </main>
  );
}

export default function SavingPage() {
  const [data, setData] = useState<SavingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSaving = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        setError("");

        const controller = new AbortController();

        const timeoutId = window.setTimeout(() => {
          controller.abort();
        }, REQUEST_TIMEOUT);

        const abortHandler = () => {
          controller.abort();
        };

        if (signal) {
          if (signal.aborted) {
            controller.abort();
          } else {
            signal.addEventListener("abort", abortHandler, {
              once: true,
            });
          }
        }

        try {
          const response = await fetch(
            `/api/saving?period=${PERIOD}&timezone=${encodeURIComponent(
              TIMEZONE
            )}`,
            {
              method: "GET",
              cache: "no-store",
              signal: controller.signal,
            }
          );

          if (!response.ok) {
            throw new Error(
              `Unable to load saving insights. (${response.status})`
            );
          }

          const result =
            (await response.json()) as SavingData;

          if (!result || result.success !== true) {
            throw new Error(
              "Saving data is unavailable."
            );
          }

          setData(result);
        } finally {
          window.clearTimeout(timeoutId);

          if (signal) {
            signal.removeEventListener(
              "abort",
              abortHandler
            );
          }
        }
      } catch (err) {
        if (
          err instanceof DOMException &&
          err.name === "AbortError"
        ) {
          if (!signal?.aborted) {
            setError(
              "Saving data took too long to load. Please try again."
            );
          }

          return;
        }

        console.error(
          "[Saving] Failed to load:",
          err
        );

        setError(
          "Saving data is temporarily unavailable. Please try again."
        );
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadSaving(controller.signal);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadSaving]);

  const chartData = useMemo(() => {
    if (!data?.dailySpending) {
      return [];
    }

    return [...data.dailySpending].sort(
      (a, b) =>
        new Date(a.date).getTime() -
        new Date(b.date).getTime()
    );
  }, [data]);

  const maxDailyCost = useMemo(() => {
    if (!chartData.length) {
      return 0;
    }

    return Math.max(
      ...chartData.map((item) => item.cost)
    );
  }, [chartData]);

  if (loading && !data) {
    return <LoadingState />;
  }

  if (error && !data) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-bold text-slate-900">
              Saving
            </h1>

            <p className="mt-3 text-red-600">
              {error}
            </p>

            <button
              onClick={() => {
                void loadSaving();
              }}
              className="mt-6 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Try again
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!data) {
    return <LoadingState />;
  }

  const currency = data.summary.currency;
  const totalCost = data.summary.totalVerifiedCost;

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-3">
<h1 className="text-3xl font-bold tracking-tight text-slate-900">
                  Saving
                </h1>
              </div>

                <p className="mt-2 text-slate-600">
                Find where your AI spending can be reduced.
              </p>

              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                  {currency ?? "Unknown currency"}
                </span>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                  Verified official data
                </span>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                  {data.timezone}
                </span>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                  Last 30 days
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                void loadSaving();
              }}
              disabled={loading}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Loading..." : "Refresh ↻"}
            </button>
          </div>
        </section>

        {/* Overview cards */}
        <section className="grid gap-4 md:grid-cols-3">
          {/* Biggest model */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Biggest cost driver
            </p>

            {data.biggestCostDriver ? (
              <>
                <p className="mt-3 break-all text-xl font-bold text-slate-900">
                  {data.biggestCostDriver.model}
                </p>

                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {formatMoney(
                    data.biggestCostDriver.cost,
                    currency
                  )}
                </p>

                <p className="mt-2 text-sm text-slate-500">
                  {data.biggestCostDriver.percentage}% of verified cost
                </p>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-slate-900"
                    style={{
                      width: `${Math.min(
                        data.biggestCostDriver.percentage,
                        100
                      )}%`,
                    }}
                  />
                </div>
              </>
            ) : (
              <p className="mt-4 text-slate-500">
                No verified model cost available.
              </p>
            )}
          </div>

          {/* Highest day */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Highest spending day
            </p>

            {data.highestSpendingDay ? (
              <>
                <p className="mt-3 text-xl font-bold text-slate-900">
                  {formatDate(
                    data.highestSpendingDay.date
                  )}
                </p>

                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {formatMoney(
                    data.highestSpendingDay.cost,
                    currency
                  )}
                </p>

                <p className="mt-2 text-sm text-slate-500">
                  {data.highestSpendingDay.percentage}% of period cost
                </p>
              </>
            ) : (
              <p className="mt-4 text-slate-500">
                No verified daily cost available.
              </p>
            )}
          </div>

          {/* Cache */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Cache efficiency
            </p>

            {data.cacheEfficiency ? (
              <>
                <p className="mt-3 text-3xl font-bold text-slate-900">
                  {data.cacheEfficiency.cachedInputPercentage.toFixed(
                    1
                  )}
                  %
                </p>

                <p className="mt-2 text-sm font-medium text-emerald-600">
                  Strong cache usage
                </p>

                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Cached input:{" "}
                  {data.cacheEfficiency.cachedTokens.toLocaleString()}{" "}
                  /{" "}
                  {data.cacheEfficiency.inputTokens.toLocaleString()}
                </p>
              </>
            ) : (
              <p className="mt-4 text-slate-500">
                Not enough verified token data.
              </p>
            )}
          </div>
        </section>

        {/* Spending summary */}
        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Verified spending
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {formatMoney(totalCost, currency)}
            </p>

            <p className="mt-2 text-sm text-slate-500">
              Based on {data.summary.verifiedRecordCount} verified billing records.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              What this page can prove
            </p>

            <p className="mt-2 text-sm leading-6 text-slate-700">
              It can identify where verified spending is concentrated.
              It cannot yet prove how much money would be saved by changing
              a model or workflow.
            </p>
          </div>
        </section>

        {/* Recommendations */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Recommendations
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Evidence-based suggestions from your verified spending.
            </p>
          </div>

          <div className="mt-6 space-y-4">
            {data.recommendations.length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">
                No optimization recommendation is currently supported
                by the available verified data.
              </div>
            ) : (
              data.recommendations.map(
                (recommendation) => {
                  const style =
                    severityStyle(
                      recommendation.severity
                    );

                  return (
                    <div
                      key={recommendation.id}
                      className="rounded-xl border border-slate-200 p-5"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="flex gap-3">
                          <span className="text-xl">
                            {style.icon}
                          </span>

                          <div>
                            <h3 className="font-semibold text-slate-900">
                              {recommendation.title}
                            </h3>

                            <p className="mt-2 text-sm leading-6 text-slate-600">
                              {recommendation.explanation}
                            </p>

                            <p className="mt-3 text-sm font-medium text-slate-800">
                              Action:{" "}
                              <span className="font-normal">
                                {recommendation.action}
                              </span>
                            </p>
                          </div>
                        </div>

                        <span
                          className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${style.badge}`}
                        >
                          {recommendation.severity}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {recommendation.evidence.map(
                          (item, index) => (
                            <span
                              key={`${item.type}-${index}`}
                              className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"
                            >
                              <span className="font-medium">
                                {item.type}:
                              </span>{" "}
                              {item.value}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  );
                }
              )
            )}
          </div>
        </section>

        {/* Model breakdown */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Model spending
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Where your verified AI cost is concentrated.
            </p>
          </div>

          <div className="mt-6 space-y-5">
            {data.modelBreakdown.map(
              (model) => (
                <div key={`${model.provider}-${model.model}`}>
                  <div className="mb-2 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {model.model}
                      </p>

                      <p className="text-xs text-slate-500">
                        {model.recordCount} records
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-slate-900">
                        {formatMoney(
                          model.cost,
                          currency
                        )}
                      </p>

                      <p className="text-xs text-slate-500">
                        {model.percentage}%
                      </p>
                    </div>
                  </div>

                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-slate-800"
                      style={{
                        width: `${Math.min(
                          model.percentage,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )
            )}
          </div>
        </section>

        {/* Daily spending */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Daily spending
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Verified spending by local calendar date.
            </p>
          </div>

          {chartData.length === 0 ? (
            <div className="mt-6 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">
              No verified daily spending in this period.
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {chartData.map((item) => {
                const width =
                  maxDailyCost > 0
                    ? (item.cost / maxDailyCost) * 100
                    : 0;

                return (
                  <div key={item.date}>
                    <div className="mb-2 flex items-center justify-between gap-4 text-xs">
                      <span className="font-medium text-slate-600">
                        {formatDate(item.date)}
                      </span>

                      <span className="font-semibold text-slate-800">
                        {formatMoney(
                          item.cost,
                          currency
                        )}
                      </span>
                    </div>

                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-slate-700"
                        style={{
                          width: `${width}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Data policy */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">
            Data policy
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Cost source
              </p>

              <p className="mt-1 text-sm text-slate-700">
                {data.dataPolicy.monetarySource}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Accuracy
              </p>

              <p className="mt-1 text-sm text-slate-700">
                {data.dataPolicy.accuracy}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Savings estimates
              </p>

              <p className="mt-1 text-sm text-slate-700">
                Not shown
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            {data.dataPolicy.message}
          </div>
        </section>
      </div>
    </main>
  );
}