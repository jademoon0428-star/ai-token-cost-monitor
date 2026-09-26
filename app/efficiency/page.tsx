"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type EfficiencyData = {
  success: boolean;
  timezone: string;
  period?: {
    type?: string;
    start?: string | null;
    end?: string | null;
  };
  verifiedRecordCount?: number;
  visibleRecordCount?: number;
  tokens?: {
    totalTokens?: number;
    inputTokens?: number;
    cachedTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
  };
  ratios?: {
    cacheHitRate?: number;
    outputShare?: number;
    reasoningShare?: number;
  };
  cost?: {
    verifiedCost?: number | null;
    currency?: string | null;
    costPerMillionTokens?: number | null;
  };
  byModel?: Array<{
    provider?: string;
    model?: string;
    recordCount?: number;
    sourceCost?: number;
  }>;
  modelEfficiency?: Array<{
    provider?: string;
    model?: string;
    recordCount?: number;
    totalTokens?: number;
    inputTokens?: number;
    cachedTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    verifiedCost?: number | null;
    currency?: string | null;
    costPerMillionTokens?: number | null;
    cacheHitRate?: number;
    outputShare?: number;
    reasoningShare?: number;
  }>;
  dailyCost?: Array<{
    date?: string;
    cost?: number;
  }>;
  dailyEfficiency?: Array<{
    date?: string;
    recordCount?: number;
    totalTokens?: number;
    inputTokens?: number;
    cachedTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    verifiedCost?: number | null;
    currency?: string | null;
    costPerMillionTokens?: number | null;
    cacheHitRate?: number;
    outputShare?: number;
    reasoningShare?: number;
  }>;
};

const PERIODS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All" },
] as const;

const DEFAULT_PERIOD = "30d";
const TIMEZONE = "Asia/Singapore";
const REQUEST_TIMEOUT = 15000;

const PERIOD_DISPLAY: Record<string, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};

function formatTokens(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  return value.toLocaleString("en-US");
}

function formatMoney(value: number | null, currency: string | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "Unavailable";
  }

  if (!currency) {
    return value.toFixed(2);
  }

  if (currency === "CNY") {
    return `¥${value.toFixed(2)}`;
  }

  return `${value.toFixed(2)} ${currency}`;
}

function formatCostPerMillion(
  value: number | null,
  currency: string | null
): string {
  if (value === null || !Number.isFinite(value)) {
    return "Unavailable";
  }

  if (!currency) {
    return `${value.toFixed(4)} / 1M tokens`;
  }

  if (currency === "CNY") {
    return `¥${value.toFixed(4)} / 1M tokens`;
  }

  return `${value.toFixed(4)} ${currency} / 1M tokens`;
}

function formatRatio(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function LoadingState() {
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-44 rounded bg-slate-200" />
            <div className="h-4 w-96 rounded bg-slate-200" />
            <div className="h-6 w-64 rounded bg-slate-200" />
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="h-36 animate-pulse rounded-2xl bg-white shadow-sm"
            />
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-52 rounded bg-slate-200" />
            <div className="h-4 w-80 rounded bg-slate-200" />
            <div className="h-20 rounded bg-slate-100" />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="animate-pulse space-y-3">
            <div className="h-5 w-44 rounded bg-slate-200" />
            <div className="h-5 w-72 rounded bg-slate-200" />
            <div className="h-5 w-60 rounded bg-slate-200" />
          </div>
        </section>
      </div>
    </main>
  );
}

