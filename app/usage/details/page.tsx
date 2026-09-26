"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

type UsageResponse = {
  currency?: string;
  count?: number;
  usage?: UsageRow[];
  records?: UsageRow[];
};

type TimeFilter =
  | "7d"
  | "30d"
  | "all";

const money = (
  micros: number,
  currency = "CNY"
) => {
  const value =
    Number(micros || 0) /
    1_000_000;

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
    return `${(
      n / 1_000_000
    ).toFixed(2)}M`;
  }

  if (n >= 1_000) {
    return `${(
      n / 1_000
    ).toFixed(1)}K`;
  }

  return String(n);
};

const formatDateTime = (
  timestamp: string
) => {
  const date =
    new Date(timestamp);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  return date.toLocaleString(
    "en-SG",
    {
      timeZone:
        "Asia/Singapore",
    }
  );
};

const singaporeDateKey = (
  timestamp: string
) => {
  const date =
    new Date(timestamp);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Asia/Singapore",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).formatToParts(date);

  const result: Record<
    string,
    string
  > = {};

  for (const part of parts) {
    if (
      part.type !==
      "literal"
    ) {
      result[part.type] =
        part.value;
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
    date.getUTCDate() +
      days
  );

  return date
    .toISOString()
    .slice(0, 10);
};

const todaySingapore = () => {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Asia/Singapore",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).formatToParts(
      new Date()
    );

  const result: Record<
    string,
    string
  > = {};

  for (const part of parts) {
    if (
      part.type !==
      "literal"
    ) {
      result[part.type] =
        part.value;
    }
  }

  return `${result.year}-${result.month}-${result.day}`;
};

const matchesTime = (
  timestamp: string,
  filter: TimeFilter
) => {
  if (filter === "all") {
    return true;
  }

  const record =
    singaporeDateKey(
      timestamp
    );

  const today =
    todaySingapore();

  const days =
    filter === "7d"
      ? 7
      : 30;

  const start =
    addDays(
      today,
      -(days - 1)
    );

  return (
    record >= start &&
    record <= today
  );
};

