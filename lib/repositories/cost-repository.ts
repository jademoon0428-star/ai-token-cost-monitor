import { getDb } from "@/lib/db";
import { initDb } from "@/lib/schema";

export type CostRecordProvenance =
  | "source_reported"
  | "calculated"
  | "estimated"
  | "unknown";

export type CostDatabaseRow = {
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  application: string | null;
  project: string | null;
  import_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_tokens: number | null;
  reasoning_tokens: number | null;
  source: string;
  accuracy: string;
  total_cost_micros: number | null;
  currency: string | null;
  provenance: CostRecordProvenance;
};

export type CostDatabaseQuery = {
  start?: Date | null;
  end?: Date | null;
};

export type InsertCostRecordInput = {
  id: string;
  usageRecordId: string;
  importId?: string | null;
  inputCostMicros: number;
  outputCostMicros: number;
  cachedCostMicros: number;
  reasoningCostMicros: number;
  totalCostMicros: number;
  currency: string;
  pricingVersion: string;
  provenance?: CostRecordProvenance;
  createdAt?: string;
};

export type InsertPricingVersionInput = {
  id: string;
  providerId: string;
  model: string;
  currency: string;
  inputPerMillion: number;
  outputPerMillion: number;
  cachedPerMillion: number;
  reasoningPerMillion: number;
  effectiveFrom: string;
};

export type InsertRecordOptions = {
  ignoreDuplicate?: boolean;
};

export type CostModelRow = {
  provider: string;
  model: string;
  records: number;
  input_tokens: number | bigint;
  cached_tokens: number | bigint;
  output_tokens: number | bigint;
  reasoning_tokens: number | bigint;
  total_cost_micros: number | bigint;
  accuracy: string;
};

export type CostDailyRow = {
  day: string;
  total_cost_micros: number | bigint;
  input_tokens: number | bigint;
  cached_tokens: number | bigint;
  output_tokens: number | bigint;
};

export type CostProviderRow = {
  provider: string;
  total_cost_micros: number | bigint;
  records: number;
};

export type CostTotalRow = {
  total_cost_micros: number | bigint;
  input_tokens: number | bigint;
  cached_tokens: number | bigint;
  output_tokens: number | bigint;
};

function normalizeMicros(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.trunc(value);
}

function normalizeNumber(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return value;
}

export function insertCostRecord(
  input: InsertCostRecordInput,
  options: InsertRecordOptions = {}
): void {
  initDb();

  const db = getDb();

  const insertMode = options.ignoreDuplicate
    ? "INSERT OR IGNORE"
    : "INSERT";

  const createdAt =
    input.createdAt ??
    new Date().toISOString();

  const hasProvenance =
    input.provenance !== undefined;

  const columns = [
    "id",
    "usage_record_id",
    "import_id",
    "input_cost_micros",
    "output_cost_micros",
    "cached_cost_micros",
    "reasoning_cost_micros",
    "total_cost_micros",
    "currency",
    "pricing_version",
    ...(hasProvenance
      ? ["provenance"]
      : []),
    "created_at",
  ];

  const placeholders = columns
    .map(() => "?")
    .join(", ");

  const params: Array<
    string | number | null
  > = [
    input.id,
    input.usageRecordId,
    input.importId ?? null,
    normalizeMicros(
      input.inputCostMicros
    ),
    normalizeMicros(
      input.outputCostMicros
    ),
    normalizeMicros(
      input.cachedCostMicros
    ),
    normalizeMicros(
      input.reasoningCostMicros
    ),
    normalizeMicros(
      input.totalCostMicros
    ),
    input.currency,
    input.pricingVersion,
    ...(hasProvenance
      ? [input.provenance as string]
      : []),
    createdAt,
  ];

  db.prepare(
    `
      ${insertMode} INTO cost_records
      (
        ${columns.join(",\n        ")}
      )
      VALUES (${placeholders})
    `
  ).run(...params);
}

