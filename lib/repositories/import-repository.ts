import { getDb } from "@/lib/db";
import { initDb } from "@/lib/schema";

export type ImportLogRow = {
  id: string;
  source: string;
  zip_sha256: string;
  record_count: number;
  min_timestamp: string | null;
  max_timestamp: string | null;
  currency: string | null;
  total_cost_micros: number | bigint | null;
  created_at: string;
};

export type InsertImportLogInput = {
  id: string;
  source: string;
  zipSha256: string;
  recordCount: number;
  minTimestamp?: string | null;
  maxTimestamp?: string | null;
  currency?: string | null;
  totalCostMicros: number;
  createdAt?: string;
};

export type InsertImportLogOptions = {
  ignoreDuplicate?: boolean;
};

function normalizeCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

function normalizeMicros(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.trunc(value);
}

export function insertImportLog(
  input: InsertImportLogInput,
  options: InsertImportLogOptions = {}
): void {
  initDb();

  const db = getDb();

  const insertMode = options.ignoreDuplicate
    ? "INSERT OR IGNORE"
    : "INSERT";

  db.prepare(
    `
      ${insertMode} INTO import_logs
      (
        id,
        source,
        zip_sha256,
        record_count,
        min_timestamp,
        max_timestamp,
        currency,
        total_cost_micros,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    input.id,
    input.source,
    input.zipSha256,
    normalizeCount(input.recordCount),
    input.minTimestamp ?? null,
    input.maxTimestamp ?? null,
    input.currency ?? null,
    normalizeMicros(input.totalCostMicros),
    input.createdAt ?? new Date().toISOString()
  );
}

export function getImportLogs(options: {
  limit?: number;
} = {}): ImportLogRow[] {
  initDb();

  const db = getDb();

  const safeLimit =
    options.limit !== undefined
      ? Math.max(
          1,
          Math.min(
            1000,
            Math.trunc(options.limit)
          )
        )
      : null;

  const limitClause =
    safeLimit !== null
      ? `LIMIT ${safeLimit}`
      : "";

  return db
    .prepare(
      `
        SELECT
          id,
          source,
          zip_sha256,
          record_count,
          min_timestamp,
          max_timestamp,
          currency,
          total_cost_micros,
          created_at
        FROM import_logs
        ORDER BY created_at DESC
        ${limitClause}
      `
    )
    .all() as ImportLogRow[];
}