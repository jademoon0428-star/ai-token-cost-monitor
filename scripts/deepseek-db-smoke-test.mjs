import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function parseDbTarget(argv) {
  const args = argv.slice(2);
  if (args.length === 0) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-smoke-"));
    return { dbPath: path.join(tempDir, "deepseek-smoke.db"), tempDir, owned: true };
  }
  if (args.length === 2 && args[0] === "--db") {
    const value = args[1];
    if (!value || value.startsWith("--")) {
      throw new Error("--db requires a file path argument; refusing to fall back to any default database");
    }
    return { dbPath: path.resolve(value), tempDir: null, owned: false };
  }
  throw new Error(`invalid arguments: ${JSON.stringify(args)}; usage: node scripts/deepseek-db-smoke-test.mjs [--db <path>]`);
}

let target;
try {
  target = parseDbTarget(process.argv);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
const { dbPath, tempDir, owned } = target;

function runSmoke(db) {
  db.exec("PRAGMA foreign_keys = ON;");

  db.exec(`CREATE TABLE IF NOT EXISTS providers (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS models (id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(provider_id, name), FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS usage_records (id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, model_id TEXT NOT NULL, timestamp TEXT NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, cached_tokens INTEGER NOT NULL DEFAULT 0, reasoning_tokens INTEGER NOT NULL DEFAULT 0, application TEXT, project TEXT, source TEXT NOT NULL, accuracy TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE CASCADE, FOREIGN KEY(model_id) REFERENCES models(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS cost_records (id TEXT PRIMARY KEY, usage_record_id TEXT NOT NULL UNIQUE, input_cost_micros INTEGER NOT NULL DEFAULT 0, output_cost_micros INTEGER NOT NULL DEFAULT 0, cached_cost_micros INTEGER NOT NULL DEFAULT 0, reasoning_cost_micros INTEGER NOT NULL DEFAULT 0, total_cost_micros INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'USD', pricing_version TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(usage_record_id) REFERENCES usage_records(id) ON DELETE CASCADE);`);

  const fixture = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/deepseek-response.json"), "utf8"));

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

  const providerId = "provider_deepseek";
  const providerName = "DeepSeek";
  const modelId = providerId + "_" + fixture.model;
  const costId = "cost-" + fixture.id;

  function describeUsage(row) {
    return JSON.stringify({
      id: row.id,
      source: row.source,
      accuracy: row.accuracy,
      input_tokens: row.input_tokens,
      output_tokens: row.output_tokens,
      cached_tokens: row.cached_tokens,
      reasoning_tokens: row.reasoning_tokens,
      timestamp: row.timestamp,
    });
  }

  function validateFixtureRow(usageRow, costRow) {
    if (usageRow.source !== "official_api" || usageRow.accuracy !== "verified") {
      throw new Error(`fixture ${fixture.id} exists but source/accuracy mismatch: ${describeUsage(usageRow)}`);
    }
    if (
      usageRow.input_tokens !== fixture.usage.input_tokens ||
      usageRow.cached_tokens !== cached ||
      usageRow.output_tokens !== output
    ) {
      throw new Error(`fixture ${fixture.id} exists but token fields mismatch: ${describeUsage(usageRow)}`);
    }
    if (Number(costRow.total_cost_micros) !== expectedMicros) {
      throw new Error(`fixture ${fixture.id} exists but cost mismatch: expected ${expectedMicros}, got ${costRow.total_cost_micros}`);
    }
  }

  const existingUsage = db.prepare("SELECT * FROM usage_records WHERE id = ?").get(fixture.id);
  if (existingUsage) {
    const existingCost = db.prepare("SELECT * FROM cost_records WHERE usage_record_id = ?").get(fixture.id);
    if (!existingCost) {
      throw new Error(`fixture ${fixture.id} exists in usage_records but its cost record is missing`);
    }
    validateFixtureRow(existingUsage, existingCost);
  } else {
    const orphanCost = db.prepare("SELECT id FROM cost_records WHERE id = ? OR usage_record_id = ?").get(costId, fixture.id);
    if (orphanCost) {
      throw new Error(`orphan fixture cost row without usage row: ${orphanCost.id}`);
    }
    db.exec("BEGIN");
    try {
      const provider = db.prepare("SELECT id FROM providers WHERE id = ?").get(providerId);
      if (!provider) {
        const nameClash = db.prepare("SELECT id FROM providers WHERE name = ?").get(providerName);
        if (nameClash) {
          throw new Error(`provider name "${providerName}" is already used by id "${nameClash.id}"; refusing to modify existing data`);
        }
        db.prepare("INSERT INTO providers (id, name, created_at) VALUES (?, ?, ?)").run(providerId, providerName, new Date().toISOString());
      }
      const model = db.prepare("SELECT id FROM models WHERE id = ?").get(modelId);
      if (!model) {
        const comboClash = db.prepare("SELECT id FROM models WHERE provider_id = ? AND name = ?").get(providerId, fixture.model);
        if (comboClash) {
          throw new Error(`model (provider_id="${providerId}", name="${fixture.model}") is already used by id "${comboClash.id}"; refusing to modify existing data`);
        }
        db.prepare("INSERT INTO models (id, provider_id, name, created_at) VALUES (?, ?, ?, ?)").run(modelId, providerId, fixture.model, new Date().toISOString());
      }
      db.prepare("INSERT INTO usage_records (id, provider_id, model_id, timestamp, input_tokens, output_tokens, cached_tokens, reasoning_tokens, source, accuracy, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(fixture.id, providerId, modelId, timestamp, fixture.usage.input_tokens, fixture.usage.output_tokens, cached, fixture.usage.output_tokens_details?.reasoning_tokens ?? 0, "official_api", "verified", new Date().toISOString());
      db.prepare("INSERT INTO cost_records (id, usage_record_id, input_cost_micros, output_cost_micros, cached_cost_micros, reasoning_cost_micros, total_cost_micros, currency, pricing_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(costId, fixture.id, Math.round(input / 1e6 * inputRate * 1e6), Math.round(output / 1e6 * outputRate * 1e6), Math.round(cached / 1e6 * cachedRate * 1e6), 0, expectedMicros, "USD", "deepseek-test", new Date().toISOString());
      db.exec("COMMIT");
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch {
      }
      throw err;
    }
  }

  const row = db.prepare(`
    SELECT u.id, u.input_tokens, u.output_tokens, u.cached_tokens, u.reasoning_tokens,
      c.total_cost_micros, u.accuracy, u.source
    FROM usage_records u JOIN cost_records c ON c.usage_record_id = u.id
    WHERE u.id = ?
  `).get(fixture.id);

  if (!row) throw new Error("DeepSeek fixture was not stored in SQLite.");
  if (Number(row.total_cost_micros) !== expectedMicros) throw new Error(`cost mismatch: expected ${expectedMicros}, got ${row.total_cost_micros}`);
  if (row.accuracy !== "verified" || row.source !== "official_api") throw new Error("accuracy/source mismatch");
  return row;
}

let db = null;
let failure = null;
let row = null;
try {
  db = new DatabaseSync(dbPath);
  row = runSmoke(db);
  console.log("DeepSeek → SQLite → Cost Engine smoke test: PASS");
  console.log(JSON.stringify(row, null, 2));
} catch (err) {
  failure = err;
} finally {
  if (db) {
    try {
      db.close();
    } catch {
    }
  }
}

if (failure) {
  console.error(`DeepSeek smoke failed; diagnostic database kept at: ${dbPath}`);
  console.error(failure.stack || String(failure));
  process.exit(1);
}

if (owned && tempDir) {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (cleanupErr) {
    console.error(`warning: failed to remove temp dir ${tempDir}: ${cleanupErr.message}`);
  }
}