export function insertPricingVersion(
  input: InsertPricingVersionInput,
  options: InsertRecordOptions = {}
): void {
  initDb();

  const db = getDb();

  const insertMode = options.ignoreDuplicate
    ? "INSERT OR IGNORE"
    : "INSERT";

  db.prepare(
    `
      ${insertMode} INTO pricing_versions
      (
        id,
        provider_id,
        model,
        currency,
        input_per_million,
        output_per_million,
        cached_per_million,
        reasoning_per_million,
        effective_from
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    input.id,
    input.providerId,
    input.model,
    input.currency,
    normalizeNumber(input.inputPerMillion),
    normalizeNumber(input.outputPerMillion),
    normalizeNumber(input.cachedPerMillion),
    normalizeNumber(input.reasoningPerMillion),
    input.effectiveFrom
  );
}

export function getCostDatabaseRecords(
  query: CostDatabaseQuery = {}
): CostDatabaseRow[] {
  initDb();

  const db = getDb();

  const conditions: string[] = [];
  const params: string[] = [];

  if (query.start) {
    conditions.push("u.timestamp >= ?");
    params.push(query.start.toISOString());
  }

  if (query.end) {
    conditions.push("u.timestamp <= ?");
    params.push(query.end.toISOString());
  }

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  const rows = db
    .prepare(
      `
        SELECT
          u.id,
          u.timestamp,
          p.name AS provider,
          m.name AS model,
          u.application,
          u.project,
          u.input_tokens,
          u.output_tokens,
          u.cached_tokens,
          u.reasoning_tokens,
          u.source,
          u.accuracy,
          c.total_cost_micros,
          c.import_id AS import_id,
          c.currency,
          c.provenance
        FROM usage_records u
        JOIN providers p
          ON p.id = u.provider_id
        JOIN models m
          ON m.id = u.model_id
        LEFT JOIN cost_records c
          ON c.usage_record_id = u.id
        ${whereClause}
        ORDER BY u.timestamp DESC
      `
    )
    .all(...params) as CostDatabaseRow[];

  return rows;
}

export function getCostModelBreakdown(): CostModelRow[] {
  initDb();

  const db = getDb();

  return db
    .prepare(
      `
        SELECT
          p.name AS provider,
          m.name AS model,
          COUNT(*) AS records,
          COALESCE(
            SUM(u.input_tokens),
            0
          ) AS input_tokens,
          COALESCE(
            SUM(u.cached_tokens),
            0
          ) AS cached_tokens,
          COALESCE(
            SUM(u.output_tokens),
            0
          ) AS output_tokens,
          COALESCE(
            SUM(u.reasoning_tokens),
            0
          ) AS reasoning_tokens,
          COALESCE(
            SUM(c.total_cost_micros),
            0
          ) AS total_cost_micros,
          MIN(u.accuracy) AS accuracy
        FROM cost_records c
        JOIN usage_records u
          ON u.id = c.usage_record_id
        JOIN providers p
          ON p.id = u.provider_id
        JOIN models m
          ON m.id = u.model_id
        GROUP BY
          p.name,
          m.name
        ORDER BY
          total_cost_micros DESC
      `
    )
    .all() as CostModelRow[];
}

export function getCostDailyBreakdown(): CostDailyRow[] {
  initDb();

  const db = getDb();

  return db
    .prepare(
      `
        SELECT
          date(u.timestamp) AS day,
          COALESCE(
            SUM(c.total_cost_micros),
            0
          ) AS total_cost_micros,
          COALESCE(
            SUM(u.input_tokens),
            0
          ) AS input_tokens,
          COALESCE(
            SUM(u.cached_tokens),
            0
          ) AS cached_tokens,
          COALESCE(
            SUM(u.output_tokens),
            0
          ) AS output_tokens
        FROM cost_records c
        JOIN usage_records u
          ON u.id = c.usage_record_id
        GROUP BY
          date(u.timestamp)
        ORDER BY
          day ASC
      `
    )
    .all() as CostDailyRow[];
}

export function getCostProviderBreakdown(): CostProviderRow[] {
  initDb();

  const db = getDb();

  return db
    .prepare(
      `
        SELECT
          p.name AS provider,
          SUM(c.total_cost_micros) AS total_cost_micros,
          COUNT(*) AS records
        FROM cost_records c
        JOIN usage_records u
          ON u.id = c.usage_record_id
        JOIN providers p
          ON p.id = u.provider_id
        GROUP BY
          p.name
        ORDER BY
          total_cost_micros DESC
      `
    )
    .all() as CostProviderRow[];
}

export function getCostTotal(): CostTotalRow {
  initDb();

  const db = getDb();

  return db
    .prepare(
      `
        SELECT
          COALESCE(
            SUM(c.total_cost_micros),
            0
          ) AS total_cost_micros,
          COALESCE(
            SUM(u.input_tokens),
            0
          ) AS input_tokens,
          COALESCE(
            SUM(u.cached_tokens),
            0
          ) AS cached_tokens,
          COALESCE(
            SUM(u.output_tokens),
            0
          ) AS output_tokens
        FROM cost_records c
        JOIN usage_records u
          ON u.id = c.usage_record_id
      `
    )
    .get() as CostTotalRow;
}

export function getMostUsedCostCurrency(): string {
  initDb();

  const db = getDb();

  const row = db
    .prepare(
      `
        SELECT
          currency
        FROM cost_records
        GROUP BY
          currency
        ORDER BY
          SUM(total_cost_micros) DESC
        LIMIT 1
      `
    )
    .get() as
    | { currency?: string }
    | undefined;

  return row?.currency ?? "USD";
}