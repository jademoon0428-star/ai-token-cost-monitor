/*
 * R3.4-C1 Nominal pricing unification smoke test.
 *
 * Verifies that the task-AI-options planner prices a model the user
 * owns as an active registered resource with the exact same
 * resolution semantics as the combination plans (R3.4-B3), while a
 * plain registry model keeps its registry pricing.
 *
 * Runs entirely against an isolated, freshly-created temp database
 * (NODE_ENV=development + chdir to a temp dir BEFORE the library
 * modules are loaded), so neither data/ai-token-cost-monitor.db nor
 * %APPDATA%\AI-Cost-Management is ever opened for writing. The real
 * database's sha256 and the production data dir files are sampled
 * before and after and compared.
 *
 * The oracle is the same estimator the planner uses
 * (cost-estimator.estimatePlannerCost) fed with the exact card a
 * resolver should have produced, so a shared bug between the resolver
 * and the smoke cannot pass a test by agreeing with each other.
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

function sha256Of(file) {
  if (!existsSync(file)) {
    return "absent";
  }

  return createHash("sha256")
    .update(readFileSync(file))
    .digest("hex");
}

const realProjectDbBefore = sha256Of(PROJECT_LOCAL_DB);

function snapshotProductionDatabase() {
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

const productionDatabaseBefore =
  snapshotProductionDatabase();

const TEMP_DIR = mkdtempSync(
  path.join(tmpdir(), "r3-4-c1-pricing-unify-")
);

process.env.NODE_ENV = "development";
process.chdir(TEMP_DIR);

const { getDb } = await import("../lib/db.ts");
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
const { estimatePlannerCost } = await import(
  "../lib/planner/cost-estimator.ts"
);
const {
  resolveRegistryPricing,
} = await import(
  "../lib/registry/ai-registry-repository.ts"
);

let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    failures.push(`${name}: ${error.message}`);
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
      `${message}: expected ${JSON.stringify(
        expected
      )}, got ${JSON.stringify(actual)}`
    );
  }
}

/* ---------------------------------------------------------------- */
/* Fixtures                                                          */
/* ---------------------------------------------------------------- */

const FIXTURE_TIME = "2026-01-01T00:00:00.000Z";
const CARD_FROM = "2025-01-01T00:00:00.000Z";

const PROVIDER_ID = "provider_c1_smoke";

/*
 * pin:    owned, registry basis + pinned card (in force).
 * resolve:owned, registry basis, no pin -> card in force at the
 *         plan's pricing instant.
 * none:   owned, basis 'none' -> candidate cost stays Unknown even
 *         though a registry card exists.
 * reg:    not owned -> plain registry pricing (unchanged).
 * arch:   owned only by an archived resource -> the archive is
 *         ignored and the registry card applies.
 */
const MODELS = {
  pin: { id: "c1_m_pin", name: "c1-pinned-model" },
  resolve: { id: "c1_m_resolve", name: "c1-resolve-model" },
  none: { id: "c1_m_none", name: "c1-none-model" },
  reg: { id: "c1_m_reg", name: "c1-registry-model" },
  arch: { id: "c1_m_arch", name: "c1-archived-model" },
};

const CARD_PIN = "card_pin";
const CARD_RESOLVE = "card_resolve";
const CARD_NONE = "card_none";
const CARD_REG = "card_reg";
const CARD_ARCH = "card_arch"; // the archived resource's pinned card
const CARD_ARCH_REG = "card_arch_reg"; // the registry card used instead

const RES_PIN = "res_c1_pin";
const RES_RESOLVE = "res_c1_resolve";
const RES_NONE = "res_c1_none";
const RES_ARCHIVED = "res_c1_archived";

const TASK_INPUT_MIN = 1000;
const TASK_INPUT_MAX = 2000;
const TASK_OUTPUT_MIN = 500;
const TASK_OUTPUT_MAX = 1000;

