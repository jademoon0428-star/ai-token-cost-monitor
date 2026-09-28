/*
 * R3.4-B2 verified usage evidence smoke test.
 *
 * This smoke drives the READ-ONLY evidence layer described by the
 * approved B2 decisions:
 *
 *   evidence = usage_records.accuracy 'verified' JOINED through
 *   usage_record_id to a cost_records row whose provenance is
 *   'source_reported', grouped at model level and kept in separate
 *   original-currency buckets. It is display context only; it must
 *   never become a nominal price and never feed the planner cost math.
 *
 * Everything runs against an isolated, freshly-created temp database
 * (NODE_ENV=development + chdir BEFORE the library modules load) and
 * the real databases are fingerprinted before and after, exactly like
 * the other planner smokes.
 *
 * The fixtures are literal rows: providers, models, capabilities,
 * pricing_versions, ai_resources and usage_records/cost_records
 * written straight into the temp database. seed:registry is never
 * called.
 *
 * The planner-cost oracle is the pure estimator (estimatePlannerCost)
 * resolved through the same resolveRegistryPricing the rules use.
 * Evidence rows exist for models that DO have registry pricing, so a
 * planned figure can only come from the pricing row if the evidence
 * really is ignored by the cost path.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
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

const PROJECT_LOCAL_DB = path.join(
  process.cwd(),
  "data",
  "ai-token-cost-monitor.db"
);

const sha256Of = (file) =>
  existsSync(file)
    ? createHash("sha256")
        .update(readFileSync(file))
        .digest("hex")
    : "absent";

function snapshotRealDatabases() {
  const dataDirs = [
    path.resolve(DIR, "..", "data"),
  ];

  if (process.env.APPDATA) {
    dataDirs.push(
      path.join(
        process.env.APPDATA,
        "AI-Cost-Management",
        "data"
      )
    );
  }

  const files = [];

  for (const dir of dataDirs) {
    for (const suffix of ["", "-wal", "-shm"]) {
      files.push(
        path.join(
          dir,
          `ai-token-cost-monitor.db${suffix}`
        )
      );
    }
  }

  return files.map((file) => {
    if (existsSync(file)) {
      const stat = statSync(file);

      return `${file}|${stat.size}|${stat.mtimeMs}`;
    }

    return `${file}|absent`;
  });
}

const realProjectDbBefore = sha256Of(PROJECT_LOCAL_DB);
const productionDatabaseBefore = snapshotRealDatabases();

const TEMP_DIR = mkdtempSync(
  path.join(tmpdir(), "r34-b2-evidence-")
);

process.env.NODE_ENV = "development";
process.chdir(TEMP_DIR);

const { getDb, dbPath } = await import("../lib/db.ts");
const { initDb } = await import("../lib/schema.ts");
const plannerRepository = await import(
  "../lib/repositories/planner-repository.ts"
);
const plannerService = await import(
  "../lib/services/planner-service.ts"
);
const aiResourceRepository = await import(
  "../lib/repositories/ai-resource-repository.ts"
);
const { generateProjectPlanCombinations } = await import(
  "../lib/planner/combination-service.ts"
);
const { resolveRegistryPricing } = await import(
  "../lib/registry/ai-registry-repository.ts"
);
const { estimatePlannerCost } = await import(
  "../lib/planner/cost-estimator.ts"
);
const {
  getVerifiedUsageEvidenceByModels,
} = await import(
  "../lib/repositories/usage-repository.ts"
);
const assignmentsRoute = await import(
  "../app/api/planner/plans/[id]/assignments/route.ts"
);

let passed = 0;
let failed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    failures.push(
      `${name}: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );
    console.error(
      `FAIL ${name}: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );
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
      `${message}: expected ${JSON.stringify(
        expected
      )}, got ${JSON.stringify(actual)}`
    );
  }
}

function countRows(table) {
  return Number(
    getDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM ${table}`
      )
      .get().n
  );
}

/* ---------------------------------------------------------------- */
/* Fixtures                                                          */
/* ---------------------------------------------------------------- */

const FIXTURE_TIME = "2026-01-01T00:00:00.000Z";
const NOW_GEN = "2026-09-27T00:00:00.000Z";

const DEEPSEEK_MODEL =
  "provider_deepseek_deepseek_v4_flash";
const NOMINAL_MODEL =
  "provider_nominalco_model_x";
const EXCLUSION_MODEL =
  "provider_nominalco_model_exclusions";
const NO_IMPORT_MODEL =
  "provider_nominalco_model_noimport";
const MULTI_MODEL =
  "provider_multicur_model_m";
const EMPTY_MODEL =
  "provider_nominalco_model_empty";

const PROVIDER_BY_MODEL = {
  [DEEPSEEK_MODEL]: "provider_deepseek",
  [NOMINAL_MODEL]: "provider_nominalco",
  [EXCLUSION_MODEL]: "provider_nominalco",
  [NO_IMPORT_MODEL]: "provider_nominalco",
  [MULTI_MODEL]: "provider_multicur",
  [EMPTY_MODEL]: "provider_nominalco",
};

