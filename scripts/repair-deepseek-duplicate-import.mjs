import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";

const dbPath = join(process.cwd(), "data", "ai-token-cost-monitor.db");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");

// This is a one-time repair for the known development database state:
// an older 49-row Sep-5 hourly import was followed by the authoritative
// 30-day official export containing the same Sep-5 day. Keep the later
// 24-row export batch and remove only the older 49-row batch.
const batches = db.prepare(`
  SELECT
    u.created_at,
    COUNT(*) AS row_count,
    MIN(u.timestamp) AS min_timestamp,
    MAX(u.timestamp) AS max_timestamp,
    SUM(c.total_cost_micros) AS total_cost_micros
  FROM usage_records u
  JOIN cost_records c ON c.usage_record_id = u.id
  JOIN providers p ON p.id = u.provider_id
  WHERE p.name = 'DeepSeek' AND u.source = 'official_export'
  GROUP BY u.created_at
  ORDER BY u.created_at
`).all();

const oldBatch = batches.find((b) =>
  Number(b.row_count) === 49 &&
  String(b.min_timestamp).startsWith("2026-09-05T") &&
  String(b.max_timestamp).startsWith("2026-09-05T")
);

if (!oldBatch) {
  console.log("No known duplicate DeepSeek import batch found. No changes made.");
  db.close();
  process.exit(0);
}

const before = db.prepare(`
  SELECT COUNT(*) AS rows, COALESCE(SUM(c.total_cost_micros), 0) AS cost
  FROM usage_records u
  JOIN cost_records c ON c.usage_record_id = u.id
  WHERE u.created_at = ?
`).get(oldBatch.created_at);

db.exec("BEGIN");
try {
  db.prepare(`DELETE FROM cost_records WHERE usage_record_id IN (
    SELECT id FROM usage_records WHERE created_at = ?
  )`).run(oldBatch.created_at);
  db.prepare(`DELETE FROM usage_records WHERE created_at = ?`).run(oldBatch.created_at);
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

const after = db.prepare(`
  SELECT COUNT(*) AS rows, COALESCE(SUM(c.total_cost_micros), 0) AS cost
  FROM usage_records u
  JOIN cost_records c ON c.usage_record_id = u.id
`).get();

console.log(`Removed duplicate DeepSeek batch: ${before.rows} usage/cost rows`);
console.log(`Removed cost: CNY ${(Number(before.cost) / 1_000_000).toFixed(6)}`);
console.log(`Database total after repair: ${(Number(after.cost) / 1_000_000).toFixed(6)} across ${after.rows} usage rows`);
console.log("Expected clean DeepSeek export total: CNY 107.208416");

db.close();