function insertPricing(id, modelName, input, output) {
  getDb()
    .prepare(
      `INSERT INTO pricing_versions
       (id, provider_id, model, currency,
        input_per_million, output_per_million,
        cached_per_million, reasoning_per_million,
        effective_from, effective_to)
       VALUES (?, ?, ?, 'USD', ?, ?, 0, 0, ?, NULL)`
    )
    .run(id, PROVIDER_ID, modelName, input, output, CARD_FROM);
}

initDb();

getDb()
  .prepare(
    `INSERT INTO providers (id, name, created_at) VALUES (?, ?, ?)`
  )
  .run(PROVIDER_ID, "C1 Smoke Provider", FIXTURE_TIME);

for (const model of Object.values(MODELS)) {
  getDb()
    .prepare(
      `INSERT INTO models (id, provider_id, name, created_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(
      model.id,
      PROVIDER_ID,
      model.name,
      FIXTURE_TIME
    );

  getDb()
    .prepare(
      `INSERT INTO ai_model_capabilities
       (model_id, supports_tools, supports_vision,
        supports_reasoning, context_window_tokens,
        max_output_tokens, source_url, source_checked_at,
        created_at, updated_at)
       VALUES (?, 1, 0, 0, 200000, 8192, ?, ?, ?, ?)`
    )
    .run(
      model.id,
      `https://example.invalid/${model.id}`,
      FIXTURE_TIME,
      FIXTURE_TIME,
      FIXTURE_TIME
    );
}

insertPricing(CARD_PIN, MODELS.pin.name, 1, 3);
insertPricing(CARD_RESOLVE, MODELS.resolve.name, 2, 4);
insertPricing(CARD_NONE, MODELS.none.name, 5, 12);
insertPricing(CARD_REG, MODELS.reg.name, 8, 20);
/**
 * The archived resource's pinned card is deliberately expired: it can
 * never win a plain registry lookup, so a price produced from it can
 * only mean the archived resource itself was consulted.
 */
getDb()
  .prepare(
    `INSERT INTO pricing_versions
     (id, provider_id, model, currency,
      input_per_million, output_per_million,
      cached_per_million, reasoning_per_million,
      effective_from, effective_to)
     VALUES (?, ?, ?, 'USD', ?, ?, 0, 0, ?, ?)`
  )
  .run(
    CARD_ARCH,
    PROVIDER_ID,
    MODELS.arch.name,
    30,
    60,
    "2024-01-01T00:00:00.000Z",
    "2024-12-31T00:00:00.000Z"
  );
insertPricing(CARD_ARCH_REG, MODELS.arch.name, 3, 6);

aiResourceRepository.createAiResource({
  id: RES_PIN,
  name: "Pinned access",
  modelId: MODELS.pin.id,
  accessMethod: "pay_as_you_go",
  pricingBasisKind: "registry",
  pricingVersionId: CARD_PIN,
  createdAt: FIXTURE_TIME,
});

aiResourceRepository.createAiResource({
  id: RES_RESOLVE,
  name: "Resolved access",
  modelId: MODELS.resolve.id,
  accessMethod: "pay_as_you_go",
  pricingBasisKind: "registry",
  createdAt: FIXTURE_TIME,
});

aiResourceRepository.createAiResource({
  id: RES_NONE,
  name: "No-basis access",
  modelId: MODELS.none.id,
  accessMethod: "pay_as_you_go",
  pricingBasisKind: "none",
  createdAt: FIXTURE_TIME,
});

aiResourceRepository.createAiResource({
  id: RES_ARCHIVED,
  name: "Archived access (must be ignored)",
  modelId: MODELS.arch.id,
  accessMethod: "pay_as_you_go",
  pricingBasisKind: "registry",
  pricingVersionId: CARD_ARCH,
  createdAt: FIXTURE_TIME,
});
aiResourceRepository.archiveAiResource(RES_ARCHIVED, FIXTURE_TIME);

const PROJECT_ID = plannerService.createProject({
  name: "C1 Smoke Project",
}).id;

