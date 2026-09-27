/*
 * v1.4-B AI Registry data-layer smoke test.
 *
 * Runs entirely against an isolated, freshly-created temp database
 * (NODE_ENV=development + chdir to a temp dir BEFORE the library
 * modules are loaded), so the user's production database in
 * %APPDATA%\AI-Cost-Management is never opened. The temp DB is
 * created by the real initDb()/schema and the fixtures go through the
 * real registry repository.
 */
import {
  existsSync,
  mkdtempSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { register } from "node:module";
import {
  fileURLToPath,
  pathToFileURL,
} from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

register(
  pathToFileURL(path.join(DIR, "ts-smoke-loader.mjs")).href,
  import.meta.url
);

const productionFileSnapshot = snapshotProductionFiles();

const TEMP_DIR = mkdtempSync(path.join(tmpdir(), "v14b-registry-smoke-"));

process.env.NODE_ENV = "development";
process.chdir(TEMP_DIR);

const { dbPath, getDb } = await import("../lib/db.ts");
const { initDb } = await import("../lib/schema.ts");
const registry = await import("../lib/registry/ai-registry-repository.ts");
const { AI_REGISTRY_SEED } = await import("../lib/registry/ai-registry-seed.ts");

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function tableExists(name) {
  const row = getDb()
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`
    )
    .get(name);

  return row !== undefined;
}

function columnsOf(name) {
  return getDb()
    .prepare(`PRAGMA table_info(${name})`)
    .all()
    .map((column) => column.name);
}

function countRows(name, where = "") {
  return Number(
    getDb()
      .prepare(`SELECT COUNT(*) AS total FROM ${name} ${where}`)
      .get().total
  );
}

/*
 * Model ids are derived with the production convention rather than
 * hardcoded, so check 4 and the lookups below cannot drift apart.
 */
function modelId(providerName, modelName) {
  return registry.getModelId(
    registry.getProviderId(providerName),
    modelName
  );
}

initDb();
const firstSeed = registry.seedAiRegistry();
const secondSeed = registry.seedAiRegistry();

check("1. the two new tables exist and the reused core tables are unchanged", () => {
  assert(tableExists("ai_model_capabilities"), "ai_model_capabilities is missing");
  assert(tableExists("user_ai_tools"), "user_ai_tools is missing");

  const providers = columnsOf("providers");
  assertEqual(
    providers.join(","),
    "id,name,created_at",
    "providers columns changed"
  );

  const models = columnsOf("models");
  assertEqual(
    models.join(","),
    "id,provider_id,name,created_at",
    "models columns changed"
  );

  const pricing = columnsOf("pricing_versions");
  assertEqual(
    pricing.join(","),
    "id,provider_id,model,currency,input_per_million,output_per_million,cached_per_million,reasoning_per_million,effective_from,effective_to",
    "pricing_versions columns changed"
  );

  for (const table of [
    "usage_records",
    "cost_records",
    "budgets",
    "tasks",
    "task_sessions",
    "task_usage_records",
    "import_logs"
  ]) {
    assert(tableExists(table), `${table} is missing`);
  }
});

check("2. seeding is idempotent", () => {
  assertEqual(
    firstSeed.providers,
    AI_REGISTRY_SEED.length,
    "provider count mismatch"
  );
  assertEqual(
    secondSeed.providers,
    firstSeed.providers,
    "provider count changed on re-seed"
  );
  assertEqual(
    countRows("providers"),
    AI_REGISTRY_SEED.length,
    "duplicate provider rows"
  );

  const expectedModels = AI_REGISTRY_SEED.reduce(
    (total, provider) => total + provider.models.length,
    0
  );
  assertEqual(
    countRows("models"),
    expectedModels,
    "model row count mismatch after two seeds"
  );
  assertEqual(
    countRows("ai_model_capabilities"),
    expectedModels,
    "capability row count mismatch after two seeds"
  );
  assertEqual(
    countRows("pricing_versions"),
    firstSeed.pricing,
    "duplicate pricing rows after two seeds"
  );
});

check("3. only the four approved providers are seeded", () => {
  const names = getDb()
    .prepare(`SELECT name FROM providers ORDER BY name`)
    .all()
    .map((row) => row.name);

  assertEqual(
    names.join(","),
    "Anthropic,DeepSeek,Google,OpenAI",
    "unexpected provider set"
  );

  for (const row of getDb()
    .prepare(`SELECT id, name FROM providers`)
    .all()) {
    assertEqual(
      row.id,
      `provider_${row.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      `provider id does not follow the convention: ${row.id}`
    );
  }
});

