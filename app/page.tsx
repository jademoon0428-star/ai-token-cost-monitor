"use client";

import Link from "next/link";

import { isOfficialSource } from "@/lib/cost-policy";
import { useEffect, useMemo, useState } from "react";

type CostRecord = {
  id?: string;
  source?: string;
  accuracy?: string;
  provider?: string;
  model?: string;
  timestamp: string;
  cost?: {
    amount?: number | null;
    currency?: string | null;
  };
};

type DailyCost = {
  date: string;
  cost: number;
};

type CostResponse = {
  success: boolean;
  summary?: {
    recordCount?: number;
    visibleRecordCount?: number;
    totalSourceCost?: number;
    currency?: string | null;
    monetarySource?: string | null;
    currencyCompatible?: boolean;
  };
  dailyCost?: DailyCost[];
  records?: CostRecord[];
};

type BreakdownItem = {
  provider?: string;
  model?: string;
  cost: number;
  count: number;
};

type DashboardData = {
  records: CostRecord[];
  dailyCost: DailyCost[];
  currency: string | null;
  totalSourceCost: number;
};

const TIMEZONE = "Asia/Singapore";
const REQUEST_TIMEOUT_MS = 10000;

function getSingaporeDate(timestamp: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

function getTodaySingaporeDate(): string {
  return getSingaporeDate(new Date().toISOString());
}

function getDateDaysAgo(daysAgo: number): string {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = Number(
    parts.find((part) => part.type === "year")?.value
  );

  const month = Number(
    parts.find((part) => part.type === "month")?.value
  );

  const day = Number(
    parts.find((part) => part.type === "day")?.value
  );

  const singaporeCalendarDate = new Date(
    Date.UTC(year, month - 1, day - daysAgo)
  );

  return singaporeCalendarDate.toISOString().slice(0, 10);
}

function money(
  amount: number,
  currency: string | null
): string {
  if (!Number.isFinite(amount)) {
    return currency ? `${currency} 0.00` : "0.00";
  }

  return currency
    ? `${currency} ${amount.toFixed(2)}`
    : amount.toFixed(2);
}

function sumDailyCosts(
  dailyCost: DailyCost[],
  startDate: string,
  endDate: string
): number {
  return dailyCost.reduce((total, item) => {
    if (
      item.date >= startDate &&
      item.date <= endDate &&
      Number.isFinite(item.cost)
    ) {
      return total + item.cost;
    }

    return total;
  }, 0);
}

function displayName(value: string): string {
  if (!value) {
    return "Unknown";
  }

  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function percentage(
  value: number,
  total: number
): string {
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(total) ||
    total <= 0
  ) {
    return "0%";
  }

  return `${Math.min(
    100,
    Math.max(0, (value / total) * 100)
  ).toFixed(1)}%`;
}

function getCurrency(
  records: CostRecord[],
  fallback: string | null
): string | null {
  for (const record of records) {
    const currency = record.cost?.currency;

    if (currency) {
      return currency;
    }
  }

  return fallback;
}

function getRecordsInDateRange(
  records: CostRecord[],
  startDate: string,
  endDate: string
): CostRecord[] {
  return records.filter((record) => {
    const date = getSingaporeDate(record.timestamp);

    return date >= startDate && date <= endDate;
  });
}

function getVerifiedCostRecords(
  records: CostRecord[]
): CostRecord[] {
  return records.filter((record) => {
    const amount = record.cost?.amount;

    return (
      record.accuracy === "exact" &&
      isOfficialSource(record.source) &&
      typeof amount === "number" &&
      Number.isFinite(amount) &&
      amount > 0
    );
  });
}

function getTopProvider(
  records: CostRecord[]
): {
  provider: string;
  cost: number;
} | null {
  const map = new Map<string, number>();

  for (const record of records) {
    const amount = record.cost?.amount;

    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      continue;
    }

    const provider = record.provider || "Unknown";

    map.set(
      provider,
      (map.get(provider) ?? 0) + amount
    );
  }

  const items = Array.from(map.entries())
    .map(([provider, cost]) => ({
      provider,
      cost,
    }))
    .sort((a, b) => b.cost - a.cost);

  return items[0] ?? null;
}

