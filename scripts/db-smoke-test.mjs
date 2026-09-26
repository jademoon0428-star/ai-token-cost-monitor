import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDir = join(process.cwd(), "data");
const dbPath = join(dataDir, "ai-token-cost-monitor-smoke.db");
mkdirSync(dataDir, { recursive: true });
rmSync(dbPath, { force: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE usage_records (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    source TEXT NOT NULL,
    accuracy TEXT NOT NULL
  );
`);
db.prepare(`INSERT INTO usage_records VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
  "smoke-1", "OpenAI", "gpt-test", 1200, 300, "official_api", "verified"
);
const row = db.prepare(`SELECT * FROM usage_records WHERE id = ?`).get("smoke-1");
if (!row || row.provider !== "OpenAI" || row.input_tokens !== 1200) {
  throw new Error("SQLite smoke test failed");
}
console.log("SQLite smoke test: PASS");
console.log(JSON.stringify(row));
rmSync(dbPath, { force: true });
