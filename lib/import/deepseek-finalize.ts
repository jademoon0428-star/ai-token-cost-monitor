import { getDb } from "../db";
import { initDb } from "../schema";

import type {
  DeepSeekExportSummary,
  DeepSeekUsageCostPair,
} from "../parsers/deepseek-export";

/*
 * Single, shared finalize step for an official DeepSeek export batch.
 *
 * Both entry points use it:
 *   - app/api/import/deepseek/route.ts (Confirm)
 *   - scripts/import-deepseek-export.mjs (CLI)
 *
 * It keeps the batch atomic: usage records, cost records and the import
 * journal are written inside one SQLite transaction. Any key write that
 * fails rolls the whole batch back, so a failed import never leaves
 * half-imported Money records or an untraceable journal row.
 *
 * The provider/model slugs and token/cost normalisation below replicate
 * lib/repositories/usage-repository.ts and cost-repository.ts exactly so
 * both import entry points keep producing identical deterministic IDs.
 */

export type DeepSeekImportResult = {
  importId: string;
  imported: number;
  costed: number;
  skipped: number;
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

function normalizeMicros(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.trunc(value);
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

function toChanges(value: number | bigint): number {
  return typeof value === "bigint"
    ? Number(value)
    : value;
}

export function finalizeDeepSeekImport(options: {
  records: DeepSeekUsageCostPair[];
  summary: DeepSeekExportSummary;
  zipSha256: string;
}): DeepSeekImportResult {
  const {
    records,
    summary,
    zipSha256,
  } = options;

  const importId =
    `import_deepseek_${zipSha256.slice(0, 32)}`;

  initDb();

  const db = getDb();
  const now = new Date().toISOString();

  let providerId = "provider_deepseek";

  if (records.length > 0) {
    providerId =
      getProviderId(records[0].provider);

    db.prepare(
      `INSERT OR IGNORE INTO providers
       (id, name, created_at)
       VALUES (?, ?, ?)`
    ).run(
      providerId,
      records[0].provider,
      now
    );
  }

  const usageExists = db.prepare(
    `SELECT 1 FROM usage_records WHERE id = ?`
  );
  const costExists = db.prepare(
    `SELECT 1 FROM cost_records WHERE usage_record_id = ?`
  );

  const insertModel = db.prepare(
    `INSERT OR IGNORE INTO models
     (id, provider_id, name, created_at)
     VALUES (?, ?, ?, ?)`
  );

  const insertUsage = db.prepare(
    `INSERT OR IGNORE INTO usage_records
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
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertCost = db.prepare(
    `INSERT OR IGNORE INTO cost_records
     (
       id,
       usage_record_id,
       import_id,
       input_cost_micros,
       output_cost_micros,
       cached_cost_micros,
       reasoning_cost_micros,
       total_cost_micros,
       currency,
       pricing_version,
       provenance,
       created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertLog = db.prepare(
    `INSERT OR IGNORE INTO import_logs
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
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  db.exec("BEGIN");

  try {
    let imported = 0;
    let costed = 0;
    let skipped = 0;

    for (const record of records) {
      const modelId =
        getModelId(providerId, record.model);

      insertModel.run(
        modelId,
        providerId,
        record.model,
        now
      );

      if (usageExists.get(record.usageId)) {
        skipped++;
      } else {
        const usageChanges =
          toChanges(
            insertUsage.run(
              record.usageId,
              providerId,
              modelId,
              record.timestamp,
              normalizeTokenValue(record.inputTokens),
              normalizeTokenValue(record.outputTokens),
              normalizeTokenValue(record.cachedTokens),
              normalizeTokenValue(record.reasoningTokens),
              record.application ?? null,
              record.project ?? null,
              importId,
              "official_export",
              "verified",
              now
            ).changes
          );

        if (usageChanges === 0) {
          throw new Error(
            `Failed to insert usage record: ${record.usageId}`
          );
        }

        imported++;
      }

      if (costExists.get(record.usageId)) {
        continue;
      }

      const costChanges =
        toChanges(
          insertCost.run(
            record.costId,
            record.usageId,
            importId,
            normalizeMicros(record.inputCostMicros),
            normalizeMicros(record.outputCostMicros),
            normalizeMicros(record.cachedCostMicros),
            normalizeMicros(record.reasoningCostMicros),
            normalizeMicros(record.totalCostMicros),
            record.currency,
            record.pricingVersion,
            "source_reported",
            now
          ).changes
        );

      if (costChanges === 0) {
        throw new Error(
          `Failed to insert cost record: ${record.costId}`
        );
      }

      costed++;
    }

    /*
     * Journal fields are a batch-level source declaration describing the
     * official ZIP (what the export reports), not the number of rows
     * actually merged on this run.
     */
    insertLog.run(
      importId,
      summary.source,
      zipSha256,
      summary.recordCount,
      summary.minTimestamp,
      summary.maxTimestamp,
      summary.currency,
      summary.totalCostMicros,
      now
    );

    db.exec("COMMIT");

    return {
      importId,
      imported,
      costed,
      skipped,
    };
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Ignore rollback errors so the original failure is preserved.
    }

    throw error;
  }
}