check("4. every model id follows the provider_id + slug convention", () => {
  const rows = getDb()
    .prepare(
      `SELECT m.id, m.provider_id, m.name FROM models m`
    )
    .all();

  assert(rows.length > 0, "no models seeded");

  for (const row of rows) {
    assertEqual(
      row.id,
      registry.getModelId(row.provider_id, row.name),
      `model id does not follow the convention: ${row.id}`
    );

    const provider = getDb()
      .prepare(`SELECT id FROM providers WHERE id = ?`)
      .get(row.provider_id);

    assert(provider !== undefined, `missing provider ${row.provider_id}`);
  }
});

check("5. capabilities are tri-state and carry no ranking column", () => {
  const columns = columnsOf("ai_model_capabilities");

  for (const forbidden of [
    "score",
    "rank",
    "tier",
    "weight",
    "confidence",
    "quality"
  ]) {
    assert(
      !columns.some((column) => column.includes(forbidden)),
      `ai_model_capabilities must not have a "${forbidden}" column`
    );
  }

  const rows = getDb()
    .prepare(
      `
        SELECT
          supports_tools,
          supports_vision,
          supports_reasoning,
          context_window_tokens,
          max_output_tokens
        FROM ai_model_capabilities
      `
    )
    .all();

  assert(rows.length > 0, "no capability rows");

  for (const row of rows) {
    for (const column of [
      "supports_tools",
      "supports_vision",
      "supports_reasoning"
    ]) {
      const value = row[column];

      assert(
        value === null || value === 0 || value === 1,
        `${column} must be NULL, 0 or 1, got ${JSON.stringify(value)}`
      );
    }
  }
});

check("6. Unknown stays null through the read layer", () => {
  const openai = registry.getRegistryModel(
    modelId("OpenAI", "gpt-5.6-sol")
  );

  assert(openai !== undefined, "gpt-5.6-sol not found");
  assert(openai.capabilities !== null, "capabilities missing");
  assertEqual(
    openai.capabilities.supports_vision,
    null,
    "unconfirmed OpenAI vision must stay Unknown (null), not false"
  );
  assertEqual(
    openai.capabilities.supports_tools,
    1,
    "gpt-5.6-sol tool support"
  );
  assertEqual(
    openai.capabilities.context_window_tokens,
    1050000,
    "gpt-5.6-sol context window"
  );

  const deepseekPro = registry.getRegistryModel(
    modelId("DeepSeek", "deepseek-v4-pro")
  );

  assert(deepseekPro !== undefined, "deepseek-v4-pro not found");
  assertEqual(
    deepseekPro.capabilities.supports_vision,
    null,
    "unconfirmed DeepSeek Pro vision must stay Unknown (null)"
  );
});

check("7. every capability fact points at an official source url", () => {
  const rows = getDb()
    .prepare(
      `
        SELECT
          m.name AS model_name,
          c.source_url AS source_url,
          c.source_checked_at AS source_checked_at
        FROM ai_model_capabilities c
        JOIN models m
          ON m.id = c.model_id
      `
    )
    .all();

  assert(rows.length > 0, "no capability rows");

  for (const row of rows) {
    assert(
      typeof row.source_url === "string" && row.source_url.startsWith("https://"),
      `${row.model_name} has no https source_url: ${row.source_url}`
    );
    assert(
      typeof row.source_checked_at === "string" && row.source_checked_at.length > 0,
      `${row.model_name} has no source_checked_at`
    );
  }
});

check("8. no pricing row stores zero, and DeepSeek prices nothing", () => {
  const rows = getDb()
    .prepare(
      `
        SELECT
          model,
          input_per_million,
          output_per_million,
          cached_per_million,
          reasoning_per_million
        FROM pricing_versions
      `
    )
    .all();

  assert(rows.length > 0, "no pricing rows seeded");

  for (const row of rows) {
    for (const column of [
      "input_per_million",
      "output_per_million",
      "cached_per_million",
      "reasoning_per_million"
    ]) {
      const value = Number(row[column]);

      assert(
        value > 0,
        `${row.model} ${column} is ${value}; a zero rate would mean "unknown" was written as free`
      );
    }
  }

  assertEqual(
    countRows(
      "pricing_versions",
      "WHERE provider_id = 'provider_deepseek'"
    ),
    0,
    "DeepSeek prices are time-banded and must not be seeded as a single rate"
  );

  const deepseekModels = getDb()
    .prepare(
      `SELECT id FROM models WHERE provider_id = 'provider_deepseek'`
    )
    .all();

  for (const model of deepseekModels) {
    const withPricing = registry.getRegistryModel(model.id);

    assert(
      withPricing !== undefined && withPricing.pricing.length === 0,
      `${model.id} must have no pricing row`
    );
  }
});