const AR_DEEPSEEK = "res_deepseek";
const AR_NOMINAL = "res_nominal";
const AR_EMPTY = "res_empty";

initDb();

const now = new Date().toISOString();

getDb()
  .prepare(
    `INSERT INTO providers (id, name, created_at) VALUES (?, ?, ?)`
  )
  .run("provider_deepseek", "DeepSeek", FIXTURE_TIME);
getDb()
  .prepare(
    `INSERT INTO providers (id, name, created_at) VALUES (?, ?, ?)`
  )
  .run(
    "provider_nominalco",
    "NominalCo",
    FIXTURE_TIME
  );
getDb()
  .prepare(
    `INSERT INTO providers (id, name, created_at) VALUES (?, ?, ?)`
  )
  .run(
    "provider_multicur",
    "MultiCurrency",
    FIXTURE_TIME
  );

for (const [modelId, providerId] of Object.entries(
  PROVIDER_BY_MODEL
)) {
  getDb()
    .prepare(
      `INSERT INTO models (id, provider_id, name, created_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(modelId, providerId, modelId, FIXTURE_TIME);

  getDb()
    .prepare(
      `INSERT INTO ai_model_capabilities
       (
         model_id,
         supports_tools,
         supports_vision,
         supports_reasoning,
         context_window_tokens,
         max_output_tokens,
         source_url,
         source_checked_at,
         created_at,
         updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      modelId,
      1,
      0,
      0,
      200000,
      8192,
      `https://example.invalid/${modelId}`,
      FIXTURE_TIME,
      FIXTURE_TIME,
      FIXTURE_TIME
    );
}

/*
 * Only the nominal model has a registry rate (USD). This mirrors the
 * real database exactly: DeepSeek has verified evidence but no
 * pricing_versions row, so its planned cost is Unknown and must stay
 * Unknown even though evidence exists. The DeepSeek resource also
 * carries no pricing basis (pricing_basis_kind 'none'), so B3-1 keeps
 * it unpriced by fact; the nominal resource declares a 'registry'
 * basis so its api-equivalent cost stays real.
 */
getDb()
  .prepare(
    `INSERT INTO pricing_versions
     (
       id,
       provider_id,
       model,
       currency,
       input_per_million,
       output_per_million,
       cached_per_million,
       reasoning_per_million,
       effective_from,
       effective_to
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  .run(
    `pricing_${NOMINAL_MODEL}`,
    "provider_nominalco",
    NOMINAL_MODEL,
    "USD",
    1,
    2,
    0,
    0,
    "2025-01-01T00:00:00.000Z",
    null
  );

function insertUsageAndCost({
  usageId,
  costId,
  modelId,
  timestamp,
  importId,
  input,
  output,
  cached,
  reasoning,
  source,
  accuracy,
  totalMicros,
  currency,
  provenance,
}) {
  getDb()
    .prepare(
      `INSERT INTO usage_records
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
    )
    .run(
      usageId,
      PROVIDER_BY_MODEL[modelId],
      modelId,
      timestamp,
      input,
      output,
      cached,
      reasoning,
      null,
      null,
      importId ?? null,
      source,
      accuracy,
      now
    );

  getDb()
    .prepare(
      `INSERT INTO cost_records
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
    )
    .run(
      costId,
      usageId,
      importId ?? null,
      0,
      0,
      0,
      0,
      totalMicros,
      currency,
      "deepseek-official-export-2026-09-27",
      provenance,
      now
    );
}

/* DeepSeek verified evidence: three records, two import batches. */
insertUsageAndCost({
  usageId: "u_ds_1",
  costId: "c_ds_1",
  modelId: DEEPSEEK_MODEL,
  timestamp: "2026-08-09T00:00:00+08:00",
  importId: "imp_a",
  input: 1000,
  output: 100,
  cached: 800,
  reasoning: 0,
  source: "official_export",
  accuracy: "verified",
  totalMicros: 150000,
  currency: "CNY",
  provenance: "source_reported",
});
insertUsageAndCost({
  usageId: "u_ds_2",
  costId: "c_ds_2",
  modelId: DEEPSEEK_MODEL,
  timestamp: "2026-09-01T00:00:00+08:00",
  importId: "imp_b",
  input: 2000,
  output: 200,
  cached: 1500,
  reasoning: 100,
  source: "official_export",
  accuracy: "verified",
  totalMicros: 300000,
  currency: "CNY",
  provenance: "source_reported",
});
insertUsageAndCost({
  usageId: "u_ds_3",
  costId: "c_ds_3",
  modelId: DEEPSEEK_MODEL,
  timestamp: "2026-09-14T00:00:00+08:00",
  importId: "imp_b",
  input: 3000,
  output: 300,
  cached: 2000,
  reasoning: 0,
  source: "official_export",
  accuracy: "verified",
  totalMicros: 250000,
  currency: "CNY",
  provenance: "source_reported",
});

/*
 * Excluded rows on the DeepSeek model: estimated accuracy and
 * non-source_reported provenance must never leak into the summary.
 */
insertUsageAndCost({
  usageId: "u_ds_x1",
  costId: "c_ds_x1",
  modelId: DEEPSEEK_MODEL,
  timestamp: "2026-09-02T00:00:00+08:00",
  importId: "imp_c",
  input: 10,
  output: 10,
  cached: 0,
  reasoning: 0,
  source: "official_export",
  accuracy: "estimated",
  totalMicros: 500000,
  currency: "CNY",
  provenance: "source_reported",
});
insertUsageAndCost({
  usageId: "u_ds_x2",
  costId: "c_ds_x2",
  modelId: DEEPSEEK_MODEL,
  timestamp: "2026-09-03T00:00:00+08:00",
  importId: "imp_c",
  input: 10,
  output: 10,
  cached: 0,
  reasoning: 0,
  source: "application",
  accuracy: "verified",
  totalMicros: 500000,
  currency: "CNY",
  provenance: "calculated",
});
insertUsageAndCost({
  usageId: "u_ds_x3",
  costId: "c_ds_x3",
  modelId: DEEPSEEK_MODEL,
  timestamp: "2026-09-04T00:00:00+08:00",
  importId: "imp_c",
  input: 10,
  output: 10,
  cached: 0,
  reasoning: 0,
  source: "application",
  accuracy: "verified",
  totalMicros: 500000,
  currency: "CNY",
  provenance: "estimated",
});

/*
 * A model whose ONLY records are excluded rows: it must not appear in
 * the evidence at all.
 */
insertUsageAndCost({
  usageId: "u_ex_1",
  costId: "c_ex_1",
  modelId: EXCLUSION_MODEL,
  timestamp: "2026-09-05T00:00:00.000Z",
  importId: "imp_ex",
  input: 10,
  output: 10,
  cached: 0,
  reasoning: 0,
  source: "official_export",
  accuracy: "estimated",
  totalMicros: 700,
  currency: "USD",
  provenance: "source_reported",
});

/* A verified record with no import_id: exportCount must be null. */
insertUsageAndCost({
  usageId: "u_ni_1",
  costId: "c_ni_1",
  modelId: NO_IMPORT_MODEL,
  timestamp: "2026-09-06T00:00:00.000Z",
  importId: null,
  input: 50,
  output: 5,
  cached: 0,
  reasoning: 0,
  source: "application",
  accuracy: "verified",
  totalMicros: 500,
  currency: "USD",
  provenance: "source_reported",
});

/* The nominal model: verified evidence + a registry rate (USD). */
insertUsageAndCost({
  usageId: "u_nom_1",
  costId: "c_nom_1",
  modelId: NOMINAL_MODEL,
  timestamp: "2026-08-20T00:00:00.000Z",
  importId: "imp_nominal_1",
  input: 500,
  output: 50,
  cached: 0,
  reasoning: 0,
  source: "official_export",
  accuracy: "verified",
  totalMicros: 10000,
  currency: "USD",
  provenance: "source_reported",
});

/* The multi-currency model: CNY and USD must stay in separate buckets. */
insertUsageAndCost({
  usageId: "u_multi_cny",
  costId: "c_multi_cny",
  modelId: MULTI_MODEL,
  timestamp: "2026-09-10T00:00:00.000Z",
  importId: "imp_m1",
  input: 100,
  output: 10,
  cached: 0,
  reasoning: 0,
  source: "official_export",
  accuracy: "verified",
  totalMicros: 100000,
  currency: "CNY",
  provenance: "source_reported",
});
insertUsageAndCost({
  usageId: "u_multi_usd",
  costId: "c_multi_usd",
  modelId: MULTI_MODEL,
  timestamp: "2026-09-11T00:00:00.000Z",
  importId: "imp_m2",
  input: 50,
  output: 5,
  cached: 0,
  reasoning: 0,
  source: "official_export",
  accuracy: "verified",
  totalMicros: 50000,
  currency: "USD",
  provenance: "source_reported",
});

const NOMINAL_PRICING_ROW = resolveRegistryPricing(NOMINAL_MODEL, NOW_GEN);

assert(NOMINAL_PRICING_ROW !== null, "nominal pricing resolves at NOW_GEN");

/*
 * Mirrors the service's toPlannerCostPricing adapter byte for byte, so
 * the oracle feeds the estimator exactly what the rules feed it.
 */
function toPlannerCostPricing(row) {
  if (row === null) {
    return null;
  }

  return {
    id: row.id,
    currency: row.currency,
    inputPerMillion: row.input_per_million,
    outputPerMillion: row.output_per_million,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
  };
}

const NOMINAL_PRICING = toPlannerCostPricing(NOMINAL_PRICING_ROW);

aiResourceRepository.createAiResource({
  id: AR_DEEPSEEK,
  name: "DeepSeek pay-as-you-go",
  modelId: DEEPSEEK_MODEL,
  accessMethod: "pay_as_you_go",
  createdAt: FIXTURE_TIME,
});

aiResourceRepository.createAiResource({
  id: AR_NOMINAL,
  name: "NominalCo pay-as-you-go",
  modelId: NOMINAL_MODEL,
  accessMethod: "pay_as_you_go",
  pricingBasisKind: "registry",
  createdAt: FIXTURE_TIME,
});

aiResourceRepository.createAiResource({
  id: AR_EMPTY,
  name: "Empty model pay-as-you-go",
  modelId: EMPTY_MODEL,
  accessMethod: "pay_as_you_go",
  createdAt: FIXTURE_TIME,
});

/* ---------------------------------------------------------------- */
/* Aggregation (A-I)                                                */
/* ---------------------------------------------------------------- */

const EVIDENCE_KEYS = [
  "providerId",
  "modelId",
  "currency",
  "recordCount",
  "exportCount",
  "firstTimestamp",
  "lastTimestamp",
  "totalCostMicros",
  "inputTokens",
  "outputTokens",
  "cachedTokens",
  "reasoningTokens",
  "sources",
  "provenance",
].sort();

function evidenceOf(byModel, modelId) {
  const buckets = byModel[modelId];

  assert(
    Array.isArray(buckets),
    `model ${modelId} has evidence`
  );

  return buckets;
}

/* A1-A5: the DeepSeek verified rows are counted and the excluded rows are not. */
check("A1. DeepSeek verified evidence counts three records from two imports", () => {
  const byModel = getVerifiedUsageEvidenceByModels([DEEPSEEK_MODEL]);
  const [bucket] = evidenceOf(byModel, DEEPSEEK_MODEL);
  const expectedKeys = EVIDENCE_KEYS;

  assertEqual(byModel[DEEPSEEK_MODEL].length, 1, "one CNY bucket");
  assertEqual(bucket.recordCount, 3, "record count");
  assertEqual(bucket.exportCount, 2, "export count");
  assertEqual(bucket.provenance, "source_reported", "provenance");
  assertEqual(
    bucket.sources.join(","),
    "official_export",
    "usage sources"
  );
  assertEqual(
    Object.keys(bucket).sort().join(","),
    expectedKeys.join(","),
    "evidence has exactly the documented fields"
  );
});

check("A2. estimated accuracy is excluded", () => {
  const byModel = getVerifiedUsageEvidenceByModels([DEEPSEEK_MODEL]);
  const [bucket] = evidenceOf(byModel, DEEPSEEK_MODEL);

  assertEqual(bucket.recordCount, 3, "u_ds_x1 (estimated) not counted");
});

check("A3. non-source_reported provenance is excluded", () => {
  const byModel = getVerifiedUsageEvidenceByModels([DEEPSEEK_MODEL]);
  const [bucket] = evidenceOf(byModel, DEEPSEEK_MODEL);

  assertEqual(
    bucket.recordCount,
    3,
    "calculated/estimated cost provenance not counted"
  );
  assertEqual(
    bucket.totalCostMicros,
    700000,
    "the ¥1.5M excluded rows are not in the total"
  );
});

check("A4. a model with only excluded rows has no evidence at all", () => {
  const byModel = getVerifiedUsageEvidenceByModels([
    EXCLUSION_MODEL,
  ]);

  assertEqual(
    byModel[EXCLUSION_MODEL],
    undefined,
    "exclusion-only model absent"
  );
});

check("A5. models without records are absent from the map", () => {
  const byModel = getVerifiedUsageEvidenceByModels([
    DEEPSEEK_MODEL,
    EMPTY_MODEL,
  ]);

  assertEqual(
    byModel[EMPTY_MODEL],
    undefined,
    "empty model absent"
  );
});

check("B. grouping is per (provider, model, currency) — null provenance never grouped in", () => {
  const byModel = getVerifiedUsageEvidenceByModels([
    DEEPSEEK_MODEL,
    NOMINAL_MODEL,
    MULTI_MODEL,
  ]);

  assertEqual(
    byModel[DEEPSEEK_MODEL][0].currency,
    "CNY",
    "deepseek bucket currency"
  );
  assertEqual(
    byModel[NOMINAL_MODEL][0].currency,
    "USD",
    "nominal bucket currency"
  );
  assertEqual(
    byModel[MULTI_MODEL].length,
    2,
    "multi-currency model has two buckets"
  );
  assertEqual(
    byModel[MULTI_MODEL].map((bucket) => bucket.currency).join(","),
    "CNY,USD",
    "buckets split by original currency"
  );
});

check("C. token totals sum the verified rows only", () => {
  const byModel = getVerifiedUsageEvidenceByModels([DEEPSEEK_MODEL]);
  const [bucket] = evidenceOf(byModel, DEEPSEEK_MODEL);

  assertEqual(bucket.inputTokens, 6000, "input");
  assertEqual(bucket.outputTokens, 600, "output");
  assertEqual(bucket.cachedTokens, 4300, "cached");
  assertEqual(bucket.reasoningTokens, 100, "reasoning");
});

check("D. cost totals match the verified rows", () => {
  const byModel = getVerifiedUsageEvidenceByModels([DEEPSEEK_MODEL]);
  const [bucket] = evidenceOf(byModel, DEEPSEEK_MODEL);

  assertEqual(bucket.totalCostMicros, 700000, "total");
});

check("E. first/last timestamps come from the verified rows", () => {
  const byModel = getVerifiedUsageEvidenceByModels([DEEPSEEK_MODEL]);
  const [bucket] = evidenceOf(byModel, DEEPSEEK_MODEL);

  assertEqual(
    bucket.firstTimestamp,
    "2026-08-09T00:00:00+08:00",
    "first"
  );
  assertEqual(
    bucket.lastTimestamp,
    "2026-09-14T00:00:00+08:00",
    "last"
  );
});

check("F. currencies are preserved, never converted or merged", () => {
  const byModel = getVerifiedUsageEvidenceByModels([
    MULTI_MODEL,
  ]);
  const buckets = evidenceOf(byModel, MULTI_MODEL);

  assertEqual(
    buckets[0].totalCostMicros,
    100000,
    "CNY total untouched"
  );
  assertEqual(
    buckets[1].totalCostMicros,
    50000,
    "USD total untouched"
  );
  assert(
    buckets.every(
      (bucket) => bucket.currency !== "RMB" &&
        bucket.currency !== "0" &&
        bucket.currency.length === 3
    ),
    "no conversion invented a currency"
  );
});

check("G. buckets are never combined across currencies", () => {
  const byModel = getVerifiedUsageEvidenceByModels([
    MULTI_MODEL,
  ]);
  const buckets = evidenceOf(byModel, MULTI_MODEL);

  assertEqual(buckets.length, 2, "two buckets, not one");
  assert(
    buckets.every(
      (bucket) => bucket.totalCostMicros !== 150000
    ),
    "no bucket does a cross-currency sum"
  );
  assertEqual(
    buckets.reduce(
      (sum, bucket) => sum + bucket.totalCostMicros,
      0
    ),
    150000,
    "only the sum of the per-currency totals equals the raw total"
  );
});

check("H. exportCount is null when import_id is not on every record", () => {
  const byModel = getVerifiedUsageEvidenceByModels([
    NO_IMPORT_MODEL,
  ]);
  const [bucket] = evidenceOf(byModel, NO_IMPORT_MODEL);

  assertEqual(bucket.exportCount, null, "export count stays null");
  assertEqual(bucket.recordCount, 1, "record still counted");
});

check("I. an empty model list yields no evidence", () => {
  assertEqual(
    JSON.stringify(getVerifiedUsageEvidenceByModels([])),
    "{}",
    "empty input -> empty map"
  );
});

check("I2. no default/estimated/provenance vocabulary leaks into evidence", () => {
  const byModel = getVerifiedUsageEvidenceByModels([
    DEEPSEEK_MODEL,
    NOMINAL_MODEL,
    NO_IMPORT_MODEL,
    MULTI_MODEL,
  ]);
  const serialized = JSON.stringify(byModel).toLowerCase();
  const forbidden = [
    "per million",
    "per_million",
    "per_token",
    "rate",
    "score",
    "rank",
    "recommend",
    "winner",
    "best",
    "savings",
    "effective_price",
  ];

  for (const word of forbidden) {
    assert(
      !serialized.includes(word),
      `evidence must not contain "${word}"`
    );
  }
});

/* ---------------------------------------------------------------- */
/* Route: evidence is additive, planned cost untouched (J, K, I-R)   */
/* ---------------------------------------------------------------- */

const ROUTE_PROJECT_ID = plannerService.createProject({
  name: "Evidence route project",
}).id;

const ROUTE_PLAN_V1_ID = plannerService.createProjectPlan({
  projectId: ROUTE_PROJECT_ID,
  strategy: "balanced",
  summary: "manual fixture plan",
}).id;

const ROUTE_TASK_ID = plannerService.createProjectTask({
  planId: ROUTE_PLAN_V1_ID,
  name: "Build the widget",
  category: "coding",
  complexity: "medium",
  requiredCapabilities: JSON.stringify(["tools"]),
  estimatedInputTokensMin: 1000,
  estimatedInputTokensMax: 2000,
  estimatedOutputTokensMin: 500,
  estimatedOutputTokensMax: 1000,
}).id;

const NOW_ROUTE = "2026-09-27T00:00:00.000Z";

const expectedNominalCost = estimatePlannerCost({
  task: {
    estimatedInputTokensMin: 1000,
    estimatedInputTokensMax: 2000,
    estimatedOutputTokensMin: 500,
    estimatedOutputTokensMax: 1000,
  },
  pricing: NOMINAL_PRICING,
  planCreatedAt: NOW_ROUTE,
  modelId: NOMINAL_MODEL,
});

const loadAssignmentsRoute = () =>
  assignmentsRoute;

async function getAssignments(planId) {
  const route = loadAssignmentsRoute();
  const request = new Request(
    `http://localhost:3000/api/planner/plans/${planId}/assignments`
  );
  const response = await route.GET(request, {
    params: Promise.resolve({ id: planId }),
  });
  const body = await response.json();

  return { status: response.status, body };
}