const PLAN_ID = plannerService.createProjectPlan({
  projectId: PROJECT_ID,
  strategy: "balanced",
  summary: "strategy plan under test",
}).id;

const TASK_ID = plannerService.createProjectTask({
  planId: PLAN_ID,
  name: "Unify pricing",
  category: "coding",
  complexity: "medium",
  requiredCapabilities: JSON.stringify([]),
  estimatedInputTokensMin: TASK_INPUT_MIN,
  estimatedInputTokensMax: TASK_INPUT_MAX,
  estimatedOutputTokensMin: TASK_OUTPUT_MIN,
  estimatedOutputTokensMax: TASK_OUTPUT_MAX,
}).id;

/*
 * The pricing instant of the strategy plan is its own created_at
 * (strategy plans carry no pricing_basis_at). It is also the instant
 * given to the combination generation below, so both planner entries
 * judge the same rate card.
 */
const PRICING_INSTANT = plannerRepository.getProjectPlan(
  PLAN_ID
).created_at;

/* ---------------------------------------------------------------- */
/* Helpers                                                           */
/* ---------------------------------------------------------------- */

function priced(
  card,
  cardId,
  modelId,
  at
) {
  return estimatePlannerCost({
    task: {
      estimatedInputTokensMin: TASK_INPUT_MIN,
      estimatedInputTokensMax: TASK_INPUT_MAX,
      estimatedOutputTokensMin: TASK_OUTPUT_MIN,
      estimatedOutputTokensMax: TASK_OUTPUT_MAX,
    },
    pricing: {
      id: cardId,
      currency: card.currency,
      inputPerMillion: card.input_per_million,
      outputPerMillion: card.output_per_million,
      effectiveFrom: card.effective_from,
      effectiveTo: card.effective_to,
    },
    planCreatedAt: at,
    modelId,
  });
}

function cardById(id) {
  const row = getDb()
    .prepare(
      `SELECT id, currency, input_per_million,
              output_per_million, effective_from, effective_to
       FROM pricing_versions WHERE id = ?`
    )
    .get(id);

  if (row === undefined) {
    throw new Error(`no pricing card ${id}`);
  }

  return row;
}

const generatedOptions = plannerService.generateProjectTaskAiOptions(
  TASK_ID
);

function optionFor(modelId) {
  const option = generatedOptions.find(
    (entry) => entry.model_id === modelId
  );

  if (option === undefined) {
    throw new Error(`no ai-option candidate for ${modelId}`);
  }

  return option;
}

const combinationResult = generateProjectPlanCombinations(
  PROJECT_ID,
  {
    now: PRICING_INSTANT,
  }
);

function combinationPlans() {
  return combinationResult.plans.map((result) =>
    planByVersion(result.version)
  );
}

function combinationAssignments() {
  return combinationPlans().flatMap((plan) =>
    plannerRepository.listPlanResourceAssignments(
      plan.id
    )
  );
}

function planByVersion(version) {
  const plan = plannerRepository
    .listProjectPlans(PROJECT_ID)
    .find((entry) => entry.version === version);

  if (!plan) {
    throw new Error(`no plan with version ${version}`);
  }

  return plan;
}

function assignmentForResource(resourceId) {
  return combinationAssignments().find(
    (row) => row.ai_resource_id === resourceId
  );
}

/* ---------------------------------------------------------------- */
/* A. Registry + pinned                                              */
/* ---------------------------------------------------------------- */

check("A1. pinned registered resource prices the pinned card", () => {
  const option = optionFor(MODELS.pin.id);
  const expected = priced(
    cardById(CARD_PIN),
    CARD_PIN,
    MODELS.pin.id,
    PRICING_INSTANT
  );

  assertEqual(
    option.cost_min_micros,
    expected.costMinMicros,
    "pinned cost_min_micros"
  );
  assertEqual(
    option.cost_max_micros,
    expected.costMaxMicros,
    "pinned cost_max_micros"
  );
  assertEqual(
    option.cost_currency,
    expected.currency,
    "pinned cost_currency"
  );
});