check("9. pricing resolves by date and stays null when nothing applies", () => {
  const flashId = modelId("Google", "gemini-3.8-flash");
  const flash = registry.getRegistryModel(flashId);

  assert(flash !== undefined, "gemini-3.8-flash not found");
  assertEqual(flash.pricing.length, 2, "gemini-3.8-flash should have two dated rates");

  const intro = registry.resolveRegistryPricing(
    flashId,
    "2026-12-31T12:00:00.000Z"
  );
  assert(intro !== null, "introductory rate should apply before 2027-01-01");
  assertEqual(
    Number(intro.input_per_million),
    0.75,
    "introductory input rate"
  );

  const standard = registry.resolveRegistryPricing(
    flashId,
    "2027-01-01T00:00:00.000Z"
  );
  assert(standard !== null, "standard rate should apply from 2027-01-01");
  assertEqual(
    Number(standard.input_per_million),
    1.5,
    "standard input rate"
  );

  const beforeAnyRate = registry.resolveRegistryPricing(
    flashId,
    "2020-01-01T00:00:00.000Z"
  );
  assertEqual(
    beforeAnyRate,
    null,
    "a date before every seeded rate must resolve to null, not to a zero rate"
  );

  const deepseek = registry.resolveRegistryPricing(
    modelId("DeepSeek", "deepseek-flash"),
    "2026-09-27T00:00:00.000Z"
  );
  assertEqual(
    deepseek,
    null,
    "a model with no seeded rate must resolve to null"
  );
});

check("10. user_ai_tools works and stores no credentials", () => {
  const columns = columnsOf("user_ai_tools");

  for (const forbidden of [
    "key",
    "token",
    "secret",
    "credential",
    "password",
    "auth"
  ]) {
    assert(
      !columns.some((column) => column.includes(forbidden)),
      `user_ai_tools must not have a "${forbidden}" column`
    );
  }

  registry.createUserAiTool({
    id: "smoke-tool-1",
    name: "Smoke CLI",
    category: "cli",
    notes: "smoke test fixture",
    createdAt: "2026-09-27T00:00:00.000Z",
  });
  registry.createUserAiTool({
    id: "smoke-tool-2",
    name: "Smoke IDE Extension",
    category: "ide",
    createdAt: "2026-09-27T00:00:00.000Z",
  });

  const tools = registry.listUserAiTools();

  assertEqual(tools.length, 2, "expected two user tools");

  registry.setUserAiToolStatus(
    "smoke-tool-2",
    "archived",
    "2026-09-27T01:00:00.000Z"
  );

  const archived = registry.listUserAiTools().find(
    (tool) => tool.id === "smoke-tool-2"
  );

  assertEqual(archived.status, "archived", "tool was not archived");
});

check("11. the read layer returns every seeded provider", () => {
  const providers = registry.listAiRegistry();

  assertEqual(providers.length, 4, "expected four providers");

  const totalModels = providers.reduce(
    (total, provider) => total + provider.models.length,
    0
  );
  const expectedModels = AI_REGISTRY_SEED.reduce(
    (total, provider) => total + provider.models.length,
    0
  );

  assertEqual(totalModels, expectedModels, "model count mismatch");

  for (const provider of providers) {
    for (const model of provider.models) {
      assert(
        model.capabilities !== null,
        `${model.id} has no capability row`
      );
    }
  }
});

check("12. smoke test is fully isolated from the production and project databases", () => {
  const normalized = path.normalize(TEMP_DIR);

  if (!dbPath.startsWith(normalized)) {
    throw new Error(`dbPath ${dbPath} is not under the temp dir ${TEMP_DIR}`);
  }

  const after = snapshotProductionFiles();

  if (JSON.stringify(after) !== JSON.stringify(productionFileSnapshot)) {
    throw new Error("production database files changed during the smoke test");
  }
});

console.log("");
console.log(`ts-smoke: ${passed} passed, ${failed} failed`);
console.log(`isolated db: ${dbPath}`);
console.log(`temp dir kept for inspection: ${TEMP_DIR}`);

if (failed > 0) {
  process.exit(1);
}

function snapshotProductionFiles() {
  if (!process.env.APPDATA) {
    return [];
  }

  const dataDir = path.join(
    process.env.APPDATA,
    "AI-Cost-Management",
    "data"
  );

  return ["ai-token-cost-monitor.db", "ai-token-cost-monitor.db-wal", "ai-token-cost-monitor.db-shm"]
    .map((name) => path.join(dataDir, name))
    .map((file) => {
      if (existsSync(file)) {
        const stat = statSync(file);

        return `${file}|${stat.size}|${stat.mtimeMs}`;
      }

      return `${file}|absent`;
    });
}