function saveOnePlan(plan) {
  plannerRepository.saveCombinationPlans({
    projectId: ROUTE_PROJECT_ID,
    createdAt: NOW_ROUTE,
    plans: [plan],
  });

  return plan.id;
}

const DEEPSEEK_PLAN_ID = saveOnePlan({
  id: "route_plan_deepseek",
  strategy: "existing",
  summary: "deepseek evidence",
  pricingBasisAt: NOW_ROUTE,
  assignments: [
    {
      id: "route_assign_deepseek",
      planId: "route_plan_deepseek",
      projectTaskId: ROUTE_TASK_ID,
      resourceSource: "registered",
      aiResourceId: AR_DEEPSEEK,
      role: "implementer",
      roleSource: "default_from_category",
      sequence: 1,
      fitStatus: "meets",
      createdAt: NOW_ROUTE,
    },
  ],
});

const NOMINAL_PLAN_ID = saveOnePlan({
  id: "route_plan_nominal",
  strategy: "existing",
  summary: "nominal evidence",
  pricingBasisAt: NOW_ROUTE,
  assignments: [
    {
      id: "route_assign_nominal",
      planId: "route_plan_nominal",
      projectTaskId: ROUTE_TASK_ID,
      resourceSource: "registered",
      aiResourceId: AR_NOMINAL,
      role: "implementer",
      roleSource: "default_from_category",
      sequence: 1,
      fitStatus: "meets",
      plannedCostMinMicros:
        expectedNominalCost.costMinMicros,
      plannedCostMaxMicros:
        expectedNominalCost.costMaxMicros,
      plannedCostCurrency:
        expectedNominalCost.currency,
      costBasis:
        "registry pricing id=pricing_provider_nominalco_model_x; basis=registry",
      createdAt: NOW_ROUTE,
    },
  ],
});

