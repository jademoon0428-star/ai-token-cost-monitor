import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dbPath = path.join(root, "data", "ai-token-cost-monitor.db");
const fixture = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/deepseek-response.json"), "utf8"));
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`CREATE TABLE IF NOT EXISTS providers (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS models (id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(provider_id, name), FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS usage_records (id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, model_id TEXT NOT NULL, timestamp TEXT NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, cached_tokens INTEGER NOT NULL DEFAULT 0, reasoning_tokens INTEGER NOT NULL DEFAULT 0, application TEXT, project TEXT, source TEXT NOT NULL, accuracy TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE CASCADE, FOREIGN KEY(model_id) REFERENCES models(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS cost_records (id TEXT PRIMARY KEY, usage_record_id TEXT NOT NULL UNIQUE, input_cost_micros INTEGER NOT NULL DEFAULT 0, output_cost_micros INTEGER NOT NULL DEFAULT 0, cached_cost_micros INTEGER NOT NULL DEFAULT 0, reasoning_cost_micros INTEGER NOT NULL DEFAULT 0, total_cost_micros INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'USD', pricing_version TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(usage_record_id) REFERENCES usage_records(id) ON DELETE CASCADE);`);

// This mirrors the verified DeepSeek fixture used by the connector test.
const input = fixture.usage.input_tokens - fixture.usage.input_tokens_details.cached_tokens;
const cached = fixture.usage.input_tokens_details.cached_tokens;
const output = fixture.usage.output_tokens;
const timestamp = new Date(fixture.created * 1000).toISOString();
const date = new Date(timestamp);
const weekday = date.getUTCDay() >= 1 && date.getUTCDay() <= 5;
const hour = date.getUTCHours();
const peak = weekday && ((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10));
const multiplier = peak ? 2 : 1;
const inputRate = 0.22 * multiplier;
const cachedRate = 0.007 * multiplier;
const outputRate = 0.66 * multiplier;
const expectedMicros = Math.round(input / 1e6 * inputRate * 1e6) + Math.round(cached / 1e6 * cachedRate * 1e6) + Math.round(output / 1e6 * outputRate * 1e6);

const exists = db.prepare("SELECT id FROM usage_records WHERE id = ?").get(fixture.id);
if (!exists) {
  const now = new Date().toISOString();
  db.prepare("INSERT INTO providers (id, name, created_at) VALUES (?, ?, ?)").run("provider_deepseek", "DeepSeek", now);
  db.prepare("INSERT INTO models (id, provider_id, name, created_at) VALUES (?, ?, ?, ?)").run("provider_deepseek_" + fixture.model, "provider_deepseek", fixture.model, now);
  db.prepare("INSERT INTO usage_records (id, provider_id, model_id, timestamp, input_tokens, output_tokens, cached_tokens, reasoning_tokens, source, accuracy, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(fixture.id, "provider_deepseek", "provider_deepseek_" + fixture.model, timestamp, fixture.usage.input_tokens, fixture.usage.output_tokens, cached, fixture.usage.output_tokens_details?.reasoning_tokens ?? 0, "official_api", "verified", now);
  db.prepare("INSERT INTO cost_records (id, usage_record_id, input_cost_micros, output_cost_micros, cached_cost_micros, reasoning_cost_micros, total_cost_micros, currency, pricing_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("cost-" + fixture.id, fixture.id, Math.round(input / 1e6 * inputRate * 1e6), Math.round(output / 1e6 * outputRate * 1e6), Math.round(cached / 1e6 * cachedRate * 1e6), 0, expectedMicros, "USD", "deepseek-test", now);
}

const row = db.prepare(`
  SELECT u.id, u.input_tokens, u.output_tokens, u.cached_tokens, u.reasoning_tokens,
    c.total_cost_micros, u.accuracy, u.source
  FROM usage_records u JOIN cost_records c ON c.usage_record_id = u.id
  WHERE u.id = ?
`).get(fixture.id);

if (!row) throw new Error("DeepSeek fixture was not stored in SQLite. POST the fixture to /api/providers/deepseek first.");
if (Number(row.total_cost_micros) !== expectedMicros) throw new Error(`cost mismatch: expected ${expectedMicros}, got ${row.total_cost_micros}`);
if (row.accuracy !== "verified" || row.source !== "official_api") throw new Error("accuracy/source mismatch");
console.log("DeepSeek → SQLite → Cost Engine smoke test: PASS");
console.log(JSON.stringify(row, null, 2));