function getTopModel(
  records: CostRecord[]
): {
  provider: string;
  model: string;
  cost: number;
  count: number;
} | null {
  const map = new Map<
    string,
    {
      provider: string;
      model: string;
      cost: number;
      count: number;
    }
  >();

  for (const record of records) {
    const amount = record.cost?.amount;

    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      continue;
    }

    const provider = record.provider || "Unknown";
    const model = record.model || "Unknown";
    const key = `${provider}::${model}`;

    const existing = map.get(key);

    if (existing) {
      existing.cost += amount;
      existing.count += 1;
    } else {
      map.set(key, {
        provider,
        model,
        cost: amount,
        count: 1,
      });
    }
  }

  return (
    Array.from(map.values()).sort(
      (a, b) => b.cost - a.cost
    )[0] ?? null
  );
}

function getProviderBreakdown(
  records: CostRecord[]
): BreakdownItem[] {
  const map = new Map<string, BreakdownItem>();

  for (const record of records) {
    const amount = record.cost?.amount;

    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      continue;
    }

    const provider = record.provider || "Unknown";
    const existing = map.get(provider);

    if (existing) {
      existing.cost += amount;
      existing.count += 1;
    } else {
      map.set(provider, {
        provider,
        cost: amount,
        count: 1,
      });
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => b.cost - a.cost
  );
}

function getModelBreakdown(
  records: CostRecord[]
): BreakdownItem[] {
  const map = new Map<string, BreakdownItem>();

  for (const record of records) {
    const amount = record.cost?.amount;

    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      continue;
    }

    const provider = record.provider || "Unknown";
    const model = record.model || "Unknown";
    const key = `${provider}::${model}`;

    const existing = map.get(key);

    if (existing) {
      existing.cost += amount;
      existing.count += 1;
    } else {
      map.set(key, {
        provider,
        model,
        cost: amount,
        count: 1,
      });
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => b.cost - a.cost
  );
}

function getHighestSpendingDay(
  dailyCost: DailyCost[],
  startDate: string,
  endDate: string
): {
  date: string;
  cost: number;
} | null {
  const items = dailyCost
    .filter(
      (item) =>
        item.date >= startDate &&
        item.date <= endDate &&
        Number.isFinite(item.cost) &&
        item.cost > 0
    )
    .sort((a, b) => b.cost - a.cost);

  return items[0] ?? null;
}

