"use client";

import Link from "next/link";
import CoreModuleNav from "@/components/core-module-nav";
import { useEffect, useState } from "react";

type BudgetPeriod = "daily" | "weekly" | "monthly";

type BudgetState = {
  id: string | null;
  period: BudgetPeriod;
  budget_micros: number | null;
  spent_micros: number;
  remaining_micros: number | null;
  percent_used: number | null;
  forecast_micros: number | null;
  forecast_percent: number | null;
  status: "not_set" | "normal" | "near" | "over";
  currency: string | null;
  start: string;
  end: string;
  days_elapsed: number;
  days_in_period: number;
  has_data: boolean;
  currency_mismatch: boolean;
};

type AbnormalState = {
  status: "normal" | "abnormal" | "insufficient_data";
  message: string;
  baseline_days: number;
  baseline_average_micros: number | null;
  today_spend_micros: number;
};

type BudgetResponse = {
  success: boolean;
  timestamp: string;
  timezone: string;
  currency: string | null;
  monetary_source: string;
  cost_policy: string;
  budgets: {
    daily: BudgetState;
    weekly: BudgetState;
    monthly: BudgetState;
  };
  abnormal_consumption: AbnormalState;
};

const REQUEST_TIMEOUT_MS = 10000;

const EMPTY_BUDGET = (
  period: BudgetPeriod
): BudgetState => ({
  id: null,
  period,
  budget_micros: null,
  spent_micros: 0,
  remaining_micros: null,
  percent_used: null,
  forecast_micros: null,
  forecast_percent: null,
  status: "not_set",
  currency: null,
  start: "",
  end: "",
  days_elapsed: 0,
  days_in_period: 0,
  has_data: false,
  currency_mismatch: false,
});

const EMPTY_ABNORMAL: AbnormalState = {
  status: "insufficient_data",
  message: "Loading verified spending data…",
  baseline_days: 0,
  baseline_average_micros: null,
  today_spend_micros: 0,
};

function createInitialData(): BudgetResponse {
  return {
    success: true,
    timestamp: "",
    timezone: "Asia/Singapore",
    currency: "CNY",
    monetary_source: "official_export",
    cost_policy:
      "Only verified official imported costs are used for budget calculations.",
    budgets: {
      daily: EMPTY_BUDGET("daily"),
      weekly: EMPTY_BUDGET("weekly"),
      monthly: EMPTY_BUDGET("monthly"),
    },
    abnormal_consumption: EMPTY_ABNORMAL,
  };
}

function formatMoney(
  micros: number | null,
  currency: string | null
) {
  if (micros === null) {
    return "—";
  }

  const value = micros / 1_000_000;

  if (currency === "CNY") {
    return `¥${value.toFixed(2)}`;
  }

  if (currency === "EUR") {
    return `€${value.toFixed(2)}`;
  }

  return `$${value.toFixed(2)}`;
}

function currencySymbol(currency: string | null) {
  if (currency === "CNY") return "¥";
  if (currency === "EUR") return "€";
  return "$";
}

function statusLabel(
  status: BudgetState["status"]
) {
  if (status === "over") {
    return "Over budget";
  }

  if (status === "near") {
    return "Near limit";
  }

  if (status === "normal") {
    return "Within budget";
  }

  return "Not set";
}

function statusBackground(
  status: BudgetState["status"]
) {
  if (status === "over") {
    return "#fff1f1";
  }

  if (status === "near") {
    return "#fff8e8";
  }

  if (status === "normal") {
    return "#f3f8f3";
  }

  return "#f7f7f7";
}