const EMPTY_PLAN_ID = saveOnePlan({
  id: "route_plan_empty",
  strategy: "existing",
  summary: "no evidence",
  pricingBasisAt: NOW_ROUTE,
  assignments: [
    {
      id: "route_assign_empty",
      planId: "route_plan_empty",
      projectTaskId: ROUTE_TASK_ID,
      resourceSource: "registered",
      aiResourceId: AR_EMPTY,
      role: "implementer",
      roleSource: "default_from_category",
      sequence: 1,
      fitStatus: "meets",
      createdAt: NOW_ROUTE,
    },
  ],
});

const REGISTRY_PLAN_ID = saveOnePlan({
  id: "route_plan_registry_deepseek",
  strategy: "registry_expanded",
  summary: "registry deepseek evidence",
  pricingBasisAt: NOW_ROUTE,
  assignments: [
    {
      id: "route_assign_registry_deepseek",
      planId: "route_plan_registry_deepseek",
      projectTaskId: ROUTE_TASK_ID,
      resourceSource: "registry",
      registryModelId: DEEPSEEK_MODEL,
      role: "implementer",
      roleSource: "default_from_category",
      sequence: 1,
      fitStatus: "unknown",
      createdAt: NOW_ROUTE,
    },
  ],
});

const routeDeepseek = await getAssignments(DEEPSEEK_PLAN_ID);
const routeNominal = await getAssignments(NOMINAL_PLAN_ID);
const routeEmpty = await getAssignments(EMPTY_PLAN_ID);
const routeRegistry = await getAssignments(REGISTRY_PLAN_ID);