function formatDay(date: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

export default function Dashboard() {
  const [data, setData] =
    useState<DashboardData | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      setLoading(true);
      setError(null);

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => {
        controller.abort();
      }, REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(
          `/api/costs/unified?period=30d&timezone=${encodeURIComponent(
            TIMEZONE
          )}&includeLocalEvidence=false`,
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
            `HTTP ${response.status}`
          );
        }

        const text = await response.text();

        let result: CostResponse;

        try {
          result = JSON.parse(text) as CostResponse;
        } catch {
          throw new Error(
            "Dashboard API returned invalid JSON."
          );
        }

        if (!result.success) {
          throw new Error(
            "Cost API returned success=false."
          );
        }

        if (
          result.summary?.currencyCompatible ===
          false
        ) {
          throw new Error(
            "Verified cost data is incomplete because currencies differ."
          );
        }

        const nextRecords =
          Array.isArray(result.records)
            ? result.records
            : [];

        const nextDailyCost =
          Array.isArray(result.dailyCost)
            ? result.dailyCost
            : [];

        const nextTotalSourceCost =
          typeof result.summary
            ?.totalSourceCost === "number"
            ? result.summary.totalSourceCost
            : 0;

        const nextCurrency =
          getCurrency(
            nextRecords,
            result.summary?.currency ?? "CNY"
          );

        if (!active) {
          return;
        }

        setData({
          records: nextRecords,
          dailyCost: nextDailyCost,
          currency: nextCurrency,
          totalSourceCost:
            nextTotalSourceCost,
        });

        setError(null);
      } catch (err) {
        if (!active) {
          return;
        }

        if (
          err instanceof DOMException &&
          err.name === "AbortError"
        ) {
          setError(
            "Dashboard data took too long to load."
          );
        } else {
          console.error(
            "[Dashboard] Failed to load cost data:",
            err
          );

          setError(
            "Unable to load cost data. Please try again."
          );
        }
      } finally {
        window.clearTimeout(timeoutId);

        if (active) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  const records = useMemo(
    () => data?.records ?? [],
    [data]
  );
  const dailyCost = useMemo(
    () => data?.dailyCost ?? [],
    [data]
  );
  const currency = data?.currency ?? "CNY";
  const totalSourceCost =
    data?.totalSourceCost ?? 0;

  const todayDate =
    getTodaySingaporeDate();

  const sevenDayStart =
    getDateDaysAgo(6);

  const thirtyDayStart =
    getDateDaysAgo(29);

  const todayCost = useMemo(() => {
    return sumDailyCosts(
      dailyCost,
      todayDate,
      todayDate
    );
  }, [dailyCost, todayDate]);

  const sevenDayCost = useMemo(() => {
    return sumDailyCosts(
      dailyCost,
      sevenDayStart,
      todayDate
    );
  }, [
    dailyCost,
    sevenDayStart,
    todayDate,
  ]);

  const thirtyDayCost =
    totalSourceCost;

  const sevenDayRecords =
    useMemo(() => {
      return getRecordsInDateRange(
        records,
        sevenDayStart,
        todayDate
      );
    }, [
      records,
      sevenDayStart,
      todayDate,
    ]);

  const verifiedThirtyDayRecords =
    useMemo(() => {
      return getVerifiedCostRecords(
        records
      );
    }, [records]);

  const providerBreakdown =
    useMemo(() => {
      return getProviderBreakdown(
        verifiedThirtyDayRecords
      );
    }, [verifiedThirtyDayRecords]);

  const modelBreakdown =
    useMemo(() => {
      return getModelBreakdown(
        verifiedThirtyDayRecords
      );
    }, [verifiedThirtyDayRecords]);

  const thirtyDayDailyCost =
    useMemo(() => {
      return dailyCost
        .filter(
          (item) =>
            item.date >= thirtyDayStart &&
            item.date <= todayDate &&
            Number.isFinite(item.cost) &&
            item.cost > 0
        )
        .sort((a, b) =>
          a.date.localeCompare(b.date)
        );
    }, [
      dailyCost,
      thirtyDayStart,
      todayDate,
    ]);

  const topProvider =
    useMemo(
      () =>
        getTopProvider(
          sevenDayRecords
        ),
      [sevenDayRecords]
    );

  const topModel =
    useMemo(
      () =>
        getTopModel(
          sevenDayRecords
        ),
      [sevenDayRecords]
    );

  const highestSpendingDay =
    useMemo(
      () =>
        getHighestSpendingDay(
          dailyCost,
          sevenDayStart,
          todayDate
        ),
      [
        dailyCost,
        sevenDayStart,
        todayDate,
      ]
    );

  const hasCost =
    sevenDayCost > 0;

  const hasThirtyDayCost =
    verifiedThirtyDayRecords.length > 0 &&
    thirtyDayCost > 0;

  const unavailableText = loading
    ? "Loading verified cost data..."
    : error
      ? "Verified cost data is unavailable."
      : "No verified cost data is available.";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f4f6f8",
        color: "#172033",
        padding:
          "32px 24px 48px",
        fontFamily:
          "Inter, Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
        }}
      >
        <header
          className="topbar"
          style={{
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              fontSize: "12px",
              fontWeight: 750,
              color: "#64748b",
              letterSpacing: "0.09em",
              textTransform:
                "uppercase",
              marginBottom: "8px",
            }}
          >
            AI Cost Management
          </div>

          <h1
            style={{
              margin: 0,
              fontSize:
                "clamp(28px, 4vw, 36px)",
              lineHeight: 1.15,
              letterSpacing:
                "-0.035em",
            }}
          >
            AI Cost Dashboard
          </h1>

          <p
            style={{
              margin:
                "9px 0 0",
              color: "#64748b",
              fontSize: "14px",
              lineHeight: 1.5,
            }}
          >
            See how much your AI
            is costing, where the
            money goes, and what
            needs attention.
          </p>
        </header>

        {error && (
          <section
            style={{
              background: "#fff7ed",
              border:
                "1px solid #fed7aa",
              color: "#9a3412",
              borderRadius: "12px",
              padding:
                "13px 15px",
              marginBottom: "18px",
              fontSize: "13px",
            }}
          >
            {error}
          </section>
        )}

        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(4, minmax(0, 1fr))",
            gap: "14px",
            marginBottom: "20px",
          }}
        >
          <MetricCard
            label="Today"
            value={
              data === null
                ? "—"
                : money(
                    todayCost,
                    currency
                  )
            }
          />

          <MetricCard
            label="Last 7 days"
            value={
              data === null
                ? "—"
                : money(
                    sevenDayCost,
                    currency
                  )
            }
            emphasis
          />

          <MetricCard
            label="Last 30 days"
            value={
              data === null
                ? "—"
                : money(
                    thirtyDayCost,
                    currency
                  )
            }
          />

          <MetricCard
            label="Recorded · 30 days"
            value={
              data === null
                ? "—"
                : money(
                    thirtyDayCost,
                    currency
                  )
            }
            muted
          />
        </section>

        {data !== null && !error && (
          <section
            style={{
              background:
                "#ffffff",
              border:
                "1px solid #e2e8f0",
              borderRadius: "12px",
              padding:
                "11px 14px",
              marginBottom: "20px",
              color: "#64748b",
              fontSize: "12px",
            }}
          >
            Dashboard analysis uses
            verified cost records
            from the last 30 days.
            No unverified cost is
            estimated.
          </section>
        )}

        <section
          style={{
            background: "#ffffff",
            borderRadius: "16px",
            border:
              "1px solid #e7ebf0",
            padding: "22px",
            marginBottom: "20px",
          }}
        >
          <SectionHeading
            title="Where your money goes"
            subtitle="Your biggest verified cost drivers · Last 7 days"
          />

          {data === null ? (
            <EmptyState text={unavailableText} />
          ) : !hasCost ? (
            <EmptyState text="No verified cost recorded in the last 7 days." action={<Link className="export" href="/usage/import">Import official usage export</Link>} />
          ) : (
            <>
              {topProvider && (
                <div
                  style={{
                    marginBottom:
                      "22px",
                  }}
                >
                  <div
                    style={{
                      display:
                        "flex",
                      justifyContent:
                        "space-between",
                      alignItems:
                        "center",
                      gap: "12px",
                      marginBottom:
                        "8px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize:
                            "12px",
                          color:
                            "#94a3b8",
                          marginBottom:
                            "3px",
                        }}
                      >
                        Provider
                      </div>

                      <strong
                        style={{
                          fontSize:
                            "15px",
                        }}
                      >
                        {displayName(
                          topProvider.provider
                        )}
                      </strong>
                    </div>

                    <div
                      style={{
                        textAlign:
                          "right",
                      }}
                    >
                      <strong>
                        {money(
                          topProvider.cost,
                          currency
                        )}
                      </strong>

                      <div
                        style={{
                          fontSize:
                            "12px",
                          color:
                            "#94a3b8",
                          marginTop:
                            "2px",
                        }}
                      >
                        {percentage(
                          topProvider.cost,
                          sevenDayCost
                        )}
                      </div>
                    </div>
                  </div>

                  <ProgressBar
                    value={
                      topProvider.cost
                    }
                    total={
                      sevenDayCost
                    }
                  />
                </div>
              )}

              {topModel && (
                <div>
                  <div
                    style={{
                      display:
                        "flex",
                      justifyContent:
                        "space-between",
                      alignItems:
                        "center",
                      gap: "12px",
                      marginBottom:
                        "8px",
                    }}
                  >
                    <div
                      style={{
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          fontSize:
                            "12px",
                          color:
                            "#94a3b8",
                          marginBottom:
                            "3px",
                        }}
                      >
                        Top model
                      </div>

                      <strong
                        style={{
                          fontSize:
                            "15px",
                          overflow:
                            "hidden",
                          textOverflow:
                            "ellipsis",
                          display:
                            "block",
                        }}
                      >
                        {topModel.model}
                      </strong>
                    </div>

                    <div
                      style={{
                        textAlign:
                          "right",
                        whiteSpace:
                          "nowrap",
                      }}
                    >
                      <strong>
                        {money(
                          topModel.cost,
                          currency
                        )}
                      </strong>

                      <div
                        style={{
                          fontSize:
                            "12px",
                          color:
                            "#94a3b8",
                          marginTop:
                            "2px",
                        }}
                      >
                        {percentage(
                          topModel.cost,
                          sevenDayCost
                        )}
                      </div>
                    </div>
                  </div>

                  <ProgressBar
                    value={
                      topModel.cost
                    }
                    total={
                      sevenDayCost
                    }
                  />

                  <div
                    style={{
                      marginTop:
                        "7px",
                      fontSize:
                        "12px",
                      color:
                        "#94a3b8",
                    }}
                  >
                    {displayName(
                      topModel.provider
                    )}
                    {" · "}
                    {topModel.count}{" "}
                    verified events
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <section
          style={{
            background: "#ffffff",
            borderRadius: "16px",
            border:
              "1px solid #e7ebf0",
            padding: "22px",
            marginBottom: "20px",
          }}
        >
          <SectionHeading
            title="Cost Breakdown · Last 30 Days"
            subtitle="Verified provider, model, and daily spending from source-reported costs"
          />

          {data === null ? (
            <EmptyState text={unavailableText} />
          ) : !hasThirtyDayCost ? (
            <EmptyState text="No verified 30-day cost data is available." action={<Link className="export" href="/usage/import">Import official usage export</Link>} />
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(2, minmax(0, 1fr))",
                  gap: "18px",
                  marginBottom: "24px",
                }}
              >
                <BreakdownPanel
                  title="Provider Breakdown"
                  items={providerBreakdown}
                  total={thirtyDayCost}
                  currency={currency}
                  type="provider"
                />

                <BreakdownPanel
                  title="Model Breakdown"
                  items={modelBreakdown}
                  total={thirtyDayCost}
                  currency={currency}
                  type="model"
                />
              </div>

              <div>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 750,
                    marginBottom: "12px",
                  }}
                >
                  Daily Spending
                </div>

                {thirtyDayDailyCost.length === 0 ? (
                  <EmptyState text="No daily spending data is available." />
                ) : (
                  <div
                    style={{
                      border:
                        "1px solid #edf1f5",
                      borderRadius: "12px",
                      overflow: "hidden",
                    }}
                  >
                    {thirtyDayDailyCost.map(
                      (item) => (
                        <DailyCostRow
                          key={item.date}
                          date={item.date}
                          cost={item.cost}
                          total={thirtyDayCost}
                          currency={currency}
                        />
                      )
                    )}
                  </div>
                )}
              </div>

              <div
                style={{
                  marginTop: "14px",
                  fontSize: "11px",
                  lineHeight: 1.5,
                  color: "#94a3b8",
                }}
              >
                Only verified source-reported
                monetary records are included.
                Local activity without a verified
                provider cost is not converted into
                an estimated amount.
              </div>
            </>
          )}
        </section>

        <section
          style={{
            background: "#ffffff",
            borderRadius: "16px",
            border:
              "1px solid #e7ebf0",
            padding: "22px",
            marginBottom: "20px",
          }}
        >
          <SectionHeading
            title="What needs attention"
            subtitle="Simple signals based on verified spending"
          />

          {data === null ? (
            <EmptyState text={unavailableText} />
          ) : !hasCost ? (
            <EmptyState text="No verified spending signal is available yet." />
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(2, minmax(0, 1fr))",
                gap: "14px",
              }}
            >
              <AttentionCard
                label="Highest spending day"
                title={
                  highestSpendingDay
                    ? formatDay(
                        highestSpendingDay.date
                      )
                    : "No daily data"
                }
                detail={
                  highestSpendingDay
                    ? money(
                        highestSpendingDay.cost,
                        currency
                      )
                    : "No verified cost"
                }
              />

              <AttentionCard
                label="Main cost driver"
                title={
                  topModel?.model ??
                  "No model data"
                }
                detail={
                  topModel
                    ? `${percentage(
                        topModel.cost,
                        sevenDayCost
                      )} of verified cost`
                    : "No verified cost"
                }
              />
            </div>
          )}
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(3, minmax(0, 1fr))",
            gap: "14px",
            marginBottom: "24px",
          }}
        >
          <ActionCard
            title="Usage"
            description="See detailed usage records."
            href="/usage"
          />

          <ActionCard
            title="Saving"
            description="Find where spending can be reduced."
            href="/saving"
          />

          <ActionCard
            title="Budget"
            description="Set and control AI spending limits."
            href="/budget"
          />

          <ActionCard
            title="AI Activity"
            description="Monitor real-time AI connections."
            href="/ai-activity"
          />

          <ActionCard
            title="AI Efficiency"
            description="Measure AI token and cost efficiency."
            href="/efficiency"
          />
        </section>

        <footer
          style={{
            color: "#94a3b8",
            fontSize: "11px",
            lineHeight: 1.6,
          }}
        >
          Cost policy: only
          source-reported verified
          or exact costs are counted.
          The dashboard does not
          invent costs when a provider
          does not report them.
          Timezone: Asia/Singapore.
        </footer>
      </div>
    </main>
  );
}

