import { getDb } from "@/lib/db";
import { initDb } from "@/lib/schema";


const OFFICIAL_SOURCE_SQL =
  "('official_export', 'official_api')";

const VERIFIED_ACCURACY_SQL =
  "('verified', 'exact')";
export type BudgetPeriod =
  | "daily"
  | "weekly"
  | "monthly";

export type BudgetRow = {
  id: string;
  period: BudgetPeriod;
  amount_micros: number;
  currency: string;
  created_at: string;
  updated_at: string;
};
type CostCurrencyRow = {
  currency?: string;
};

type CostSpendRow = {
  total_cost_micros?: number;
};

type DailySpendRow = {
  utc_date: string;
  total_cost_micros: number;
};

function initialize() {
  initDb();
  return getDb();
}

export function getDominantCostCurrency():
  | string
  | null {
  const db = initialize();

  const row = db
    .prepare(
      `
        SELECT
          c.currency
        FROM cost_records c
        JOIN usage_records u
          ON u.id = c.usage_record_id
        WHERE
          u.source IN ${OFFICIAL_SOURCE_SQL}
          AND u.accuracy IN ${VERIFIED_ACCURACY_SQL}
          AND c.total_cost_micros IS NOT NULL
        GROUP BY
          c.currency
        ORDER BY
          SUM(c.total_cost_micros) DESC
        LIMIT 1
      `
    )
    .get() as
    | CostCurrencyRow
    | undefined;

  return row?.currency ?? null;
}

export function getVerifiedOfficialSpend(
  start: Date,
  end: Date,
  currency: string | null
): number {
  if (!currency) {
    return 0;
  }

  const db = initialize();

  const row = db
    .prepare(
      `
        SELECT
          COALESCE(
            SUM(c.total_cost_micros),
            0
          ) AS total_cost_micros
        FROM cost_records c
        JOIN usage_records u
          ON u.id = c.usage_record_id
        WHERE
          u.timestamp >= ?
          AND u.timestamp < ?
          AND u.source IN ${OFFICIAL_SOURCE_SQL}
          AND u.accuracy IN ${VERIFIED_ACCURACY_SQL}
          AND c.currency = ?
      `
    )
    .get(
      start.toISOString(),
      end.toISOString(),
      currency
    ) as CostSpendRow | undefined;

  return Number(
    row?.total_cost_micros ?? 0
  );
}

export function getRecentDailySpend(
  start: Date,
  end: Date,
  currency: string | null
): DailySpendRow[] {
  if (!currency) {
    return [];
  }

  const db = initialize();

  return db
    .prepare(
      `
        SELECT
          substr(
            u.timestamp,
            1,
            10
          ) AS utc_date,

          COALESCE(
            SUM(c.total_cost_micros),
            0
          ) AS total_cost_micros

        FROM cost_records c

        JOIN usage_records u
          ON u.id = c.usage_record_id

        WHERE
          u.timestamp >= ?
          AND u.timestamp < ?
          AND u.source IN ${OFFICIAL_SOURCE_SQL}
          AND u.accuracy IN ${VERIFIED_ACCURACY_SQL}
          AND c.currency = ?

        GROUP BY
          substr(
            u.timestamp,
            1,
            10
          )

        ORDER BY
          utc_date ASC
      `
    )
    .all(
      start.toISOString(),
      end.toISOString(),
      currency
    ) as DailySpendRow[];
}

export function getLatestBudgets(): BudgetRow[] {
  const db = initialize();

  return db
    .prepare(
      `
        SELECT *
        FROM budgets
        ORDER BY
          CASE period
            WHEN 'daily' THEN 1
            WHEN 'weekly' THEN 2
            WHEN 'monthly' THEN 3
            ELSE 4
          END,
          updated_at DESC
      `
    )
    .all() as BudgetRow[];
}

export function getBudgetByPeriodAndCurrency(
  period: BudgetPeriod,
  currency: string
): BudgetRow | undefined {
  const db = initialize();

  return db
    .prepare(
      `
        SELECT
          *
        FROM budgets
        WHERE
          period = ?
          AND currency = ?
        ORDER BY
          updated_at DESC
        LIMIT 1
      `
    )
    .get(
      period,
      currency
    ) as BudgetRow | undefined;
}

export function updateBudget(
  id: string,
  amountMicros: number,
  updatedAt: string
): void {
  const db = initialize();

  db.prepare(
    `
      UPDATE budgets
      SET
        amount_micros = ?,
        updated_at = ?
      WHERE id = ?
    `
  ).run(
    amountMicros,
    updatedAt,
    id
  );
}

export function insertBudget(input: {
  id: string;
  period: BudgetPeriod;
  amountMicros: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}): void {
  const db = initialize();

  db.prepare(
    `
      INSERT INTO budgets (
        id,
        period,
        amount_micros,
        currency,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `
  ).run(
    input.id,
    input.period,
    input.amountMicros,
    input.currency,
    input.createdAt,
    input.updatedAt
  );
}