check("A2. the pinned card id is named in the option's pricing basis", () => {
  const option = optionFor(MODELS.pin.id);

  assert(
    option.pricing_basis.includes(`registry pricing id=${CARD_PIN}`),
    `pricingBasis names the pinned card, got ${option.pricing_basis}`
  );
});

/* ---------------------------------------------------------------- */
/* B. Registry + no pin                                              */
/* ---------------------------------------------------------------- */

check("B1. a no-pin registered resource prices the card in force at the plan instant", () => {
  const option = optionFor(MODELS.resolve.id);
  const card = resolveRegistryPricing(
    MODELS.resolve.id,
    PRICING_INSTANT
  );

  assert(card !== null, "a card is in force at the instant");

  const expected = priced(
    card,
    card.id,
    MODELS.resolve.id,
    PRICING_INSTANT
  );

  assertEqual(
    option.cost_min_micros,
    expected.costMinMicros,
    "resolved cost_min_micros"
  );
  assertEqual(
    option.cost_max_micros,
    expected.costMaxMicros,
    "resolved cost_max_micros"
  );
  assertEqual(
    option.cost_currency,
    expected.currency,
    "resolved cost_currency"
  );
});

/* ---------------------------------------------------------------- */
/* C. Registration basis 'none'                                      */
/* ---------------------------------------------------------------- */

check("C1. a 'none' registered resource stays Unknown despite a registry card", () => {
  const option = optionFor(MODELS.none.id);

  assertEqual(
    option.cost_min_micros,
    null,
    "cost_min_micros stays Unknown"
  );
  assertEqual(
    option.cost_max_micros,
    null,
    "cost_max_micros stays Unknown"
  );
  assertEqual(
    option.cost_currency,
    null,
    "cost_currency stays null"
  );
});

/* ---------------------------------------------------------------- */
/* D. Registry model behaves as before                               */
/* ---------------------------------------------------------------- */

check("D1. a non-owned registry model keeps its registry pricing", () => {
  const option = optionFor(MODELS.reg.id);
  const expected = priced(
    cardById(CARD_REG),
    CARD_REG,
    MODELS.reg.id,
    PRICING_INSTANT
  );

  assertEqual(
    option.cost_min_micros,
    expected.costMinMicros,
    "registry cost_min_micros"
  );
  assertEqual(
    option.cost_max_micros,
    expected.costMaxMicros,
    "registry cost_max_micros"
  );
});

check("D2. an archived resource changes nothing", () => {
  const option = optionFor(MODELS.arch.id);

  assertEqual(
    option.cost_min_micros,
    priced(
      cardById(CARD_ARCH_REG),
      CARD_ARCH_REG,
      MODELS.arch.id,
      PRICING_INSTANT
    ).costMinMicros,
    "archived model uses the registry card, not the archived pin"
  );
  assert(
    option.pricing_basis.includes(
      `registry pricing id=${CARD_ARCH_REG}`
    ),
    `the registry card is named, got ${option.pricing_basis}`
  );
  assert(
    !option.pricing_basis.includes(
      `registry pricing id=${CARD_ARCH};`
    ),
    `the archived pin must not leak, got ${option.pricing_basis}`
  );
});

/* ---------------------------------------------------------------- */
/* E. Same resource, both planner entries agree                      */
/* ---------------------------------------------------------------- */

check("E1. the pinned resource resolves the same card in a combination plan", () => {
  const assignment = assignmentForResource(RES_PIN);

  assert(
    assignment !== undefined,
    "pinned resource is assigned by some combination plan"
  );
  assert(
    assignment.cost_basis.includes(
      `pinned registry pricing card ${CARD_PIN}`
    ),
    `combination cost_basis names the pinned card, got ${assignment.cost_basis}`
  );
});

