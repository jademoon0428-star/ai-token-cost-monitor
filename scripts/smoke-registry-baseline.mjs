/*
 * C-group smoke for ensureAiRegistryBaseline() and its only caller,
 * instrumentation.ts's register().
 *
 * The baseline is a startup write, so it is the one planner-adjacent
 * write path that never appears in the request lifecycle. This smoke
 * pins down exactly when it writes, what it is allowed to overwrite,
 * and that it never runs anywhere near the real database:
 *
 *  - a runtime that is not the Node server never writes,
 *  - the production build phase never writes,
 *  - an empty temp database gets the full baseline once,
 *  - a second call in the same process writes nothing (memo),
 *  - existing models and pricing rows survive a baseline run
 *    (INSERT OR IGNORE), while missing capability rows are built,
 *  - capability rows are refreshed from the manifest when a baseline
 *    run happens (the ON CONFLICT DO UPDATE branch), which is the
 *    current behaviour and the only row-overwriting the baseline does,
 *  - instrumentation register() is wired to the same call and adds no
 *    write of its own.
 *
 * Fresh module instances are obtained by importing the repository with
 * a query-string suffix: the module-level baselineChecked memo lives
 * per instance, while lib/db.ts (imported without a suffix) stays
 * shared, so every instance works on the same isolated temp database.
 *
 * Like every other smoke, this runs against an isolated, freshly
 * created temp database (NODE_ENV=development + chdir to a temp dir
 * BEFORE the library modules are loaded), so the user's production
 * database in %APPDATA%\AI-Cost-Management is never opened.
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

const TEMP_DIR = mkdtempSync(
  path.join(tmpdir(), "c-registry-baseline-smoke-")
);

process.env.NODE_ENV = "development";
process.chdir(TEMP_DIR);

const { dbPath, getDb } = await import("../lib/db.ts");
const { initDb } = await import("../lib/schema.ts");

const repositoryUrl = pathToFileURL(
  path.join(
    DIR,
    "..",
    "lib",
    "registry",
    "ai-registry-repository.ts"
  )
).href;

const baseline = await import(repositoryUrl);
const { AI_REGISTRY_SEED } = await import(
  "../lib/registry/ai-registry-seed.ts"
);

const EXPECTED_PROVIDERS = AI_REGISTRY_SEED.length;

const EXPECTED_MODELS = AI_REGISTRY_SEED.reduce(
  (total, provider) => total + provider.models.length,
  0
);

const EXPECTED_PRICING = AI_REGISTRY_SEED.reduce(
  (total, provider) =>
    total +
    provider.models.reduce(
      (sum, model) => sum + model.pricing.length,
      0
    ),
  0
);

const USER_MODEL_ID = "model_smoke_user_owned";
const USER_PRICING_ID = "pricing_smoke_user_owned";

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
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

function countRows(name) {
  return Number(
    getDb()
      .prepare(`SELECT COUNT(*) AS total FROM ${name}`)
      .get().total
  );
}

function counts() {
  return {
    providers: countRows("providers"),
    models: countRows("models"),
    capabilities: countRows("ai_model_capabilities"),
    pricing: countRows("pricing_versions"),
  };
}

function getUserModel() {
  return getDb()
    .prepare(
      `
        SELECT id, provider_id, name, created_at
        FROM models
        WHERE id = ?
      `
    )
    .get(USER_MODEL_ID);
}

function getUserPricing() {
  return getDb()
    .prepare(
      `
        SELECT id, provider_id, model, currency,
               input_per_million, output_per_million,
               cached_per_million, reasoning_per_million,
               effective_from, effective_to
        FROM pricing_versions
        WHERE id = ?
      `
    )
    .get(USER_PRICING_ID);
}

function insertUserFixtures() {
  const providerId = baseline.getProviderId("OpenAI");

  getDb()
    .prepare(
      `
        INSERT INTO models (id, provider_id, name, created_at)
        VALUES (?, ?, ?, ?)
      `
    )
    .run(
      USER_MODEL_ID,
      providerId,
      "Smoke User Owned Model",
      "2020-01-01T00:00:00.000Z"
    );

  getDb()
    .prepare(
      `
        INSERT INTO pricing_versions
        (id, provider_id, model, currency, input_per_million,
         output_per_million, cached_per_million, reasoning_per_million,
         effective_from, effective_to)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      USER_PRICING_ID,
      providerId,
      "smoke-user-owned-model",
      "USD",
      123456,
      654321,
      111222,
      333444,
      "2020-01-01T00:00:00.000Z",
      null
    );
}

function capabilityRow(modelId) {
  return getDb()
    .prepare(
      `
        SELECT model_id, supports_tools, supports_vision,
               supports_reasoning, context_window_tokens,
               max_output_tokens, source_url, source_checked_at
        FROM ai_model_capabilities
        WHERE model_id = ?
      `
    )
    .get(modelId);
}

delete process.env.NEXT_RUNTIME;
delete process.env.NEXT_PHASE;

initDb();

await check("1. a runtime that is not the Node server never writes", () => {
  assertEqual(
    countRows("models"),
    0,
    "the temp database must start empty"
  );
  assertEqual(
    countRows("ai_model_capabilities"),
    0,
    "the temp database must start empty"
  );
  assertEqual(
    countRows("pricing_versions"),
    0,
    "the temp database must start empty"
  );

  const result = baseline.ensureAiRegistryBaseline();

  assertEqual(
    result.checked,
    false,
    "outside the nodejs runtime nothing may be checked"
  );
  assertEqual(
    result.seeded,
    false,
    "outside the nodejs runtime nothing may be seeded"
  );

  const after = counts();

  assertEqual(after.providers, 0, "providers were written");
  assertEqual(after.models, 0, "models were written");
  assertEqual(
    after.capabilities,
    0,
    "capabilities were written"
  );
  assertEqual(after.pricing, 0, "pricing was written");
});

await check(
  "2. the production build phase never writes to the database",
  () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.NEXT_PHASE = "phase-production-build";

    const result = baseline.ensureAiRegistryBaseline();

    assertEqual(
      result.checked,
      false,
      "a build must not check the baseline"
    );
    assertEqual(
      result.seeded,
      false,
      "a build must not seed the baseline"
    );

    const after = counts();

    assertEqual(after.providers, 0, "a build wrote providers");
    assertEqual(after.models, 0, "a build wrote models");
    assertEqual(
      after.capabilities,
      0,
      "a build wrote capabilities"
    );
    assertEqual(after.pricing, 0, "a build wrote pricing");
  }
);

await check(
  "3. an empty temp database gets the complete baseline",
  async () => {
    delete process.env.NEXT_PHASE;

    const result = baseline.ensureAiRegistryBaseline();

    assertEqual(
      result.checked,
      true,
      "the baseline was not checked"
    );
    assertEqual(
      result.seeded,
      true,
      "an empty database must be seeded"
    );

    const after = counts();

    assertEqual(
      after.providers,
      EXPECTED_PROVIDERS,
      "provider count"
    );
    assertEqual(after.models, EXPECTED_MODELS, "model count");
    assertEqual(
      after.capabilities,
      EXPECTED_MODELS,
      "capability count must match the manifest models"
    );
    assertEqual(
      after.pricing,
      EXPECTED_PRICING,
      "pricing count"
    );

    assert(
      EXPECTED_PRICING > 0,
      "the manifest must provide at least one unconditional rate"
    );

    const instrumentation = await import("../instrumentation.ts");

    assert(
      typeof instrumentation.register === "function",
      "instrumentation.ts must export register()"
    );
  }
);

let firstSeededCounts;

await check(
  "4. a second call in the same process writes nothing",
  () => {
    firstSeededCounts = counts();

    const result = baseline.ensureAiRegistryBaseline();

    assertEqual(
      result.checked,
      true,
      "the memo must report the baseline as already checked"
    );
    assertEqual(
      result.seeded,
      false,
      "a second call must not seed again"
    );

    assertEqual(
      JSON.stringify(counts()),
      JSON.stringify(firstSeededCounts),
      "row counts changed on the second call"
    );
  }
);

await check(
  "5. instrumentation register() reaches the baseline and adds no write of its own",
  async () => {
    const before = counts();
    const { register: serverStartup } = await import(
      "../instrumentation.ts"
    );

    await serverStartup();

    assertEqual(
      JSON.stringify(counts()),
      JSON.stringify(before),
      "register() wrote rows of its own"
    );
  }
);

let userModelBefore;
let userPricingBefore;

await check(
  "6. a baseline run never overwrites existing model or pricing rows, and builds the missing capability rows",
  async () => {
    insertUserFixtures();

    getDb()
      .prepare("DELETE FROM ai_model_capabilities")
      .run();

    userModelBefore = getUserModel();
    userPricingBefore = getUserPricing();

    assert(userModelBefore !== undefined, "user model fixture missing");
    assert(
      userPricingBefore !== undefined,
      "user pricing fixture missing"
    );

    const pre = counts();

    assertEqual(
      pre.models,
      EXPECTED_MODELS + 1,
      "pre-state model count"
    );
    assertEqual(
      pre.pricing,
      EXPECTED_PRICING + 1,
      "pre-state pricing count"
    );
    assertEqual(
      pre.capabilities,
      0,
      "capabilities must be empty so the sentinel fails"
    );

    const freshInstance = await import(
      `${repositoryUrl}?fresh=1`
    );

    assert(
      freshInstance.ensureAiRegistryBaseline !==
        baseline.ensureAiRegistryBaseline,
      "the query suffix must produce a separate module instance"
    );

    const result = freshInstance.ensureAiRegistryBaseline();

    assertEqual(
      result.seeded,
      true,
      "a database with no capability rows must be seeded again"
    );

    const userModelAfter = getUserModel();
    const userPricingAfter = getUserPricing();

    assert(
      userModelAfter !== undefined,
      "the user model row was deleted by the baseline"
    );
    assertEqual(
      userModelAfter.name,
      "Smoke User Owned Model",
      "the user model row was overwritten"
    );
    assertEqual(
      userModelAfter.provider_id,
      userModelBefore.provider_id,
      "the user model provider was overwritten"
    );
    assertEqual(
      userModelAfter.created_at,
      userModelBefore.created_at,
      "the user model timestamp was overwritten"
    );

    assert(
      userPricingAfter !== undefined,
      "the user pricing row was deleted by the baseline"
    );
    assertEqual(
      userPricingAfter.input_per_million,
      userPricingBefore.input_per_million,
      "the user input rate was overwritten"
    );
    assertEqual(
      userPricingAfter.output_per_million,
      userPricingBefore.output_per_million,
      "the user output rate was overwritten"
    );
    assertEqual(
      userPricingAfter.cached_per_million,
      userPricingBefore.cached_per_million,
      "the user cached rate was overwritten"
    );
    assertEqual(
      userPricingAfter.reasoning_per_million,
      userPricingBefore.reasoning_per_million,
      "the user reasoning rate was overwritten"
    );
    assertEqual(
      userPricingAfter.effective_from,
      userPricingBefore.effective_from,
      "the user pricing window was overwritten"
    );

    const after = counts();

    assertEqual(
      after.models,
      EXPECTED_MODELS + 1,
      "manifest models must be added without duplicating the user row"
    );
    assertEqual(
      after.capabilities,
      EXPECTED_MODELS,
      "capability rows must be rebuilt for the manifest models"
    );
    assertEqual(
      after.pricing,
      EXPECTED_PRICING + 1,
      "manifest pricing must be restored without duplicating the user row"
    );

    assert(
      capabilityRow(USER_MODEL_ID) === undefined,
      "the baseline must not create capability rows for models it does not own"
    );
  }
);

await check(
  "7. capability rows are refreshed from the manifest when a baseline run happens",
  () => {
    const victim = getDb()
      .prepare(
        `
          SELECT model_id, supports_tools, context_window_tokens
          FROM ai_model_capabilities
          ORDER BY model_id
          LIMIT 1
        `
      )
      .get();

    assert(
      victim !== undefined,
      "no capability row to tamper with"
    );

    const expectedTools = victim.supports_tools;
    const expectedContext = victim.context_window_tokens;
    const tamperedTools =
      victim.supports_tools === 1 ? 0 : 1;
    const tamperedContext =
      victim.context_window_tokens === 999 ? 123456 : 999;

    getDb()
      .prepare(
        `
          UPDATE ai_model_capabilities
          SET supports_tools = ?, context_window_tokens = ?
          WHERE model_id = ?
        `
      )
      .run(tamperedTools, tamperedContext, victim.model_id);

    getDb()
      .prepare("DELETE FROM pricing_versions")
      .run();

    assertEqual(
      countRows("pricing_versions"),
      0,
      "pricing must be empty so the sentinel fails"
    );
    assertEqual(
      capabilityRow(victim.model_id).supports_tools,
      tamperedTools,
      "the capability row was not tampered with"
    );

    return (async () => {
      const freshInstance = await import(
        `${repositoryUrl}?fresh=2`
      );

      const result =
        freshInstance.ensureAiRegistryBaseline();

      assertEqual(
        result.seeded,
        true,
        "a database with no pricing rows must be seeded again"
      );

      const restored = capabilityRow(victim.model_id);

      assertEqual(
        restored.supports_tools,
        expectedTools,
        "the baseline must refresh capability rows from the manifest"
      );
      assertEqual(
        restored.context_window_tokens,
        expectedContext,
        "the baseline must refresh the context window from the manifest"
      );

      const userModel = getUserModel();

      assert(userModel !== undefined, "user model row is gone");
      assertEqual(
        userModel.name,
        "Smoke User Owned Model",
        "the user model row was overwritten on the second run"
      );

      assertEqual(
        getUserPricing(),
        undefined,
        "the baseline must only write manifest pricing rows, never resurrect a deleted user row"
      );

      const after = counts();

      assertEqual(
        after.pricing,
        EXPECTED_PRICING,
        "manifest pricing restored"
      );
      assertEqual(
        after.models,
        EXPECTED_MODELS + 1,
        "model rows must not duplicate"
      );
    })();
  }
);

await check(
  "8. the smoke runs against an isolated temp database only",
  () => {
    const expected = path.join(
      TEMP_DIR,
      "data",
      "ai-token-cost-monitor.db"
    );

    assertEqual(
      path.normalize(dbPath),
      path.normalize(expected),
      "dbPath must be the temp database"
    );

    if (!path.normalize(dbPath).startsWith(path.normalize(TEMP_DIR))) {
      throw new Error(
        `dbPath ${dbPath} is not under the temp dir ${TEMP_DIR}`
      );
    }

    assertEqual(
      path.normalize(process.cwd()),
      path.normalize(TEMP_DIR),
      "the process must run inside the temp dir"
    );

    const after = snapshotProductionFiles();

    if (
      JSON.stringify(after) !==
      JSON.stringify(productionFileSnapshot)
    ) {
      throw new Error(
        "production database files changed during the smoke test"
      );
    }
  }
);

console.log("");
console.log(
  `registry baseline smoke: ${passed} passed, ${failed} failed`
);
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

  return [
    "ai-token-cost-monitor.db",
    "ai-token-cost-monitor.db-wal",
    "ai-token-cost-monitor.db-shm",
  ]
    .map((name) => path.join(dataDir, name))
    .map((file) => {
      if (existsSync(file)) {
        const stat = statSync(file);

        return `${file}|${stat.size}|${stat.mtimeMs}`;
      }

      return `${file}|absent`;
    });
}