check("J. a DeepSeek assignment keeps Unknown cost and gains evidence", () => {
  assertEqual(routeDeepseek.status, 200, "status");
  assertEqual(routeDeepseek.body.ok, true, "ok");
  assertEqual(routeDeepseek.body.items.length, 1, "one item");

  const item = routeDeepseek.body.items[0];

  assertEqual(item.ai_resource_id, AR_DEEPSEEK, "resource reference");
  assertEqual(
    item.planned_cost_min_micros,
    null,
    "planned cost stays unknown (min)"
  );
  assertEqual(
    item.planned_cost_max_micros,
    null,
    "planned cost stays unknown (max)"
  );
  assertEqual(
    item.planned_cost_currency,
    null,
    "no currency is invented for DeepSeek"
  );

  const [bucket] = item.evidenceSummary;

  assert(
    item.evidenceSummary !== null &&
      Array.isArray(item.evidenceSummary) &&
      bucket !== undefined,
    "evidence is present"
  );
  assertEqual(bucket.modelId, DEEPSEEK_MODEL, "evidence model");
  assertEqual(bucket.currency, "CNY", "CNY evidence keeps its currency");
  assertEqual(bucket.recordCount, 3, "record count");
  assertEqual(bucket.totalCostMicros, 700000, "total micros");
  assertEqual(bucket.exportCount, 2, "export count");
  assertEqual(
    bucket.sources.join("/"),
    "official_export",
    "sources"
  );
  assertEqual(bucket.provenance, "source_reported", "provenance");
});