check("E2. both entries resolve the no-pin resource at the same instant to the same card", () => {
  const option = optionFor(MODELS.resolve.id);
  const card = resolveRegistryPricing(
    MODELS.resolve.id,
    PRICING_INSTANT
  );

  assert(card !== null, "a card is in force at the instant");

  assert(
    option.pricing_basis.includes(`registry pricing id=${card.id}`),
    `the ai-option names the in-force card ${card.id}, got ${option.pricing_basis}`
  );

  assert(
    option.pricing_basis.includes(
      `resolved_for_plan_created_at=${PRICING_INSTANT}`
    ),
    `the ai-option is priced at the strategy plan's pricing instant`
  );

  for (const plan of combinationPlans()) {
    assertEqual(
      plan.pricing_basis_at,
      PRICING_INSTANT,
      `combination plan v${plan.version} prices at the same instant`
    );
  }
});

/* ---------------------------------------------------------------- */
/* F. verified usage evidence never touches nominal pricing          */
/* ---------------------------------------------------------------- */

check("F1. evidence rows exist and use a wildly different rate", () => {
  getDb()
    .prepare(
      `INSERT INTO usage_records
       (id, provider_id, model_id, timestamp,
        input_tokens, output_tokens, cached_tokens,
        reasoning_tokens, application, project, import_id,
        source, accuracy, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, NULL, NULL, NULL,
               'official_api', 'verified', ?)`
    )
    .run(
      "usage_evidence_pin",
      PROVIDER_ID,
      MODELS.pin.id,
      "2025-06-01T00:00:00.000Z",
      500000,
      100000,
      FIXTURE_TIME
    );

  getDb()
    .prepare(
      `INSERT INTO cost_records
       (id, usage_record_id, import_id,
        input_cost_micros, output_cost_micros,
        cached_cost_micros, reasoning_cost_micros,
        total_cost_micros, currency, pricing_version,
        provenance, created_at)
       VALUES (?, ?, NULL, ?, ?, 0, 0, ?, 'USD',
               'evidence', 'source_reported', ?)`
    )
    .run(
      "cost_evidence_pin",
      "usage_evidence_pin",
      1000000,
      200000,
      1200000,
      FIXTURE_TIME
    );
});

check("F2. regenerating AI options ignores the evidence", () => {
  const again = plannerService.generateProjectTaskAiOptions(
    TASK_ID
  );
  const option = again.find((entry) => entry.model_id === MODELS.pin.id);

  const expected = priced(
    cardById(CARD_PIN),
    CARD_PIN,
    MODELS.pin.id,
    PRICING_INSTANT
  );

  assertEqual(
    option.cost_min_micros,
    expected.costMinMicros,
    "evidence cannot change the pinned cost"
  );
  assert(
    !option.rationale.includes("1,200,000"),
    "evidence figures never reach the rationale"
  );
});

/* ---------------------------------------------------------------- */
/* Vocabulary                                                        */
/* ---------------------------------------------------------------- */

check("no pricing task or resource vocabulary regressed", () => {
  const sql = getDb()
    .prepare(
      `SELECT sql FROM sqlite_master
       WHERE type = 'table'
         AND name = 'ai_resources'`
    )
    .get().sql;

  assert(
    sql.includes("pricing_basis_kind"),
    "pricing_basis_kind column present"
  );
  assert(
    sql.includes("pricing_version_id"),
    "pricing_version_id column present"
  );
});

check("the real databases are never touched", () => {
  assertEqual(
    sha256Of(PROJECT_LOCAL_DB),
    realProjectDbBefore,
    "project-local db sha256 unchanged"
  );
  assertEqual(
    JSON.stringify(snapshotProductionDatabase()),
    JSON.stringify(productionDatabaseBefore),
    "production data dir files unchanged"
  );
});

/* ---------------------------------------------------------------- */

console.log(
  `\nplanner-c1-unify: ${passed} passed, ${failed} failed`
);

if (failed > 0) {
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }

  process.exit(1);
}
