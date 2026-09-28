/*
 * R2 Phase 3.3-C2 Planner candidate persistence smoke test.
 *
 * Runs entirely against an isolated, freshly-created temp database
 * (NODE_ENV=development + chdir to a temp dir BEFORE the library
 * modules are loaded), so neither
 * data/ai-token-cost-monitor.db nor %APPDATA%\AI-Cost-Management is
 * ever opened for writing. The real database's size, mtime and
 * existence are sampled before and after the run and compared.
 *
 * The AI Registry is populated with literal fixtures written straight
 * into the temp database. seed:registry is never called, so this test
 * does not depend on whatever the vendor seed currently contains.
 *
 * Two independent oracles are used for the stored numbers:
 *
 *   1. generatePlannerCandidates() is called directly with the same
 *      task row, plan, strategy and registry models the service uses,
 *      and the persisted rows are compared to its output field by
 *      field. That is the contract under test: C2 stores what C1
 *      produced, unchanged.
 *   2. Where the figure is easy to compute by hand (the priced
 *      model), the cost is also asserted against arithmetic derived
 *      only from the fixture rates, so the test cannot pass just
 *      because C1 and C2 are wrong in the same way.
 */
import {
  existsSync,
  mkdtempSync,
  readdirSync,
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

/*
 * Samples the real database files without opening them. Size and
 * mtime are enough to catch an accidental write: SQLite would have to
 * change the file to modify it.
 */
function snapshotRealDatabase() {
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

const realDatabaseBefore = snapshotRealDatabase();

const TEMP_DIR = mkdtempSync(
  path.join(tmpdir(), "r2-c2-planner-persistence-")
);

process.env.NODE_ENV = "development";
process.chdir(TEMP_DIR);

const { dbPath, getDb } = await import("../lib/db.ts");
const { initDb } = await import("../lib/schema.ts");
const plannerRepository = await import(
  "../lib/repositories/planner-repository.ts"
);
const plannerService = await import(
  "../lib/services/planner-service.ts"
);
const { createTask } = await import(
  "../lib/services/task-service.ts"
);
const registry = await import(
  "../lib/registry/ai-registry-repository.ts"
);
const { generatePlannerCandidates } = await import(
  "../lib/planner/candidate-generator.ts"
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

function assertSqliteConstraint(fn, pattern, message) {
  try {
    fn();
  } catch (error) {
    if (
      error instanceof Error &&
      pattern.test(error.message)
    ) {
      return;
    }

    throw new Error(
      `${message}: expected a sqlite constraint error matching ${pattern}, got ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  throw new Error(
    `${message}: expected a sqlite constraint error, call did not throw`
  );
}

function assertServiceError(fn, code, message) {
  try {
    fn();
  } catch (error) {
    if (
      error instanceof plannerService.PlannerServiceError &&
      error.code === code
    ) {
      return;
    }

    throw new Error(
      `${message}: expected PlannerServiceError "${code}", got ${
        error instanceof Error
          ? `${error.constructor.name} ${error.message}`
          : String(error)
      }`
    );
  }

  throw new Error(
    `${message}: expected PlannerServiceError "${code}", call did not throw`
  );
}

/* ---------------------------------------------------------------- */
/* Fixtures                                                          */
/* ---------------------------------------------------------------- */

const FIXTURE_TIME = "2026-01-01T00:00:00.000Z";

/*
 * The plan instant is deliberately in the past, and the priced model
 * carries two rate versions: one in force at the plan instant and a
 * much dearer one that only starts later in 2026. Anything that
 * prices against the wall clock instead of plan.created_at picks the
 * second version and fails the arithmetic assertions below.
 */
const PLAN_CREATED_AT = "2026-01-15T00:00:00.000Z";

const PROVIDER_ID = "provider_c2_smoke";
const PRICED_MODEL_ID = "model_c2_priced";
const PRICED_MODEL_NAME = "c2-priced-model";
const UNPRICED_MODEL_ID = "model_c2_unpriced";
const UNPRICED_MODEL_NAME = "c2-unpriced-model";
const BARE_MODEL_ID = "model_c2_bare";
const BARE_MODEL_NAME = "c2-bare-model";

initDb();

getDb()
  .prepare(
    `INSERT INTO providers (id, name, created_at) VALUES (?, ?, ?)`
  )
  .run(PROVIDER_ID, "C2 Smoke Provider", FIXTURE_TIME);

for (const [id, name] of [
  [PRICED_MODEL_ID, PRICED_MODEL_NAME],
  [UNPRICED_MODEL_ID, UNPRICED_MODEL_NAME],
  [BARE_MODEL_ID, BARE_MODEL_NAME],
]) {
  getDb()
    .prepare(
      `
        INSERT INTO models (id, provider_id, name, created_at)
        VALUES (?, ?, ?, ?)
      `
    )
    .run(id, PROVIDER_ID, name, FIXTURE_TIME);
}

getDb()
  .prepare(
    `
      INSERT INTO ai_model_capabilities
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
  .run(
    PRICED_MODEL_ID,
    1,
    0,
    0,
    200000,
    8192,
    "https://example.invalid/c2-priced",
    FIXTURE_TIME,
    FIXTURE_TIME,
    FIXTURE_TIME
  );

getDb()
  .prepare(
    `
      INSERT INTO ai_model_capabilities
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
  .run(
    UNPRICED_MODEL_ID,
    1,
    0,
    0,
    200000,
    8192,
    "https://example.invalid/c2-unpriced",
    FIXTURE_TIME,
    FIXTURE_TIME,
    FIXTURE_TIME
  );

/*
 * BARE_MODEL_ID deliberately gets no capabilities row and no pricing
 * rows: the registry is allowed to know a model exists while knowing
 * nothing about it, and C2 still has to offer it.
 */

/*
 * Rate in force when the plan was written: 1.00 / 2.00 per million.
 */
getDb()
  .prepare(
    `
      INSERT INTO pricing_versions
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
  .run(
    "pricing_c2_v1",
    PROVIDER_ID,
    PRICED_MODEL_NAME,
    "USD",
    1.0,
    2.0,
    0.0,
    0.0,
    "2025-01-01T00:00:00.000Z",
    "2026-06-01T00:00:00.000Z"
  );

/*
 * A far dearer rate that only becomes effective after the plan was
 * written. It must not be used to price this plan.
 */
getDb()
  .prepare(
    `
      INSERT INTO pricing_versions
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
  .run(
    "pricing_c2_v2",
    PROVIDER_ID,
    PRICED_MODEL_NAME,
    "USD",
    50.0,
    50.0,
    0.0,
    0.0,
    "2026-06-01T00:00:00.000Z",
    null
  );

/*
 * Token bounds chosen so the cost arithmetic is unambiguous:
 * input 1000..2000, output 500..1000 at 1.00 / 2.00 per million
 * gives 2000..4000 micros of USD.
 */
const INPUT_MIN = 1000;
const INPUT_MAX = 2000;
const OUTPUT_MIN = 500;
const OUTPUT_MAX = 1000;
const EXPECTED_COST_MIN_MICROS = 2000;
const EXPECTED_COST_MAX_MICROS = 4000;

const PROJECT_ID = plannerService.createProject({
  name: "C2 Smoke Project",
}).id;

const PLAN_ID = plannerService.createProjectPlan({
  projectId: PROJECT_ID,
  strategy: "balanced",
  summary: "C2 persistence fixture plan",
}).id;

/*
 * createProjectPlan stamps created_at with the wall clock, which is
 * the wrong instant for this test. The plan row is the pricing basis,
 * so the fixture pins it. Rewriting it here also proves the service
 * reads the value from the database rather than from a caller's
 * argument.
 */
getDb()
  .prepare(
    `UPDATE project_plans SET created_at = ? WHERE id = ?`
  )
  .run(PLAN_CREATED_AT, PLAN_ID);

const PLAN_ROW = plannerRepository.getProjectPlan(PLAN_ID);

assertEqual(
  PLAN_ROW.created_at,
  PLAN_CREATED_AT,
  "fixture plan instant"
);

function makeTask(overrides = {}) {
  return plannerService.createProjectTask({
    planId: PLAN_ID,
    name: overrides.name ?? "C2 smoke step",
    category: overrides.category ?? "coding",
    complexity: overrides.complexity ?? "medium",
    requiredCapabilities:
      overrides.requiredCapabilities ??
      JSON.stringify(["tools"]),
    estimatedInputTokensMin: INPUT_MIN,
    estimatedInputTokensMax: INPUT_MAX,
    estimatedOutputTokensMin: OUTPUT_MIN,
    estimatedOutputTokensMax: OUTPUT_MAX,
  });
}

const TASK_ID = makeTask().id;
const SECOND_TASK_ID = makeTask({
  name: "C2 smoke second step",
}).id;

const EXECUTION_TASK_ID = createTask({
  name: "C2 smoke execution task",
}).id;

plannerService.linkProjectTaskToExecutionTask(
  TASK_ID,
  EXECUTION_TASK_ID
);

/* ---------------------------------------------------------------- */
/* Helpers over the temp database                                    */
/* ---------------------------------------------------------------- */

function optionRows(projectTaskId) {
  return getDb()
    .prepare(
      `
        SELECT
          id,
          project_task_id,
          model_id,
          tool_id,
          is_selected,
          cost_min_micros,
          cost_max_micros,
          cost_currency,
          time_min_minutes,
          time_max_minutes,
          fit_status,
          excluded_reason,
          pricing_basis,
          rationale,
          created_at,
          updated_at
        FROM project_task_ai_options
        WHERE project_task_id = ?
      `
    )
    .all(projectTaskId);
}

function countRows(name) {
  return Number(
    getDb()
      .prepare(
        `SELECT COUNT(*) AS total FROM ${name}`
      )
      .get().total
  );
}

function rowFor(projectTaskId, modelId) {
  return optionRows(projectTaskId).find(
    (row) => row.model_id === modelId
  );
}

/*
 * The independent oracle: the candidate set C1 produces for this exact
 * task row, plan instant, strategy and registry snapshot.
 */
function c1CandidatesFor(projectTaskId) {
  const task = plannerRepository.getProjectTask(
    projectTaskId
  );
  const plan = plannerRepository.getProjectPlan(
    task.plan_id
  );
  const models = registry.listAiRegistry().flatMap(
    (provider) => provider.models
  );

  return generatePlannerCandidates({
    task: {
      category: task.category,
      complexity: task.complexity,
      required_capabilities: task.required_capabilities,
      estimated_input_tokens_min:
        task.estimated_input_tokens_min,
      estimated_input_tokens_max:
        task.estimated_input_tokens_max,
      estimated_output_tokens_min:
        task.estimated_output_tokens_min,
      estimated_output_tokens_max:
        task.estimated_output_tokens_max,
    },
    planCreatedAt: plan.created_at,
    strategy: plan.strategy,
    models,
    pricingResolver: (modelId, at) =>
      registry.resolveRegistryPricing(modelId, at),
  });
}

function isKnown(row) {
  return row.cost_min_micros !== null;
}

/* ---------------------------------------------------------------- */
/* 1. First generation                                               */
/* ---------------------------------------------------------------- */

const firstGenerated = plannerService.generateProjectTaskAiOptions(
  TASK_ID
);

check(
  "the service returns the options it just wrote",
  () => {
    assertEqual(
      firstGenerated.length,
      3,
      "returned count"
    );
    assertEqual(
      firstGenerated.every(
        (row) => row.project_task_id === TASK_ID
      ),
      true,
      "every returned row belongs to this task"
    );
  }
);

check(
  "first generation writes one option per registered model",
  () => {
    const written = optionRows(TASK_ID);

    assertEqual(
      written.length,
      3,
      "option count should equal registered model count"
    );

    const modelIds = written
      .map((row) => row.model_id)
      .sort();

    assertEqual(
      JSON.stringify(modelIds),
      JSON.stringify(
        [
          BARE_MODEL_ID,
          PRICED_MODEL_ID,
          UNPRICED_MODEL_ID,
        ].sort()
      ),
      "one row per model, no extras"
    );
  }
);

check("first generation stores no tool binding", () => {
  for (const row of optionRows(TASK_ID)) {
    assertEqual(
      row.tool_id,
      null,
      `tool_id for ${row.model_id} must be null in C2`
    );
  }
});

check(
  "first generation selects nothing",
  () => {
    for (const row of optionRows(TASK_ID)) {
      assertEqual(
        row.is_selected,
        0,
        `is_selected for ${row.model_id} must start at 0`
      );
    }
  }
);

check("every generated id is a fresh uuid", () => {
  const ids = optionRows(TASK_ID).map((row) => row.id);

  assertEqual(
    new Set(ids).size,
    ids.length,
    "option ids should be unique"
  );

  for (const id of ids) {
    assert(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id
      ),
      `option id "${id}" should be a uuid`
    );
  }
});

/* ---------------------------------------------------------------- */
/* 2. Field mapping, against C1 output                              */
/* ---------------------------------------------------------------- */

check(
  "stored cost, time, fit and text match C1 candidate output",
  () => {
    const candidates = c1CandidatesFor(TASK_ID);

    assertEqual(
      candidates.candidates.length,
      3,
      "oracle candidate count"
    );

    for (const candidate of candidates.candidates) {
      const row = rowFor(TASK_ID, candidate.modelId);

      assert(row !== undefined, `missing row for ${candidate.modelId}`);

      assertEqual(
        row.project_task_id,
        TASK_ID,
        "project_task_id"
      );
      assertEqual(row.model_id, candidate.modelId, "model_id");
      assertEqual(row.tool_id, null, "tool_id");
      assertEqual(row.is_selected, 0, "is_selected");
      assertEqual(
        row.cost_min_micros,
        candidate.costMinMicros,
        `cost_min_micros for ${candidate.modelId}`
      );
      assertEqual(
        row.cost_max_micros,
        candidate.costMaxMicros,
        `cost_max_micros for ${candidate.modelId}`
      );
      assertEqual(
        row.cost_currency,
        candidate.costCurrency,
        `cost_currency for ${candidate.modelId}`
      );
      assertEqual(
        row.time_min_minutes,
        candidate.timeMinMinutes,
        `time_min_minutes for ${candidate.modelId}`
      );
      assertEqual(
        row.time_max_minutes,
        candidate.timeMaxMinutes,
        `time_max_minutes for ${candidate.modelId}`
      );
      assertEqual(
        row.fit_status,
        candidate.fitStatus,
        `fit_status for ${candidate.modelId}`
      );
      assertEqual(
        row.pricing_basis,
        candidate.pricingBasis,
        `pricing_basis for ${candidate.modelId}`
      );
      assertEqual(
        row.rationale,
        candidate.rationale,
        `rationale for ${candidate.modelId}`
      );
    }
  }
);

check(
  "excluded_reason is null and never carries fit or strategy prose",
  () => {
    for (const row of optionRows(TASK_ID)) {
      assertEqual(
        row.excluded_reason,
        null,
        `excluded_reason for ${row.model_id} must be null in C2`
      );
    }
  }
);

check(
  "generated rows carry no strategy-only fields",
  () => {
    /*
     * isStrategyRepresentative, strategyResult, strategyBasis and
     * fitReason are presentation details with no column. If a future
     * change folds them into an existing text column the checks above
     * would still pass on the shared fields, so assert here that the
     * rationale column holds C1's rationale and nothing else.
     */
    const candidates = c1CandidatesFor(TASK_ID);

    for (const candidate of candidates.candidates) {
      const row = rowFor(TASK_ID, candidate.modelId);

      assertEqual(
        row.rationale,
        candidate.rationale,
        `rationale must be C1's rationale for ${candidate.modelId}`
      );

      assert(
        !row.rationale.includes("fitReason"),
        "rationale should not contain fitReason"
      );
    }
  }
);

check(
  "created_at and updated_at agree and are valid instants",
  () => {
    for (const row of optionRows(TASK_ID)) {
      assertEqual(
        row.updated_at,
        row.created_at,
        "a freshly written row has not been updated since"
      );

      assert(
        !Number.isNaN(Date.parse(row.created_at)),
        `created_at "${row.created_at}" should parse`
      );
    }
  }
);

/* ---------------------------------------------------------------- */
/* 3. Known vs unknown cost                                         */
/* ---------------------------------------------------------------- */

check(
  "priced model is stored at the rate in force when the plan was written",
  () => {
    const row = rowFor(TASK_ID, PRICED_MODEL_ID);

    assertEqual(
      row.cost_min_micros,
      EXPECTED_COST_MIN_MICROS,
      "cost_min_micros from 1000*1.00 + 500*2.00"
    );
    assertEqual(
      row.cost_max_micros,
      EXPECTED_COST_MAX_MICROS,
      "cost_max_micros from 2000*1.00 + 1000*2.00"
    );
    assertEqual(
      row.cost_currency,
      "USD",
      "currency is passed through, never converted"
    );
  }
);

check(
  "pricing is resolved at plan.created_at, not the wall clock",
  () => {
    const row = rowFor(TASK_ID, PRICED_MODEL_ID);

    assert(
      row.pricing_basis.includes("pricing_c2_v1"),
      `expected the pre-June rate to be used, got "${row.pricing_basis}"`
    );
    assert(
      !row.pricing_basis.includes("pricing_c2_v2"),
      "the later, dearer rate must not be used"
    );
    assert(
      row.pricing_basis.includes(
        `resolved_for_plan_created_at=${PLAN_CREATED_AT}`
      ),
      "pricing basis should name the plan instant"
    );

    /*
     * The v2 rate is 50x higher. If any layer had priced against
     * "now" the stored figure would be roughly 100000 micros, so this
     * inequality is a direct check on the frozen instant.
     */
    assert(
      row.cost_max_micros < 10000,
      `cost_max_micros ${row.cost_max_micros} suggests a later rate was used`
    );
  }
);

check(
  "unpriced model stores three nulls, never zero and never a guess",
  () => {
    for (const modelId of [
      UNPRICED_MODEL_ID,
      BARE_MODEL_ID,
    ]) {
      const row = rowFor(TASK_ID, modelId);

      assertEqual(
        row.cost_min_micros,
        null,
        `cost_min_micros for ${modelId}`
      );
      assertEqual(
        row.cost_max_micros,
        null,
        `cost_max_micros for ${modelId}`
      );
      assertEqual(
        row.cost_currency,
        null,
        `cost_currency for ${modelId}`
      );
    }
  }
);

check(
  "unknown cost never leaks a zero or a currency",
  () => {
    for (const row of optionRows(TASK_ID)) {
      if (isKnown(row)) {
        continue;
      }

      assert(
        row.cost_min_micros !== 0 && row.cost_max_micros !== 0,
        "an unknown cost must be null, not 0"
      );
      assertEqual(
        row.cost_currency,
        null,
        "an unknown cost must not guess a currency"
      );
      assert(
        typeof row.pricing_basis === "string" &&
          row.pricing_basis.startsWith("unknown cost:"),
        `unknown cost should explain itself, got ${JSON.stringify(
          row.pricing_basis
        )}`
      );
    }
  }
);

check(
  "a registered model with nothing known still becomes a candidate",
  () => {
    const row = rowFor(TASK_ID, BARE_MODEL_ID);

    assert(row !== undefined, "bare model should be offered");
    assertEqual(
      row.fit_status,
      "unknown",
      "a model with no capability row cannot be assessed"
    );
  }
);

/* ---------------------------------------------------------------- */
/* 4. Time and fit pass-through                                     */
/* ---------------------------------------------------------------- */

check(
  "time bounds are stored as a sane, non-inverted range",
  () => {
    const candidates = c1CandidatesFor(TASK_ID);

    for (const candidate of candidates.candidates) {
      const row = rowFor(TASK_ID, candidate.modelId);

      if (row.time_min_minutes === null) {
        assertEqual(
          row.time_max_minutes,
          null,
          "an unknown time is null at both ends"
        );
        continue;
      }

      assert(
        row.time_min_minutes >= 0,
        "time_min_minutes must not be negative"
      );
      assert(
        row.time_max_minutes >= row.time_min_minutes,
        "time_max_minutes must not fall below the minimum"
      );
    }
  }
);

check(
  "fit status is drawn from the stored enum",
  () => {
    const allowed = new Set([
      "meets",
      "below_minimum",
      "unknown",
    ]);

    for (const row of optionRows(TASK_ID)) {
      assert(
        allowed.has(row.fit_status),
        `unexpected fit_status "${row.fit_status}"`
      );
    }

    assertEqual(
      rowFor(TASK_ID, PRICED_MODEL_ID).fit_status,
      "meets",
      "the priced model declares tools and the step asked for tools"
    );
  }
);

/* ---------------------------------------------------------------- */
/* 5. Replace, not append                                           */
/* ---------------------------------------------------------------- */

const firstGenerationIds = optionRows(TASK_ID).map(
  (row) => row.id
);

/*
 * The comparable half of the first generation, taken while those rows
 * still exist. Regeneration is expected to reproduce these exact
 * figures under fresh ids.
 */
const firstGenerationFigures = optionRows(TASK_ID)
  .map((row) => ({
    model_id: row.model_id,
    cost_min_micros: row.cost_min_micros,
    cost_max_micros: row.cost_max_micros,
    cost_currency: row.cost_currency,
    time_min_minutes: row.time_min_minutes,
    time_max_minutes: row.time_max_minutes,
    fit_status: row.fit_status,
    pricing_basis: row.pricing_basis,
    rationale: row.rationale,
  }))
  .sort((a, b) => a.model_id.localeCompare(b.model_id));

check(
  "regeneration replaces the set instead of appending to it",
  () => {
    const regenerated = plannerService.generateProjectTaskAiOptions(
      TASK_ID
    );

    assertEqual(
      regenerated.length,
      3,
      "regeneration should not grow the candidate set"
    );
    assertEqual(
      countRows("project_task_ai_options"),
      3,
      "no rows were left behind for this task"
    );
  }
);

check(
  "every old option id is gone after regeneration",
  () => {
    const currentIds = new Set(
      optionRows(TASK_ID).map((row) => row.id)
    );

    for (const oldId of firstGenerationIds) {
      assert(
        !currentIds.has(oldId),
        `stale option "${oldId}" survived regeneration`
      );
    }
  }
);

check(
  "regeneration reproduces the same figures, not new ones",
  () => {
    const after = optionRows(TASK_ID)
      .map((row) => ({
        model_id: row.model_id,
        cost_min_micros: row.cost_min_micros,
        cost_max_micros: row.cost_max_micros,
        cost_currency: row.cost_currency,
        time_min_minutes: row.time_min_minutes,
        time_max_minutes: row.time_max_minutes,
        fit_status: row.fit_status,
        pricing_basis: row.pricing_basis,
        rationale: row.rationale,
      }))
      .sort((a, b) => a.model_id.localeCompare(b.model_id));

    assertEqual(
      JSON.stringify(after),
      JSON.stringify(firstGenerationFigures),
      "regenerating an unchanged plan should reproduce its figures"
    );
  }
);

/* ---------------------------------------------------------------- */
/* 6. Selection is the user's, and regeneration drops it             */
/* ---------------------------------------------------------------- */

check(
  "a manual selection is recorded, and only one at a time",
  () => {
    const target = rowFor(TASK_ID, PRICED_MODEL_ID);
    const other = rowFor(TASK_ID, UNPRICED_MODEL_ID);

    plannerService.selectProjectTaskAiOption(target.id);

    assertEqual(
      rowFor(TASK_ID, PRICED_MODEL_ID).is_selected,
      1,
      "the chosen option is selected"
    );
    assertEqual(
      rowFor(TASK_ID, UNPRICED_MODEL_ID).is_selected,
      0,
      "no other option is selected"
    );

    plannerService.selectProjectTaskAiOption(other.id);

    assertEqual(
      rowFor(TASK_ID, PRICED_MODEL_ID).is_selected,
      0,
      "selecting another option clears the first"
    );
    assertEqual(
      rowFor(TASK_ID, UNPRICED_MODEL_ID).is_selected,
      1,
      "the new choice is selected"
    );

    assertEqual(
      optionRows(TASK_ID).length,
      3,
      "selecting does not change the candidate set"
    );
  }
);

check(
  "regeneration resets every option to unselected",
  () => {
    assertEqual(
      rowFor(TASK_ID, UNPRICED_MODEL_ID).is_selected,
      1,
      "precondition: an option is selected"
    );

    plannerService.generateProjectTaskAiOptions(TASK_ID);

    for (const row of optionRows(TASK_ID)) {
      assertEqual(
        row.is_selected,
        0,
        `is_selected for ${row.model_id} after regeneration`
      );
    }
  }
);

check(
  "regeneration does not resurrect a selected id",
  () => {
    plannerService.selectProjectTaskAiOption(
      rowFor(TASK_ID, PRICED_MODEL_ID).id
    );

    const selectedId = rowFor(TASK_ID, PRICED_MODEL_ID).id;

    plannerService.generateProjectTaskAiOptions(TASK_ID);

    const survivor = getDb()
      .prepare(
        `
          SELECT COUNT(*) AS total
          FROM project_task_ai_options
          WHERE id = ?
        `
      )
      .get(selectedId).total;

    assertEqual(
      Number(survivor),
      0,
      "the previously selected row is replaced, not kept"
    );
  }
);

/* ---------------------------------------------------------------- */
/* 7. Atomicity                                                     */
/* ---------------------------------------------------------------- */

check(
  "a failure part way through a batch leaves the old set intact",
  () => {
    plannerService.generateProjectTaskAiOptions(TASK_ID);

    const before = JSON.stringify(optionRows(TASK_ID));

    assert(
      optionRows(TASK_ID).length > 0,
      "precondition: there is a set to protect"
    );

    /*
     * Injected failure: two options for the same task and model with
     * no tool both map to the same
     * UNIQUE(project_task_id, model_id, COALESCE(tool_id, '')) key, so
     * the second insert fails after the first has already landed and
     * after the delete has already run. Nothing in production code is
     * changed to arrange this, and no test-only hook is added.
     */
    assertSqliteConstraint(
      () =>
        plannerRepository.replaceProjectTaskAiOptions(
          TASK_ID,
          [
            {
              id: "option_c2_batch_ok",
              projectTaskId: TASK_ID,
              modelId: PRICED_MODEL_ID,
              toolId: null,
              isSelected: 0,
              costMinMicros: 1,
              costMaxMicros: 1,
              costCurrency: "USD",
              timeMinMinutes: 1,
              timeMaxMinutes: 1,
              fitStatus: "unknown",
              pricingBasis: "batch ok",
              rationale: "first row lands",
              createdAt: FIXTURE_TIME,
            },
            {
              id: "option_c2_batch_duplicate",
              projectTaskId: TASK_ID,
              modelId: PRICED_MODEL_ID,
              toolId: null,
              isSelected: 0,
              costMinMicros: 2,
              costMaxMicros: 2,
              costCurrency: "USD",
              timeMinMinutes: 2,
              timeMaxMinutes: 2,
              fitStatus: "unknown",
              pricingBasis: "duplicate key",
              rationale: "this row collides",
              createdAt: FIXTURE_TIME,
            },
          ]
        ),
      /UNIQUE|constraint/i,
      "duplicate option key should be refused"
    );

    assertEqual(
      JSON.stringify(optionRows(TASK_ID)),
      before,
      "the previous complete set should be restored byte for byte"
    );
  }
);

check(
  "a rejected batch is refused before any transaction opens",
  () => {
    const before = JSON.stringify(optionRows(TASK_ID));
    let refused = false;

    try {
      plannerRepository.replaceProjectTaskAiOptions(
        TASK_ID,
        [
          {
            id: "option_c2_wrong_task",
            projectTaskId: SECOND_TASK_ID,
            modelId: PRICED_MODEL_ID,
            toolId: null,
            createdAt: FIXTURE_TIME,
          },
        ]
      );
    } catch (error) {
      refused =
        error instanceof Error &&
        error.message.includes(SECOND_TASK_ID);
    }

    assert(
      refused,
      "a batch naming another task should be refused"
    );
    assertEqual(
      JSON.stringify(optionRows(TASK_ID)),
      before,
      "a refused batch must not touch this task"
    );
    assertEqual(
      optionRows(SECOND_TASK_ID).length,
      0,
      "a refused batch must not write to the other task either"
    );
  }
);

check(
  "an unrecognised strategy cannot even be stored",
  () => {
    const before = JSON.stringify(optionRows(TASK_ID));

    /*
     * project_plans.strategy carries a CHECK constraint, so a bogus
     * strategy is refused by the database before the service is ever
     * reached. That is why the service's own strategy check is
     * defence in depth rather than the thing carrying the guarantee.
     */
    assertSqliteConstraint(
      () =>
        getDb()
          .prepare(
            `UPDATE project_plans SET strategy = 'nonsense_strategy' WHERE id = ?`
          )
          .run(PLAN_ID),
      /CHECK|constraint/i,
      "an unknown strategy should be refused by the schema"
    );

    assertEqual(
      JSON.stringify(optionRows(TASK_ID)),
      before,
      "a refused strategy change must not touch the options"
    );
  }
);

check(
  "generation validates before it writes",
  () => {
    /*
     * A task row is validated before the plan is read, the registry is
     * read, any candidate is generated and any option is written. An
     * unknown task therefore costs nothing at all.
     */
    const before = countRows("project_task_ai_options");

    assertServiceError(
      () =>
        plannerService.generateProjectTaskAiOptions(
          "project_task_does_not_exist"
        ),
      "PROJECT_TASK_NOT_FOUND",
      "unknown project task"
    );

    assertEqual(
      countRows("project_task_ai_options"),
      before,
      "the option count should be unchanged"
    );
  }
);

/* ---------------------------------------------------------------- */
/* 8. Scope isolation                                               */
/* ---------------------------------------------------------------- */

check(
  "generating one step leaves another step's options alone",
  () => {
    const before = JSON.stringify(optionRows(SECOND_TASK_ID));

    assertEqual(
      before === "[]",
      true,
      "precondition: the second step has no options yet"
    );

    plannerService.generateProjectTaskAiOptions(TASK_ID);

    assertEqual(
      JSON.stringify(optionRows(SECOND_TASK_ID)),
      before,
      "another step's set must not be touched"
    );
  }
);

check(
  "deleting options removes one step's rows and nothing else",
  () => {
    plannerService.generateProjectTaskAiOptions(
      SECOND_TASK_ID
    );

    const kept = JSON.stringify(optionRows(TASK_ID));

    const removed = plannerRepository.deleteProjectTaskAiOptions(
      SECOND_TASK_ID
    );

    assertEqual(
      removed,
      3,
      "delete should report the rows it removed"
    );
    assertEqual(
      optionRows(SECOND_TASK_ID).length,
      0,
      "the target step is empty"
    );
    assertEqual(
      JSON.stringify(optionRows(TASK_ID)),
      kept,
      "the other step is untouched"
    );

    assertEqual(
      plannerRepository.deleteProjectTaskAiOptions(
        SECOND_TASK_ID
      ),
      0,
      "deleting again is a no-op"
    );
  }
);

check(
  "generation writes nothing to measurement, session or task tables",
  () => {
    const measured = [
      "usage_records",
      "cost_records",
      "task_sessions",
      "task_usage_records",
      "tasks",
      "projects",
      "project_plans",
      "project_tasks",
      "providers",
      "models",
      "ai_model_capabilities",
      "pricing_versions",
    ];

    const before = measured.map((name) => [
      name,
      countRows(name),
    ]);

    plannerService.generateProjectTaskAiOptions(TASK_ID);

    for (const [name, total] of before) {
      assertEqual(
        countRows(name),
        total,
        `${name} must be unchanged by generation`
      );
    }
  }
);

check(
  "generation neither creates nor disturbs an execution link",
  () => {
    /*
     * TASK_ID was linked to an execution task before the run, so
     * regeneration must leave that link exactly as it found it.
     */
    assertEqual(
      plannerRepository.getProjectTask(TASK_ID).task_id,
      EXECUTION_TASK_ID,
      "an existing execution link is preserved"
    );

    /*
     * SECOND_TASK_ID was never linked, and generating options for it
     * must not link it to anything. Planning a step and running it are
     * separate decisions.
     */
    assertEqual(
      plannerRepository.getProjectTask(SECOND_TASK_ID).task_id,
      null,
      "generation must not attach an execution task"
    );
  }
);

/* ---------------------------------------------------------------- */
/* 9. The API surface is unchanged                                  */
/* ---------------------------------------------------------------- */

check(
  "no planner API route was added or altered for C2",
  () => {
    const apiDir = path.join(
      DIR,
      "..",
      "app",
      "api",
      "planner"
    );
    const sources = [];

    function walk(dir) {
      for (const entry of readdirSync(
        dir,
        { withFileTypes: true }
      )) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith(".ts")) {
          sources.push(readFileSync(full, "utf8"));
        }
      }
    }

    walk(apiDir);

    const all = sources.join("\n");

    for (const forbidden of [
      "generateProjectTaskAiOptions",
      "replaceProjectTaskAiOptions",
      "deleteProjectTaskAiOptions",
    ]) {
      assert(
        !all.includes(forbidden),
        `API routes must not reference ${forbidden}`
      );
    }
  }
);

check(
  "the service exposes one generation entry point and it is not routed",
  () => {
    const source = readFileSync(
      path.join(
        DIR,
        "..",
        "lib",
        "services",
        "planner-service.ts"
      ),
      "utf8"
    );

    const matches = source.match(
      /export function generate[A-Za-z]*AiOptions\(/g
    ) ?? [];

    assertEqual(
      matches.length,
      1,
      "exactly one generation entry point"
    );
    assert(
      source.includes(
        "export function generateProjectTaskAiOptions("
      ),
      "the entry point is generateProjectTaskAiOptions"
    );
  }
);

check(
  "C2 did not reach into the generators or the schema",
  () => {
    const serviceSource = readFileSync(
      path.join(
        DIR,
        "..",
        "lib",
        "services",
        "planner-service.ts"
      ),
      "utf8"
    );

    /*
     * The service must consume C1's result, not reimplement it. If any
     * of these appear in the service body it has started estimating on
     * its own.
     */
    for (const forbidden of [
      "estimatePlannerCost",
      "estimatePlannerFit",
      "estimatePlannerTime",
      "applyPlannerStrategy",
    ]) {
      assert(
        !serviceSource.includes(forbidden),
        `the service must not call ${forbidden} directly`
      );
    }

    for (const forbidden of [
      "INSERT INTO project_task_ai_options",
      "DELETE FROM project_task_ai_options",
      "UPDATE project_task_ai_options",
    ]) {
      assert(
        !serviceSource.includes(forbidden),
        `the service must not contain SQL: ${forbidden}`
      );
    }
  }
);

/* ---------------------------------------------------------------- */
/* 10. The real database is untouched                               */
/* ---------------------------------------------------------------- */

check(
  "the real database files were not modified",
  () => {
    assertEqual(
      JSON.stringify(snapshotRealDatabase()),
      JSON.stringify(realDatabaseBefore),
      "real database size or mtime changed"
    );
  }
);

check(
  "the test ran against an isolated database",
  () => {
    assert(
      dbPath.startsWith(TEMP_DIR),
      `expected the temp database under ${TEMP_DIR}, got ${dbPath}`
    );
    assert(
      existsSync(dbPath),
      "the temp database should have been created"
    );
  }
);

/* ---------------------------------------------------------------- */

/* ---------------------------------------------------------------- */
/* 11. An empty registry, checked last                              */
/* ---------------------------------------------------------------- */

/*
 * This case deletes every model, and models cascade to
 * project_task_ai_options. It therefore has to run after every other
 * case that inspects an option row, or it would quietly delete their
 * fixtures too.
 */
check(
  "an empty registry empties the set rather than leaving it stale",
  () => {
    const scratchTaskId = makeTask({
      name: "C2 scratch step",
    }).id;

    plannerService.generateProjectTaskAiOptions(
      scratchTaskId
    );

    assertEqual(
      optionRows(scratchTaskId).length,
      3,
      "scratch step starts with the full set"
    );

    getDb()
      .prepare(
        `DELETE FROM pricing_versions`
      )
      .run();
    getDb()
      .prepare(
        `DELETE FROM ai_model_capabilities`
      )
      .run();
    getDb()
      .prepare(
        `DELETE FROM models`
      )
      .run();

    const afterDelete = plannerService.generateProjectTaskAiOptions(
      scratchTaskId
    );

    assertEqual(
      afterDelete.length,
      0,
      "no models means no options"
    );
    assertEqual(
      optionRows(scratchTaskId).length,
      0,
      "the previous generation is not left behind"
    );
  }
);

check(
  "removing a model cascades its options away",
  () => {
    /*
     * Not C2 behaviour, but worth pinning: model_id is an ON DELETE
     * CASCADE foreign key, so deleting a model takes its options with
     * it. Regeneration is the supported way to change a candidate set.
     */
    assertEqual(
      countRows("project_task_ai_options"),
      0,
      "every option belonged to a model, and the models are gone"
    );
  }
);

console.log("");
console.log(
  `${passed} passed, ${failed} failed`
);

if (failed > 0) {
  console.error("");
  console.error("Failures:");

  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }

  process.exitCode = 1;
}