check("J2. a registry-source DeepSeek assignment resolves to the same evidence", () => {
  assertEqual(routeRegistry.status, 200, "status");
  const item = routeRegistry.body.items[0];

  assertEqual(item.registry_model_id, DEEPSEEK_MODEL, "registry model");
  assertEqual(item.planned_cost_min_micros, null, "cost unknown");
  const [bucket] = item.evidenceSummary;

  assert(
    item.evidenceSummary !== null &&
      bucket !== undefined,
    "evidence present for the registry reference"
  );
  assertEqual(bucket.modelId, DEEPSEEK_MODEL, "evidence model id");
});

check("K. a nominal-priced assignment keeps its planner cost and merely gains evidence", () => {
  assertEqual(routeNominal.status, 200, "status");
  const item = routeNominal.body.items[0];

  assertEqual(
    item.planned_cost_min_micros,
    expectedNominalCost.costMinMicros,
    "planned min unchanged by evidence"
  );
  assertEqual(
    item.planned_cost_max_micros,
    expectedNominalCost.costMaxMicros,
    "planned max unchanged by evidence"
  );
  assertEqual(
    item.planned_cost_currency,
    expectedNominalCost.currency,
    "planned currency unchanged"
  );
  assert(
    item.cost_basis.includes("registry pricing") &&
      !item.cost_basis.includes("evidence"),
    "cost_basis mentions the registry pricing only"
  );

  const [bucket] = item.evidenceSummary;

  assert(
    item.evidenceSummary !== null &&
      bucket !== undefined,
    "evidence is present on the priced model too"
  );
  assertEqual(bucket.modelId, NOMINAL_MODEL, "evidence model");
  assertEqual(bucket.currency, "USD", "USD evidence");
  assertEqual(bucket.recordCount, 1, "nominal record count");
  assertEqual(bucket.totalCostMicros, 10000, "nominal total");
});

