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

/*
 * R3.4-B2 verified usage evidence.
 *
 * The aggregated, READ-ONLY answer to "what verified historical
 * usage/cost evidence exists for this model?". It is deliberately NOT
 * a nominal price and must never be used as one: no per-token or
 * per-million-token rate is derived here, nothing here is fed into the
 * planner cost math, and currency totals are kept in their original
 * buckets.
 *
 * Only records that are clearly attributable and sufficiently
 * trustworthy count as evidence: usage accuracy 'verified' joined
 * through usage_record_id to a cost record whose provenance is
 * 'source_reported'. estimated/calculated/unknown rows are never part
 * of the verified evidence summary.
 */
export type VerifiedUsageEvidence = {
  providerId: string;
  modelId: string;
  currency: string;
  recordCount: number;
  /*
   * The number of distinct import batches behind the evidence, only
   * when it is reliably derivable. When any record has no import_id, an
   * export/import count cannot be claimed, so this stays null instead
   * of guessing.
   */
  exportCount: number | null;
  firstTimestamp: string;
  lastTimestamp: string;
  totalCostMicros: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  /*
   * The usage sources behind the evidence (for example official_export),
   * and the cost provenance, which is always 'source_reported' by the
   * filter above.
   */
  sources: string[];
  provenance: "source_reported";
};

type VerifiedEvidenceRow = {
  provider_id: string;
  model_id: string;
  currency: string;
  record_count: number | bigint;
  distinct_import_ids: number | bigint;
  null_import_count: number | bigint;
  first_timestamp: string;
  last_timestamp: string;
  total_cost_micros: number | bigint;
  input_tokens: number | bigint;
  output_tokens: number | bigint;
  cached_tokens: number | bigint;
  reasoning_tokens: number | bigint;
  sources: string;
};

function toSafeNumber(
  value: number | bigint | null | undefined
): number {
  return typeof value === "bigint"
    ? Number(value)
    : Number(value ?? 0);
}

/*
 * Reads the verified evidence of the given models as one deterministic
 * aggregate, grouped at model level and split into separate currency
 * buckets. Multiple currencies for the same model are returned as
 * separate entries; they are never combined into one numeric total.
 */
export function getVerifiedUsageEvidenceByModels(
  modelIds: ReadonlyArray<string>
): Record<string, VerifiedUsageEvidence[]> {
  initDb();

  if (modelIds.length === 0) {
    return {};
  }

  const db = getDb();

  const placeholders = modelIds
    .map(() => "?")
    .join(", ");

  const rows = db
    .prepare(
      `
        SELECT
          u.provider_id AS provider_id,
          u.model_id AS model_id,
          c.currency AS currency,
          COUNT(*) AS record_count,
          COUNT(
            DISTINCT CASE
              WHEN u.import_id IS NOT NULL
              THEN u.import_id
            END
          ) AS distinct_import_ids,
          COUNT(
            CASE
              WHEN u.import_id IS NULL
              THEN 1
            END
          ) AS null_import_count,
          MIN(u.timestamp) AS first_timestamp,
          MAX(u.timestamp) AS last_timestamp,
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
            SUM(u.reasoning_tokens),
            0
          ) AS reasoning_tokens,
          COALESCE(
            SUM(c.total_cost_micros),
            0
          ) AS total_cost_micros,
          GROUP_CONCAT(
            DISTINCT u.source
          ) AS sources
        FROM usage_records u
        JOIN cost_records c
          ON c.usage_record_id = u.id
        WHERE
          u.accuracy = 'verified'
          AND c.provenance = 'source_reported'
          AND u.model_id IN (${placeholders})
        GROUP BY
          u.provider_id,
          u.model_id,
          c.currency
        ORDER BY
          u.model_id ASC,
          c.currency ASC
      `
    )
    .all(...modelIds) as VerifiedEvidenceRow[];

  const byModel = new Map<
    string,
    VerifiedUsageEvidence[]
  >();

  for (const row of rows) {
    const nullImportCount =
      toSafeNumber(row.null_import_count);

    const distinctImportIds =
      toSafeNumber(row.distinct_import_ids);

    const exportCount =
      nullImportCount === 0 &&
      distinctImportIds > 0
        ? distinctImportIds
        : null;

    const evidence: VerifiedUsageEvidence = {
      providerId: row.provider_id,
      modelId: row.model_id,
      currency: row.currency,
      recordCount: toSafeNumber(
        row.record_count
      ),
      exportCount,
      firstTimestamp: row.first_timestamp,
      lastTimestamp: row.last_timestamp,
      totalCostMicros: toSafeNumber(
        row.total_cost_micros
      ),
      inputTokens: toSafeNumber(
        row.input_tokens
      ),
      outputTokens: toSafeNumber(
        row.output_tokens
      ),
      cachedTokens: toSafeNumber(
        row.cached_tokens
      ),
      reasoningTokens: toSafeNumber(
        row.reasoning_tokens
      ),
      sources: row.sources
        .split(",")
        .filter(Boolean),
      provenance: "source_reported",
    };

    const key = row.model_id;

    const existing = byModel.get(key);

    if (existing !== undefined) {
      existing.push(evidence);
    } else {
      byModel.set(key, [evidence]);
    }
  }

  return Object.fromEntries(byModel);
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