function BreakdownPanel({
  title,
  items,
  total,
  currency,
  type,
}: {
  title: string;
  items: BreakdownItem[];
  total: number;
  currency: string | null;
  type: "provider" | "model";
}) {
  return (
    <div
      style={{
        background: "#f8fafc",
        borderRadius: "12px",
        border:
          "1px solid #edf1f5",
        padding: "16px",
      }}
    >
      <div
        style={{
          fontSize: "14px",
          fontWeight: 750,
          marginBottom: "14px",
        }}
      >
        {title}
      </div>

      {items.length === 0 ? (
        <EmptyState text="No verified data." />
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          {items.map((item) => {
            const name =
              type === "provider"
                ? displayName(
                    item.provider ?? "Unknown"
                  )
                : item.model ??
                  "Unknown";

            return (
              <div
                key={`${item.provider}-${item.model}`}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    alignItems:
                      "flex-start",
                    gap: "12px",
                    marginBottom: "6px",
                  }}
                >
                  <div
                    style={{
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 650,
                        overflow:
                          "hidden",
                        textOverflow:
                          "ellipsis",
                        whiteSpace:
                          "nowrap",
                      }}
                    >
                      {name}
                    </div>

                    {type === "model" && (
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#94a3b8",
                          marginTop: "2px",
                        }}
                      >
                        {displayName(
                          item.provider ??
                            "Unknown"
                        )}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      textAlign: "right",
                      whiteSpace:
                        "nowrap",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 750,
                      }}
                    >
                      {money(
                        item.cost,
                        currency
                      )}
                    </div>

                    <div
                      style={{
                        fontSize: "11px",
                        color: "#94a3b8",
                        marginTop: "2px",
                      }}
                    >
                      {percentage(
                        item.cost,
                        total
                      )}
                    </div>
                  </div>
                </div>

                <ProgressBar
                  value={item.cost}
                  total={total}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DailyCostRow({
  date,
  cost,
  total,
  currency,
}: {
  date: string;
  cost: number;
  total: number;
  currency: string | null;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "120px minmax(0, 1fr) 90px",
        alignItems: "center",
        gap: "14px",
        padding: "11px 13px",
        borderBottom:
          "1px solid #edf1f5",
      }}
    >
      <div
        style={{
          fontSize: "12px",
          color: "#64748b",
          whiteSpace: "nowrap",
        }}
      >
        {formatDay(date)}
      </div>

      <ProgressBar
        value={cost}
        total={total}
      />

      <div
        style={{
          textAlign: "right",
          fontSize: "13px",
          fontWeight: 750,
          whiteSpace: "nowrap",
        }}
      >
        {money(cost, currency)}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  emphasis = false,
  muted = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <section
      style={{
        background: "#ffffff",
        borderRadius: "14px",
        border:
          "1px solid #e7ebf0",
        padding: "18px",
        minHeight: "108px",
      }}
    >
      <div
        style={{
          color: "#64748b",
          fontSize: "12px",
          fontWeight: 650,
          marginBottom: "10px",
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize:
            emphasis
              ? "29px"
              : "25px",
          fontWeight: 800,
          letterSpacing:
            "-0.035em",
          color:
            muted
              ? "#94a3b8"
              : "#172033",
        }}
      >
        {value}
      </div>
    </section>
  );
}

function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div
      style={{
        marginBottom: "18px",
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: "18px",
          lineHeight: 1.3,
        }}
      >
        {title}
      </h2>

      <div
        style={{
          marginTop: "5px",
          color: "#94a3b8",
          fontSize: "12px",
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}

function ProgressBar({
  value,
  total,
}: {
  value: number;
  total: number;
}) {
  const width =
    total > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (value / total) * 100
          )
        )
      : 0;

  return (
    <div
      style={{
        height: "8px",
        background: "#edf1f5",
        borderRadius: "999px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${width}%`,
          height: "100%",
          background: "#172033",
          borderRadius: "999px",
        }}
      />
    </div>
  );
}

function AttentionCard({
  label,
  title,
  detail,
}: {
  label: string;
  title: string;
  detail: string;
}) {
  return (
    <div
      style={{
        background: "#f8fafc",
        borderRadius: "12px",
        padding: "16px",
        border:
          "1px solid #edf1f5",
      }}
    >
      <div
        style={{
          fontSize: "11px",
          color: "#94a3b8",
          fontWeight: 700,
          textTransform:
            "uppercase",
          letterSpacing:
            "0.05em",
          marginBottom: "7px",
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: "17px",
          fontWeight: 750,
          marginBottom: "4px",
          overflow: "hidden",
          textOverflow:
            "ellipsis",
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: "13px",
          color: "#64748b",
        }}
      >
        {detail}
      </div>
    </div>
  );
}

function ActionCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <a
      href={href}
      style={{
        display: "block",
        background: "#ffffff",
        borderRadius: "14px",
        border:
          "1px solid #e7ebf0",
        padding: "17px",
        textDecoration: "none",
        color: "#172033",
      }}
    >
      <div
        style={{
          fontSize: "14px",
          fontWeight: 750,
          marginBottom: "5px",
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: "12px",
          color: "#64748b",
          lineHeight: 1.5,
        }}
      >
        {description}
      </div>

      <div
        style={{
          marginTop: "11px",
          fontSize: "12px",
          fontWeight: 700,
        }}
      >
        Open →
      </div>
    </a>
  );
}

function EmptyState({
  text,
  action,
}: {
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding:
          "16px 0 4px",
        color: "#94a3b8",
        fontSize: "13px",
      }}
    >
      {text}
      {action ? (
        <div style={{ marginTop: "12px" }}>{action}</div>
      ) : null}
    </div>
  );
}