check("I-Route. an assignment with no evidence returns evidenceSummary null", () => {
  assertEqual(routeEmpty.status, 200, "status");
  const item = routeEmpty.body.items[0];

  assertEqual(item.ai_resource_id, AR_EMPTY, "resource reference");
  assertEqual(item.planned_cost_min_micros, null, "cost unknown");
  assertEqual(item.evidenceSummary, null, "null, not an empty array");
});

check("route spreads the stored row unchanged and only adds evidenceSummary", () => {
  for (const [planId, response] of [
    [DEEPSEEK_PLAN_ID, routeDeepseek],
    [NOMINAL_PLAN_ID, routeNominal],
    [EMPTY_PLAN_ID, routeEmpty],
    [REGISTRY_PLAN_ID, routeRegistry],
  ]) {
    const stored = plannerRepository.listPlanResourceAssignments(
      planId
    )[0];
    const item = response.body.items[0];

    for (const key of Object.keys(stored)) {
      assertEqual(
        item[key],
        stored[key],
        `${planId}: ${key} is passed through unchanged`
      );
    }
    assert(
      "evidenceSummary" in item,
      `${planId}: evidenceSummary is the one added field`
    );
  }
});

/* ---------------------------------------------------------------- */
/* Combination integration: evidence never touches generated cost    */
/* ---------------------------------------------------------------- */

const PROJECT_ID = plannerService.createProject({
  name: "B2 Evidence Project",
}).id;

const PLAN_V1_ID = plannerService.createProjectPlan({
  projectId: PROJECT_ID,
  strategy: "balanced",
  summary: "manual fixture plan",
}).id;

const TASK_A_ID = plannerService.createProjectTask({
  planId: PLAN_V1_ID,
  name: "Build the widget",
  category: "coding",
  complexity: "medium",
  requiredCapabilities: JSON.stringify(["tools"]),
  estimatedInputTokensMin: 1000,
  estimatedInputTokensMax: 2000,
  estimatedOutputTokensMin: 500,
  estimatedOutputTokensMax: 1000,
}).id;

const generation = generateProjectPlanCombinations(PROJECT_ID, {
  now: NOW_GEN,
});

function pricingBasisAtOfPlan(planId) {
  const plans = plannerRepository.listProjectPlans(PROJECT_ID);
  const plan = plans.find((entry) => entry.id === planId);

  assert(plan !== undefined, `plan ${planId} exists`);

  return plan.pricing_basis_at;
}

function modelIdOfAssignment(row) {
  if (row.resource_source === "registry") {
    return row.registry_model_id;
  }

  const resource = aiResourceRepository.getAiResource(
    row.ai_resource_id
  );

  return resource?.model_id ?? null;
}

