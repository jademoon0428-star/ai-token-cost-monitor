import { randomUUID } from "node:crypto";

import { getDb } from "@/lib/db";
import { initDb } from "@/lib/schema";
import type { NormalizedUsage } from "@/providers/types";

export type UsageDatabaseRow = {
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  application: string | null;
  project: string | null;
  import_id: string | null;
  input_tokens: number | bigint | null;
  output_tokens: number | bigint | null;
  cached_tokens: number | bigint | null;
  reasoning_tokens: number | bigint | null;
  source: string;
  accuracy: string;
  total_cost_micros: number | bigint | null;
};

export type UsageDatabaseSummary = {
  input_tokens: number | bigint;
  output_tokens: number | bigint;
  cached_tokens: number | bigint;
  total_tokens: number | bigint;
  total_cost_micros: number | bigint;
};

export type InsertUsageOptions = {
  ignoreDuplicate?: boolean;
  importId?: string | null;
};

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function normalizeTokenValue(
  value: number | null | undefined
): number {
  if (!Number.isFinite(value ?? 0)) {
    return 0;
  }

  return Math.max(
    0,
    Math.trunc(value ?? 0)
  );
}

function getProviderId(
  provider: string
): string {
  return `provider_${slug(provider)}`;
}

function getModelId(
  providerId: string,
  model: string
): string {
  return `${providerId}_${slug(model)}`;
}

function ensureProviderAndModel(
  usage: NormalizedUsage,
  now: string
) {
  const db = getDb();

  const providerId =
    getProviderId(usage.provider);

  const modelId =
    getModelId(
      providerId,
      usage.model
    );

  db.prepare(
    `
      INSERT OR IGNORE INTO providers
      (
        id,
        name,
        created_at
      )
      VALUES (?, ?, ?)
    `
  ).run(
    providerId,
    usage.provider,
    now
  );

  db.prepare(
    `
      INSERT OR IGNORE INTO models
      (
        id,
        provider_id,
        name,
        created_at
      )
      VALUES (?, ?, ?, ?)
    `
  ).run(
    modelId,
    providerId,
    usage.model,
    now
  );

  return {
    providerId,
    modelId,
  };
}

export function insertUsageRecord(
  usage: NormalizedUsage,
  options: InsertUsageOptions = {}
): string {
  initDb();

  const db = getDb();

  const now =
    new Date().toISOString();

  const usageId =
    usage.id ?? randomUUID();

  const {
    providerId,
    modelId,
  } = ensureProviderAndModel(
    usage,
    now
  );

  const insertMode =
    options.ignoreDuplicate
      ? "INSERT OR IGNORE"
      : "INSERT";

  db.prepare(
    `
      ${insertMode} INTO usage_records
      (
        id,
        provider_id,
        model_id,
        timestamp,
        input_tokens,
        output_tokens,
        cached_tokens,
        reasoning_tokens,
        application,
        project,
        import_id,
        source,
        accuracy,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    usageId,
    providerId,
    modelId,
    usage.timestamp,
    normalizeTokenValue(
      usage.inputTokens
    ),
    normalizeTokenValue(
      usage.outputTokens
    ),
    normalizeTokenValue(
      usage.cachedTokens
    ),
    normalizeTokenValue(
      usage.reasoningTokens
    ),
    usage.application ?? null,
    usage.project ?? null,
    options.importId ?? null,
    usage.source,
    usage.accuracy,
    now
  );

  return usageId;
}

export function getUsageRecords(options: {
  start?: Date | null;
  end?: Date | null;
  limit?: number;
} = {}): UsageDatabaseRow[] {
  initDb();

  const db = getDb();

  const conditions: string[] = [];
  const params: string[] = [];

  if (options.start) {
    conditions.push(
      "u.timestamp >= ?"
    );

    params.push(
      options.start.toISOString()
    );
  }

  if (options.end) {
    conditions.push(
      "u.timestamp <= ?"
    );

    params.push(
      options.end.toISOString()
    );
  }

  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  const safeLimit =
    options.limit !== undefined
      ? Math.max(
          1,
          Math.min(
            10000,
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
          u.id,
          u.timestamp,
          p.name AS provider,
          m.name AS model,
          u.application,
          u.project,
          u.import_id,
          u.input_tokens,
          u.output_tokens,
          u.cached_tokens,
          u.reasoning_tokens,
          u.source,
          u.accuracy,
          c.total_cost_micros
        FROM usage_records u
        JOIN providers p
          ON p.id = u.provider_id
        JOIN models m
          ON m.id = u.model_id
        LEFT JOIN cost_records c
          ON c.usage_record_id = u.id
        ${whereClause}
        ORDER BY u.timestamp DESC
        ${limitClause}
      `
    )
    .all(
      ...params
    ) as UsageDatabaseRow[];
}

export function getUsageSummary(): UsageDatabaseSummary {
  initDb();

  const db = getDb();

  return db
    .prepare(
      `
        SELECT
          COALESCE(
            SUM(u.input_tokens),
            0
          ) AS input_tokens,

          COALESCE(
            SUM(u.output_tokens),
            0
          ) AS output_tokens,

          COALESCE(
            SUM(u.cached_tokens),
            0
          ) AS cached_tokens,

          COALESCE(
            SUM(
              u.input_tokens +
              u.output_tokens
            ),
            0
          ) AS total_tokens,

          COALESCE(
            SUM(c.total_cost_micros),
            0
          ) AS total_cost_micros

        FROM usage_records u

        LEFT JOIN cost_records c
          ON c.usage_record_id = u.id
      `
    )
    .get() as UsageDatabaseSummary;
}

export function getMostUsedCurrency(): string {
  initDb();

  const db = getDb();

  const row = db
    .prepare(
      `
        SELECT
          currency
        FROM cost_records
        GROUP BY currency
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