export default function EfficiencyPage() {
  const [data, setData] = useState<EfficiencyData | null>(null);
  const [period, setPeriod] = useState<string>(DEFAULT_PERIOD);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);

  const loadEfficiency = useCallback(
    async (selectedPeriod: string, signal?: AbortSignal) => {
      controllerRef.current?.abort();

      const controller = new AbortController();
      controllerRef.current = controller;

      try {
        setLoading(true);
        setError("");

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
            `/api/efficiency?period=${selectedPeriod}&timezone=${encodeURIComponent(
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
              `Unable to load efficiency data. (${response.status})`
            );
          }

          const result = (await response.json()) as EfficiencyData;

          if (!result || result.success !== true) {
            throw new Error("Efficiency data is unavailable.");
          }

          setData(result);
        } finally {
          window.clearTimeout(timeoutId);

          if (signal) {
            signal.removeEventListener("abort", abortHandler);
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          if (!signal?.aborted) {
            setError(
              "Efficiency data took too long to load. Please try again."
            );
          }

          return;
        }

        console.error("[Efficiency] Failed to load:", err);

        setError(
          "Efficiency data is temporarily unavailable. Please try again."
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
      void loadEfficiency(DEFAULT_PERIOD, controller.signal);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadEfficiency]);

  const changePeriod = useCallback(
    (nextPeriod: string) => {
      if (nextPeriod === period) {
        return;
      }

      setPeriod(nextPeriod);
      void loadEfficiency(nextPeriod);
    },
    [period, loadEfficiency]
  );

  if (loading && !data) {
    return <LoadingState />;
  }

  if (error && !data) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-bold text-slate-900">
              AI Efficiency
            </h1>

            <p className="mt-3 text-red-600">{error}</p>

            <button
              onClick={() => {
                void loadEfficiency(period);
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

  const tokens = data?.tokens;
  const ratios = data?.ratios;
  const cost = data?.cost;

  const verifiedRecordCount = data?.verifiedRecordCount ?? 0;
  const hasVerifiedData = verifiedRecordCount > 0;
  const currency = cost?.currency ?? null;
  const periodDisplay =
    PERIOD_DISPLAY[data?.period?.type ?? ""] ??
    PERIOD_DISPLAY[DEFAULT_PERIOD] ??
    "—";

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                  AI Efficiency
                </h1>
              </div>

              <p className="mt-2 text-slate-600">
                Token and cost efficiency from verified Money Layer data.
              </p>

              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                  {currency ?? "Unknown currency"}
                </span>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                  Verified official data
                </span>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                  {data?.timezone ?? TIMEZONE}
                </span>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                  {periodDisplay}
                </span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-3">
              <div className="flex flex-wrap gap-2">
                {PERIODS.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => {
                      changePeriod(item.key);
                    }}
                    disabled={loading}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      period === item.key
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <button
                onClick={() => {
                  void loadEfficiency(period);
                }}
                disabled={loading}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Loading..." : "Refresh ↻"}
              </button>
            </div>
          </div>
        </section>

        {error && data && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">
            {error}
          </section>
        )}

        {!hasVerifiedData ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-2xl font-bold text-slate-900">
              AI Efficiency
            </p>

            <p className="mt-3 text-slate-600">
              No verified efficiency data is available for this period.
            </p>
          </section>
        ) : (
          <>
            {/* KPI area */}
            <section className="grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-medium text-slate-500">
                  Total Tokens
                </p>

                <p className="mt-3 text-3xl font-bold text-slate-900">
                  {formatTokens(tokens?.totalTokens)}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-medium text-slate-500">
                  Verified Cost
                </p>

                <p className="mt-3 text-3xl font-bold text-slate-900">
                  {formatMoney(cost?.verifiedCost ?? null, currency)}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-medium text-slate-500">
                  Cost / 1M Tokens
                </p>

                <p className="mt-3 text-3xl font-bold text-slate-900">
                  {formatCostPerMillion(
                    cost?.costPerMillionTokens ?? null,
                    currency
                  )}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-medium text-slate-500">
                  Cache Hit Rate
                </p>

                <p className="mt-3 text-3xl font-bold text-slate-900">
                  {formatRatio(ratios?.cacheHitRate)}
                </p>
              </div>
            </section>

            {/* Token breakdown */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Token breakdown
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Verified token usage by input, cache, output, and reasoning.
                </p>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Input
                  </p>

                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {formatTokens(tokens?.inputTokens)}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Cached
                  </p>

                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {formatTokens(tokens?.cachedTokens)}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Output
                  </p>

                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {formatTokens(tokens?.outputTokens)}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Reasoning
                  </p>

                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {formatTokens(tokens?.reasoningTokens)}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                Cached tokens are included in input tokens.
              </div>
            </section>

            {/* Efficiency ratios */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Efficiency ratios
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Headline ratios calculated from verified token usage.
                </p>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-slate-200 p-5">
                  <p className="text-sm font-medium text-slate-500">
                    Cache Hit Rate
                  </p>

                  <p className="mt-2 text-3xl font-bold text-slate-900">
                    {formatRatio(ratios?.cacheHitRate)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-5">
                  <p className="text-sm font-medium text-slate-500">
                    Output Share
                  </p>

                  <p className="mt-2 text-3xl font-bold text-slate-900">
                    {formatRatio(ratios?.outputShare)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-5">
                  <p className="text-sm font-medium text-slate-500">
                    Reasoning Share
                  </p>

                  <p className="mt-2 text-3xl font-bold text-slate-900">
                    {formatRatio(ratios?.reasoningShare)}
                  </p>
                </div>
              </div>
            </section>

            {/* Model efficiency */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Model Efficiency
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Per-model token and cost efficiency from verified Money Layer data.
                </p>
              </div>

              <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-3 font-semibold">
                        Model
                      </th>

                      <th className="px-4 py-3 font-semibold">
                        Provider
                      </th>

                      <th className="px-4 py-3 text-right font-semibold">
                        Tokens
                      </th>

                      <th className="px-4 py-3 text-right font-semibold">
                        Verified Cost
                      </th>

                      <th className="px-4 py-3 text-right font-semibold">
                        Cost / 1M Tokens
                      </th>

                      <th className="px-4 py-3 text-right font-semibold">
                        Cache Hit Rate
                      </th>

                      <th className="px-4 py-3 text-right font-semibold">
                        Output Share
                      </th>

                      <th className="px-4 py-3 text-right font-semibold">
                        Reasoning Share
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {(data?.modelEfficiency ?? []).map((item) => (
                      <tr
                        key={`${item.provider ?? ""}|${item.model ?? ""}`}
                        className="border-b border-slate-100 last:border-b-0"
                      >
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {item.model ?? "—"}
                        </td>

                        <td className="px-4 py-3 text-slate-600">
                          {item.provider ?? "—"}
                        </td>

                        <td className="px-4 py-3 text-right text-slate-600">
                          {formatTokens(item.totalTokens)}
                        </td>

                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          {formatMoney(
                            item.verifiedCost ?? null,
                            item.currency ?? currency
                          )}
                        </td>

                        <td className="px-4 py-3 text-right text-slate-600">
                          {formatCostPerMillion(
                            item.costPerMillionTokens ?? null,
                            item.currency ?? currency
                          )}
                        </td>

                        <td className="px-4 py-3 text-right text-slate-600">
                          {formatRatio(item.cacheHitRate)}
                        </td>

                        <td className="px-4 py-3 text-right text-slate-600">
                          {formatRatio(item.outputShare)}
                        </td>

                        <td className="px-4 py-3 text-right text-slate-600">
                          {formatRatio(item.reasoningShare)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                Model efficiency is a per-model observation of verified
                source-reported usage. It is not a rating, score, or
                recommendation, and it never includes Activity Layer data.
              </div>
            </section>

            {/* Cost by model */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Cost by model
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Verified source-reported cost attributed to each model.
                </p>
              </div>

              <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-3 font-semibold">
                        Model
                      </th>

                      <th className="px-4 py-3 font-semibold">
                        Provider
                      </th>

                      <th className="px-4 py-3 text-right font-semibold">
                        Records
                      </th>

                      <th className="px-4 py-3 text-right font-semibold">
                        Cost
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {(data?.byModel ?? []).map((item) => (
                      <tr
                        key={`${item.provider ?? ""}|${item.model ?? ""}`}
                        className="border-b border-slate-100 last:border-b-0"
                      >
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {item.model ?? "—"}
                        </td>

                        <td className="px-4 py-3 text-slate-600">
                          {item.provider ?? "—"}
                        </td>

                        <td className="px-4 py-3 text-right text-slate-600">
                          {formatTokens(item.recordCount)}
                        </td>

                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          {formatMoney(
                            item.sourceCost ?? null,
                            currency
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                Only verified source-reported costs are shown. This is cost
                attribution per model, not a rating or recommendation.
              </div>
            </section>

            {/* Daily cost */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Daily cost
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Verified source-reported cost by day.
                </p>
              </div>

              <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-3 font-semibold">
                        Day
                      </th>

                      <th className="px-4 py-3 text-right font-semibold">
                        Cost
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {(data?.dailyCost ?? []).map((item) => (
                      <tr
                        key={item.date ?? ""}
                        className="border-b border-slate-100 last:border-b-0"
                      >
                        <td className="px-4 py-3 text-slate-900">
                          {item.date ?? "—"}
                        </td>

                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          {formatMoney(
                            item.cost ?? null,
                            currency
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Daily efficiency */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Daily Efficiency
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Per-day token and cost efficiency from verified Money Layer data.
                </p>
              </div>

              <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-3 font-semibold">
                        Date
                      </th>

                      <th className="px-4 py-3 text-right font-semibold">
                        Tokens
                      </th>

                      <th className="px-4 py-3 text-right font-semibold">
                        Verified Cost
                      </th>

                      <th className="px-4 py-3 text-right font-semibold">
                        Cost / 1M Tokens
                      </th>

                      <th className="px-4 py-3 text-right font-semibold">
                        Cache Hit Rate
                      </th>

                      <th className="px-4 py-3 text-right font-semibold">
                        Output Share
                      </th>

                      <th className="px-4 py-3 text-right font-semibold">
                        Reasoning Share
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {(data?.dailyEfficiency ?? []).map((item) => (
                      <tr
                        key={item.date ?? ""}
                        className="border-b border-slate-100 last:border-b-0"
                      >
                        <td className="px-4 py-3 text-slate-900">
                          {item.date ?? "—"}
                        </td>

                        <td className="px-4 py-3 text-right text-slate-600">
                          {formatTokens(item.totalTokens)}
                        </td>

                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          {formatMoney(
                            item.verifiedCost ?? null,
                            item.currency ?? currency
                          )}
                        </td>

                        <td className="px-4 py-3 text-right text-slate-600">
                          {formatCostPerMillion(
                            item.costPerMillionTokens ?? null,
                            item.currency ?? currency
                          )}
                        </td>

                        <td className="px-4 py-3 text-right text-slate-600">
                          {formatRatio(item.cacheHitRate)}
                        </td>

                        <td className="px-4 py-3 text-right text-slate-600">
                          {formatRatio(item.outputShare)}
                        </td>

                        <td className="px-4 py-3 text-right text-slate-600">
                          {formatRatio(item.reasoningShare)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                Daily efficiency uses the same Asia/Singapore calendar day and
                verified Money Layer source as the rest of this page. It is a
                chronological observation, not a ranking or a recommendation.
              </div>
            </section>

            {/* Evidence */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Evidence
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  What these efficiency numbers are based on.
                </p>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Verified records
                  </p>

                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {verifiedRecordCount}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Currency
                  </p>

                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {currency ?? "Unavailable"}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Period
                  </p>

                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {periodDisplay}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Timezone
                  </p>

                  <p className="mt-2 break-all text-2xl font-bold text-slate-900">
                    {data?.timezone ?? TIMEZONE}
                  </p>
                </div>
              </div>

              {cost?.verifiedCost === null ||
              cost?.verifiedCost === undefined ? (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                  Verified cost is unavailable for this period.
                </div>
              ) : null}

              <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                Efficiency metrics are calculated from verified Money Layer
                usage data. Activity evidence is not included in token or cost
                calculations.
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}