function taskTokensOf(taskId) {
  const task = getDb()
    .prepare(
      `SELECT
         estimated_input_tokens_min,
         estimated_input_tokens_max,
         estimated_output_tokens_min,
         estimated_output_tokens_max
       FROM project_tasks
       WHERE id = ?`
    )
    .get(taskId);

  assert(task !== undefined, `task ${taskId} exists`);

  return {
    estimatedInputTokensMin:
      task.estimated_input_tokens_min,
    estimatedInputTokensMax:
      task.estimated_input_tokens_max,
    estimatedOutputTokensMin:
      task.estimated_output_tokens_min,
    estimatedOutputTokensMax:
      task.estimated_output_tokens_max,
  };
}

check("K2. every generated assignment cost equals the pure pricing oracle (evidence ignored)", () => {
  assert(generation.plans.length >= 1, "plans were generated");

  for (const plan of generation.plans) {
    const basisAt = pricingBasisAtOfPlan(plan.id);
    const rows = plannerRepository.listPlanResourceAssignments(
      plan.id
    );

    assert(rows.length >= 1, `plan ${plan.id} has assignments`);

    for (const row of rows) {
      assertEqual(
        row.project_task_id,
        TASK_A_ID,
        `${plan.id}/${row.id} references the source task`
      );

      const modelId = modelIdOfAssignment(row);

      assert(modelId !== null, "assignment model resolves");

      const expected = estimatePlannerCost({
        task: taskTokensOf(row.project_task_id),
        pricing: toPlannerCostPricing(
          resolveRegistryPricing(modelId, basisAt)
        ),
        planCreatedAt: basisAt,
        modelId,
      });

      assertEqual(
        row.planned_cost_min_micros,
        expected.costMinMicros,
        `${plan.id}/${row.id} planned min`
      );
      assertEqual(
        row.planned_cost_max_micros,
        expected.costMaxMicros,
        `${plan.id}/${row.id} planned max`
      );
      assertEqual(
        row.planned_cost_currency,
        expected.currency,
        `${plan.id}/${row.id} planned currency`
      );
    }
  }
});

check("L. evidence queries never write a single row", () => {
  const usageBefore = countRows("usage_records");
  const costBefore = countRows("cost_records");

  getVerifiedUsageEvidenceByModels([
    DEEPSEEK_MODEL,
    NOMINAL_MODEL,
    MULTI_MODEL,
    EMPTY_MODEL,
  ]);
  getVerifiedUsageEvidenceByModels([]);

  assertEqual(
    countRows("usage_records"),
    usageBefore,
    "usage_records unchanged"
  );
  assertEqual(
    countRows("cost_records"),
    costBefore,
    "cost_records unchanged"
  );
  assertEqual(countRows("import_logs"), 0, "no import rows");
  assertEqual(
    countRows("plan_resource_assignments"),
    4 +
      generation.plans.reduce(
        (sum, plan) =>
          sum + plan.assignmentCount,
        0
      ),
    "only the fixture plans and the generated batch"
  );
});

check("L2. the core tables carry no evidence-related schema change", () => {
  const usageColumns = getDb()
    .prepare(`PRAGMA table_info(usage_records)`)
    .all()
    .map((column) => column.name);

  const costColumns = getDb()
    .prepare(`PRAGMA table_info(cost_records)`)
    .all()
    .map((column) => column.name);

  assertEqual(usageColumns.length, 14, "usage_records stays 14 columns");
  assertEqual(costColumns.length, 12, "cost_records stays 12 columns");
  assert(
    !usageColumns.some((column) => column.startsWith("evidence")),
    "no evidence column on usage_records"
  );
  assert(
    !costColumns.some((column) => column.startsWith("evidence")),
    "no evidence column on cost_records"
  );
});

check("M. the real databases are untouched and match the pinned hash", () => {
  assertEqual(
    sha256Of(PROJECT_LOCAL_DB),
    realProjectDbBefore,
    "project-local db sha256 unchanged"
  );
  assertEqual(
    JSON.stringify(snapshotRealDatabases()),
    JSON.stringify(productionDatabaseBefore),
    "production data dir files unchanged"
  );
  assertEqual(
    sha256Of(PROJECT_LOCAL_DB).toLowerCase(),
    "ba4a9d1ec45db9a7a6df6e7c7b055d029176fc43208bd2d13eeea17bf0d0e509",
    "real dev db sha matches the pinned hash"
  );
});

check("N. the smoke ran against an isolated temporary database", () => {
  assert(
    path.normalize(dbPath).startsWith(
      path.normalize(TEMP_DIR)
    ),
    `dbPath ${dbPath} is not under the temp dir`
  );

  assert(
    countRows("usage_records") > 0,
    "the temp database really was used"
  );
});

console.log(
  `\nplanner-evidence: ${passed} passed, ${failed} failed`
);

if (failed > 0) {
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }

  process.exit(1);
}