export default function UsageDetailsPage() {
  const [rows, setRows] =
    useState<UsageRow[]>([]);

  const [currency, setCurrency] =
    useState("CNY");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [provider, setProvider] =
    useState("all");

  const [model, setModel] =
    useState("all");

  const [timeFilter, setTimeFilter] =
    useState<TimeFilter>(
      "30d"
    );

  const load = async () => {
    try {
      setLoading(true);
      setError("");

      const response =
        await fetch(
          "/api/usage",
          {
            cache:
              "no-store",
          }
        );

      if (!response.ok) {
        throw new Error(
          `Unable to load usage data (${response.status}).`
        );
      }

      const data =
        (await response.json()) as UsageResponse;

      const records =
        Array.isArray(
          data.usage
        )
          ? data.usage
          : Array.isArray(
                data.records
              )
            ? data.records
            : [];

      setRows(records);
      setCurrency(
        data.currency ||
          "CNY"
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load usage data."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const providers =
    useMemo(() => {
      return Array.from(
        new Set(
          rows
            .map(
              (row) =>
                row.provider
            )
            .filter(Boolean)
        )
      ).sort();
    }, [rows]);

  const models =
    useMemo(() => {
      return Array.from(
        new Set(
          rows
            .map(
              (row) =>
                row.model
            )
            .filter(Boolean)
        )
      ).sort();
    }, [rows]);

  const filtered =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return rows
        .filter((row) => {
          const text = [
            row.provider,
            row.model,
            row.application,
            row.project,
            row.source,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          const searchMatch =
            !query ||
            text.includes(query);

          const providerMatch =
            provider ===
              "all" ||
            row.provider ===
              provider;

          const modelMatch =
            model ===
              "all" ||
            row.model ===
              model;

          const timeMatch =
            matchesTime(
              row.timestamp,
              timeFilter
            );

          return (
            searchMatch &&
            providerMatch &&
            modelMatch &&
            timeMatch
          );
        })
        .sort(
          (a, b) =>
            new Date(
              b.timestamp
            ).getTime() -
            new Date(
              a.timestamp
            ).getTime()
        );
    }, [
      rows,
      search,
      provider,
      model,
      timeFilter,
    ]);

  const totalTokens =
    filtered.reduce(
      (sum, row) =>
        sum +
        Number(
          row.input_tokens ||
            0
        ) +
        Number(
          row.output_tokens ||
            0
        ),
      0
    );

  const totalCost =
    filtered.reduce(
      (sum, row) =>
        sum +
        Number(
          row.total_cost_micros ||
            0
        ),
      0
    );

  return (
    <main className="usage-page">
      <div className="usage-top">
        <div>
          <Link
            href="/"
            style={{
              display: "inline-block",
              marginBottom: 10,
              color: "#555",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            ← Dashboard
          </Link>

          <small>
            MONITOR / USAGE /
            DETAILS
          </small>

          <h1>
            Usage details
          </h1>

          <p>
            Inspect individual
            verified usage records,
            tokens, models, and
            costs.
          </p>
        </div>

        <a
          className="export"
          href="/usage"
        >
          ← Usage overview
        </a>
      </div>

      <div
        className="usage-metrics"
        style={{
          marginBottom:
            "24px",
        }}
      >
        <div className="um">
          <small>
            RECORDS
          </small>

          <b>
            {filtered.length}
          </b>

          <span>
            of {rows.length}
          </span>
        </div>

        <div className="um">
          <small>
            TOKENS
          </small>

          <b>
            {compact(
              totalTokens
            )}
          </b>

          <span>
            input + output
          </span>
        </div>

        <div className="um">
          <small>
            VERIFIED COST
          </small>

          <b>
            {money(
              totalCost,
              currency
            )}
          </b>

          <span>
            {currency}
          </span>
        </div>
      </div>

      {error && (
        <section
          className="usage-card"
          style={{
            marginBottom:
              "24px",
          }}
        >
          <h2>
            Unable to load
            usage details
          </h2>

          <p
            style={{
              opacity: 0.7,
            }}
          >
            {error}
          </p>

          <button
            className="export"
            onClick={() =>
              void load()
            }
          >
            Try again
          </button>
        </section>
      )}

      <section className="filters">
        <div className="search">
          ⌕

          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search model, provider, project or application..."
          />
        </div>

        <select
          value={provider}
          onChange={(event) =>
            setProvider(
              event.target.value
            )
          }
        >
          <option value="all">
            All providers
          </option>

          {providers.map(
            (item) => (
              <option
                key={item}
                value={item}
              >
                {item}
              </option>
            )
          )}
        </select>

        <select
          value={model}
          onChange={(event) =>
            setModel(
              event.target.value
            )
          }
        >
          <option value="all">
            All models
          </option>

          {models.map(
            (item) => (
              <option
                key={item}
                value={item}
              >
                {item}
              </option>
            )
          )}
        </select>

        <select
          value={timeFilter}
          onChange={(event) =>
            setTimeFilter(
              event.target
                .value as TimeFilter
            )
          }
        >
          <option value="7d">
            Last 7 days
          </option>

          <option value="30d">
            Last 30 days
          </option>

          <option value="all">
            All time
          </option>
        </select>
      </section>

      <section className="usage-card">
        <div className="card-head">
          <div>
            <h2>
              Usage records
            </h2>

            <p>
              {loading
                ? "Loading details..."
                : `Showing ${filtered.length} of ${rows.length} stored records`}
            </p>
          </div>

          <span className="live">
            ● DATABASE
          </span>
        </div>

        <div className="usage-table">
          <div className="tr th">
            <span>
              TIME
            </span>

            <span>
              PROVIDER / MODEL
            </span>

            <span>
              PROJECT
            </span>

            <span>
              TOKENS
            </span>

            <span>
              COST
            </span>
          </div>

          {filtered.map(
            (row) => (
              <div
                className="tr"
                key={row.id}
              >
                <span>
                  {formatDateTime(
                    row.timestamp
                  )}
                </span>

                <span>
                  <b>
                    {row.provider}
                  </b>

                  <small>
                    {row.model}
                  </small>
                </span>

                <span>
                  {row.project ||
                    "—"}
                </span>

                <span>
                  <b>
                    {compact(
                      Number(
                        row.input_tokens ||
                          0
                      ) +
                        Number(
                          row.output_tokens ||
                            0
                        )
                    )}
                  </b>

                  <small>
                    {compact(
                      row.input_tokens
                    )}{" "}
                    in /{" "}
                    {compact(
                      row.cached_tokens ||
                        0
                    )}{" "}
                    cached /{" "}
                    {compact(
                      row.output_tokens
                    )}{" "}
                    out
                  </small>
                </span>

                <strong>
                  {row.total_cost_micros ==
                  null
                    ? "—"
                    : money(
                        row.total_cost_micros,
                        currency
                      )}
                </strong>
              </div>
            )
          )}

          {!loading &&
            !filtered.length && (
              <div
                style={{
                  padding:
                    "40px",
                  textAlign:
                    "center",
                  opacity: 0.65,
                }}
              >
                No usage records
                match the current
                filters.
              </div>
            )}
        </div>
      </section>
    </main>
  );
}