export default function BudgetPage() {
  const [data, setData] =
    useState<BudgetResponse>(
      createInitialData()
    );

  const [amounts, setAmounts] =
    useState<Record<BudgetPeriod, number>>({
      daily: 10,
      weekly: 50,
      monthly: 200,
    });

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [savingPeriod, setSavingPeriod] =
    useState<BudgetPeriod | null>(null);

  const [savedPeriod, setSavedPeriod] =
    useState<BudgetPeriod | null>(null);

  const [error, setError] =
    useState("");

  async function loadBudget(
    mode: "initial" | "refresh" | "background" = "background"
  ) {
    if (mode === "initial") {
      setLoading(true);
    }

    if (mode === "refresh") {
      setRefreshing(true);
    }

    setError("");

    let timeoutId: number | null = null;

    try {
      const timezone = "Asia/Singapore";
      const controller = new AbortController();
      timeoutId = window.setTimeout(() => {
        controller.abort();
      }, REQUEST_TIMEOUT_MS);

      const response = await fetch(
        `/api/budget?timezone=${encodeURIComponent(
          timezone
        )}&_=${Date.now()}`,
        {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          `Budget API returned ${response.status}`
        );
      }

      const text =
        await response.text();

      if (!text.trim()) {
        throw new Error(
          "Budget API returned an empty response."
        );
      }

      const result =
        JSON.parse(text) as BudgetResponse;

      if (!result.success) {
        throw new Error(
          "Budget API returned an unsuccessful response."
        );
      }

      if (
        !result.budgets ||
        !result.budgets.daily ||
        !result.budgets.weekly ||
        !result.budgets.monthly
      ) {
        throw new Error(
          "Budget API response is missing budget data."
        );
      }

      setData(result);

      setAmounts((previous) => ({
        daily:
          result.budgets.daily.budget_micros !==
          null
            ? result.budgets.daily.budget_micros /
              1_000_000
            : previous.daily,

        weekly:
          result.budgets.weekly.budget_micros !==
          null
            ? result.budgets.weekly.budget_micros /
              1_000_000
            : previous.weekly,

        monthly:
          result.budgets.monthly.budget_micros !==
          null
            ? result.budgets.monthly.budget_micros /
              1_000_000
            : previous.monthly,
      }));
    } catch (err) {
      console.error(
        "[Budget] Failed to load budget:",
        err
      );

      setError(
        err instanceof DOMException &&
          err.name === "AbortError"
          ? "Budget data took too long to load."
          : "Unable to load budget data. Please try again."
      );
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }

      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadBudget("initial");
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  async function saveBudget(
    period: BudgetPeriod
  ) {
    const amount = amounts[period];

    if (
      !Number.isFinite(amount) ||
      amount < 0
    ) {
      setError(
        "Budget amount must be a non-negative number."
      );
      return;
    }

    if (savingPeriod !== null) {
      return;
    }

    setSavingPeriod(period);
    setSavedPeriod(null);
    setError("");

    try {
      const response = await fetch(
        "/api/budget",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            period,
            amount,
            currency:
              data.currency ?? undefined,
          }),
        }
      );

      const text =
        await response.text();

      let result: {
        ok?: boolean;
        error?: string;
      } = {};

      if (text.trim()) {
        try {
          result = JSON.parse(text);
        } catch {
          throw new Error(
            "Budget save returned invalid JSON."
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          result.error ||
            `Failed to save budget (${response.status}).`
        );
      }

      await loadBudget("background");

      setSavedPeriod(period);

      window.setTimeout(() => {
        setSavedPeriod((current) =>
          current === period
            ? null
            : current
        );
      }, 1800);
    } catch (err) {
      console.error(
        "[Budget] Failed to save budget:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Failed to save budget."
      );
    } finally {
      setSavingPeriod(null);
    }
  }

  const currency =
    data.currency ?? "CNY";

  const periods: Array<{
    key: BudgetPeriod;
    title: string;
    description: string;
  }> = [
    {
      key: "daily",
      title: "Daily budget",
      description:
        "Control today's AI spending.",
    },
    {
      key: "weekly",
      title: "Weekly budget",
      description:
        "Control spending across the current week.",
    },
    {
      key: "monthly",
      title: "Monthly budget",
      description:
        "Control spending across the current month.",
    },
  ];

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "40px 28px 80px",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        color: "#111",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems: "flex-start",
          gap: 20,
          marginBottom: 28,
        }}
      >
        <div>
          <CoreModuleNav active="budget" />

          <div
            style={{
              marginBottom: 14,
            }}
          >
            <Link
              href="/"
              style={{
                color: "#555",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              ← Dashboard
            </Link>
          </div>

          <h1
            style={{
              fontSize: 32,
              margin: 0,
            }}
          >
            Budget
          </h1>

          <p
            style={{
              margin: "8px 0 0",
              color: "#666",
              fontSize: 15,
            }}
          >
            Control AI spending using
            verified cost data.
          </p>
        </div>

        <button
          onClick={() =>
            void loadBudget("refresh")
          }
          disabled={refreshing}
          style={{
            padding: "9px 14px",
            borderRadius: 8,
            border: "1px solid #ddd",
            background: "#fff",
            cursor: refreshing
              ? "default"
              : "pointer",
            opacity: refreshing
              ? 0.6
              : 1,
          }}
        >
          {refreshing
            ? "Refreshing…"
            : "Refresh ↻"}
        </button>
      </header>

      <section
  style={{
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 32,
    alignItems: "center",
  }}
>
        <span
          style={{
            padding: "7px 11px",
            borderRadius: 999,
            background: "#f3f3f3",
            fontSize: 13,
          }}
        >
          Currency: {currency}
        </span>

        <span
          style={{
            padding: "7px 11px",
            borderRadius: 999,
            background: "#f3f3f3",
            fontSize: 13,
          }}
        >
          Source: Verified official
          import
        </span>

        <span
          style={{
            padding: "7px 11px",
            borderRadius: 999,
            background: "#f3f3f3",
            fontSize: 13,
          }}
        >
          Timezone: {data.timezone}
        </span>

        {loading && (
          <span
            style={{
              padding: "7px 11px",
              borderRadius: 999,
              background: "#f7f7f7",
              color: "#777",
              fontSize: 13,
            }}
          >
            Loading data…
          </span>
        )}
      </section>

      {error && (
        <div
          style={{
            marginBottom: 20,
            padding: 14,
            borderRadius: 10,
            background: "#fff1f1",
            border: "1px solid #f0caca",
            color: "#b42318",
          }}
        >
          {error}
        </div>
      )}

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 18,
        }}
      >
        {periods.map(
          ({
            key,
            title,
            description,
          }) => {
            const budget =
              data.budgets[key];

            const percent =
              budget.percent_used ?? 0;

            const safePercent =
              Math.min(
                100,
                Math.max(0, percent)
              );

            const forecastOver =
              budget.forecast_percent !==
                null &&
              budget.forecast_percent >
                100;

            const isSaving =
              savingPeriod === key;

            const isSaved =
              savedPeriod === key;

            return (
              <section
                key={key}
                style={{
                  border:
                    "1px solid #e5e5e5",
                  borderRadius: 14,
                  padding: 22,
                  background: "#fff",
                  boxShadow:
                    "0 1px 2px rgba(0,0,0,0.03)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    alignItems:
                      "flex-start",
                    gap: 12,
                  }}
                >
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: 20,
                      }}
                    >
                      {title}
                    </h2>

                    <p
                      style={{
                        margin:
                          "5px 0 0",
                        color: "#777",
                        fontSize: 13,
                      }}
                    >
                      {description}
                    </p>
                  </div>

                  <span
                    style={{
                      padding:
                        "5px 8px",
                      borderRadius: 999,
                      background:
                        statusBackground(
                          budget.status
                        ),
                      fontSize: 12,
                      whiteSpace:
                        "nowrap",
                    }}
                  >
                    {statusLabel(
                      budget.status
                    )}
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "1fr 1fr",
                    gap: 14,
                    marginTop: 22,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#777",
                      }}
                    >
                      Budget
                    </div>

                    <div
                      style={{
                        fontSize: 24,
                        fontWeight: 700,
                        marginTop: 4,
                      }}
                    >
                      {formatMoney(
                        budget.budget_micros,
                        currency
                      )}
                    </div>
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#777",
                      }}
                    >
                      Spent
                    </div>

                    <div
                      style={{
                        fontSize: 24,
                        fontWeight: 700,
                        marginTop: 4,
                      }}
                    >
                      {formatMoney(
                        budget.spent_micros,
                        currency
                      )}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 16,
                    fontSize: 13,
                    color: "#666",
                  }}
                >
                  Remaining:{" "}
                  <strong
                    style={{
                      color: "#111",
                    }}
                  >
                    {formatMoney(
                      budget.remaining_micros,
                      currency
                    )}
                  </strong>
                </div>

                <div
                  style={{
                    marginTop: 14,
                    height: 9,
                    background: "#eee",
                    borderRadius: 999,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${safePercent}%`,
                      background:
                        budget.status ===
                        "over"
                          ? "#c62828"
                          : "#111",
                      borderRadius: 999,
                      transition:
                        "width 0.3s ease",
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    marginTop: 7,
                    fontSize: 12,
                    color: "#777",
                  }}
                >
                  <span>
                    {budget.percent_used ===
                    null
                      ? "—"
                      : `${percent.toFixed(
                          1
                        )}% used`}
                  </span>

                  <span>
                    {budget.days_in_period >
                    0
                      ? `${budget.days_elapsed} / ${budget.days_in_period} days`
                      : "—"}
                  </span>
                </div>

                <div
                  style={{
                    marginTop: 17,
                    padding: 12,
                    borderRadius: 9,
                    background:
                      forecastOver
                        ? "#fff4f4"
                        : "#f7f7f7",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: "#777",
                    }}
                  >
                    Forecast
                  </div>

                  <div
                    style={{
                      marginTop: 3,
                      fontWeight: 600,
                    }}
                  >
                    {formatMoney(
                      budget.forecast_micros,
                      currency
                    )}

                    {budget.forecast_percent !==
                      null &&
                      ` · ${budget.forecast_percent.toFixed(
                        1
                      )}% of budget`}
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 20,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems:
                        "center",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                      }}
                    >
                      {currencySymbol(
                        currency
                      )}
                    </span>

                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={amounts[key]}
                      disabled={isSaving}
                      onChange={(event) =>
                        setAmounts(
                          (previous) => ({
                            ...previous,
                            [key]:
                              Number(
                                event.target
                                  .value
                              ),
                          })
                        )
                      }
                      style={{
                        width: 120,
                        padding:
                          "9px 10px",
                        border:
                          "1px solid #ccc",
                        borderRadius: 8,
                        background:
                          isSaving
                            ? "#f5f5f5"
                            : "#fff",
                      }}
                    />

                    <button
                      onClick={() =>
                        void saveBudget(key)
                      }
                      disabled={
                        savingPeriod !== null
                      }
                      style={{
                        minWidth: 105,
                        padding:
                          "9px 13px",
                        border: 0,
                        borderRadius: 8,
                        background:
                          isSaved
                            ? "#1f7a3f"
                            : "#111",
                        color: "#fff",
                        cursor:
                          savingPeriod !==
                          null
                            ? "default"
                            : "pointer",
                        opacity:
                          savingPeriod !==
                            null &&
                          !isSaving
                            ? 0.5
                            : 1,
                        transition:
                          "background 0.15s ease, opacity 0.15s ease",
                      }}
                    >
                      {isSaving
                        ? "Saving…"
                        : isSaved
                        ? "✓ Saved"
                        : "Save budget"}
                    </button>
                  </div>
                </div>
              </section>
            );
          }
        )}
      </section>

      <section
        style={{
          marginTop: 24,
          border:
            "1px solid #e5e5e5",
          borderRadius: 14,
          padding: 24,
          background: "#fff",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems:
              "flex-start",
            gap: 16,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
              }}
            >
              Abnormal consumption
            </h2>

            <p
              style={{
                margin:
                  "6px 0 0",
                color: "#666",
                fontSize: 14,
              }}
            >
              Detect unusually high
              verified spending against
              your recent usage days.
            </p>
          </div>

          <span
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              background:
                data.abnormal_consumption
                  .status === "abnormal"
                  ? "#fff1f1"
                  : data
                      .abnormal_consumption
                      .status ===
                    "insufficient_data"
                  ? "#f3f3f3"
                  : "#f3f8f3",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {data
              .abnormal_consumption
              .status === "abnormal"
              ? "ABNORMAL"
              : data
                  .abnormal_consumption
                  .status ===
                "insufficient_data"
              ? loading
                ? "LOADING"
                : "INSUFFICIENT HISTORY"
              : "NORMAL"}
          </span>
        </div>

        <p
          style={{
            marginTop: 20,
            marginBottom: 20,
            fontSize: 15,
          }}
        >
          {
            data.abnormal_consumption
              .message
          }
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 14,
          }}
        >
          <div
            style={{
              padding: 16,
              borderRadius: 10,
              background: "#f7f7f7",
            }}
          >
            <div
              style={{
                color: "#777",
                fontSize: 12,
              }}
            >
              Today&apos;s verified cost
            </div>

            <div
              style={{
                marginTop: 5,
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              {formatMoney(
                data.abnormal_consumption
                  .today_spend_micros,
                currency
              )}
            </div>
          </div>

          <div
            style={{
              padding: 16,
              borderRadius: 10,
              background: "#f7f7f7",
            }}
          >
            <div
              style={{
                color: "#777",
                fontSize: 12,
              }}
            >
              Recent baseline
            </div>

            <div
              style={{
                marginTop: 5,
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              {formatMoney(
                data.abnormal_consumption
                  .baseline_average_micros,
                currency
              )}
            </div>
          </div>

          <div
            style={{
              padding: 16,
              borderRadius: 10,
              background: "#f7f7f7",
            }}
          >
            <div
              style={{
                color: "#777",
                fontSize: 12,
              }}
            >
              Baseline days
            </div>

            <div
              style={{
                marginTop: 5,
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              {data.abnormal_consumption
                .baseline_days}
            </div>
          </div>
        </div>
      </section>

      <section
        style={{
          marginTop: 24,
          padding: 16,
          borderRadius: 10,
          background: "#f7f7f7",
          color: "#666",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        <strong
          style={{
            color: "#333",
          }}
        >
          Data policy
        </strong>

        <div
          style={{
            marginTop: 4,
          }}
        >
          Budget calculations use only
          verified official imported
          costs. Local application
          records are not mixed into
          the monetary total.
        </div>
      </section>
    </main>
  );
}