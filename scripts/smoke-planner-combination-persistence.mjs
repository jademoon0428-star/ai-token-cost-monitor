/*
 * R2 Phase 3.3-B Planner combination persistence smoke test.
 *
 * Runs entirely against an isolated, freshly-created temp database
 * (NODE_ENV=development + chdir to a temp dir BEFORE the library
 * modules are loaded), so neither
 * data/ai-token-cost-monitor.db nor %APPDATA%\AI-Cost-Management is
 * ever opened for writing. The real database's sha256 and the
 * production data dir files are sampled before and after and compared.
 *
 * The fixtures are literal rows written straight into the temp
 * database: providers, models, capabilities, pricing, user_ai_tools
 * and ai_resources. seed:registry is never called, so the test does
 * not depend on whatever the vendor seed currently contains.
 *
 * The oracle is the pure R2 3.3-A evaluator itself. generatePlanner
 * data is persisted through generateProjectPlanCombinations() and the
 * stored rows are compared to the *deterministically expected* outcome
 * derived by hand from the fixtures (which strategies survive
 * de-duplication, which resource each picks, which cost basis results),
 * so a bug shared by the rules and the service cannot pass the test by
 * agreeing with each other.
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

/*
 * Samples the production (non-dev) database files without opening
 * them. Size and mtime are enough to catch an accidental write.
 */
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
  path.join(tmpdir(), "r2-b-combination-persistence-")
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

function assertSqliteError(fn, pattern, message) {
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
      `${message}: expected a sqlite error matching ${pattern}, got ${String(
        error && error.message
      )}`
    );
  }

  throw new Error(
    `${message}: expected a sqlite error, call did not throw`
  );
}

/* ---------------------------------------------------------------- */
/* Fixtures                                                          */
/* ---------------------------------------------------------------- */

const FIXTURE_TIME = "2026-01-01T00:00:00.000Z";
const NOW_1 = "2026-01-15T00:00:00.000Z";
const NOW_2 = "2026-07-01T00:00:00.000Z";

const PROVIDER_ID = "provider_c3b_smoke";

const REGISTRY_MODELS = {
  free: {
    id: "p_smoke_m_free",
    name: "c3b-free-model",
    tools: 1,
    currency: "USD",
    inputPerMillion: 0,
    outputPerMillion: 0,
  },
  priced: {
    id: "p_smoke_m_priced",
    name: "c3b-priced-model",
    tools: 1,
    currency: "USD",
    inputPerMillion: 1,
    outputPerMillion: 2,
  },
  cny: {
    id: "p_smoke_m_cny",
    name: "c3b-cny-model",
    tools: 1,
    currency: "CNY",
    inputPerMillion: 1,
    outputPerMillion: 2,
  },
  bare: {
    id: "p_smoke_m_bare",
    name: "c3b-bare-model",
    tools: null,
    currency: null,
    inputPerMillion: null,
    outputPerMillion: null,
  },
  subpar: {
    id: "p_smoke_m_subpar",
    name: "c3b-subpar-model",
    tools: 0,
    currency: "USD",
    inputPerMillion: 2,
    outputPerMillion: 2,
  },
};

const AR_FREE = "res_free";
const AR_PAYG = "res_payg";
const AR_SUB = "res_sub";
const AR_ARCHIVED = "res_archived";

const TOOL_SUB = "tool_c3b_sub";

initDb();

getDb()
  .prepare(
    `INSERT INTO providers (id, name, created_at) VALUES (?, ?, ?)`
  )
  .run(PROVIDER_ID, "C3B Smoke Provider", FIXTURE_TIME);

for (const model of Object.values(REGISTRY_MODELS)) {
  getDb()
    .prepare(
      `INSERT INTO models (id, provider_id, name, created_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(model.id, PROVIDER_ID, model.name, FIXTURE_TIME);

  if (model.tools !== null) {
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
        model.id,
        model.tools,
        0,
        0,
        200000,
        8192,
        `https://example.invalid/${model.id}`,
        FIXTURE_TIME,
        FIXTURE_TIME,
        FIXTURE_TIME
      );
  }

  if (model.currency !== null) {
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
        `pricing_${model.id}`,
        PROVIDER_ID,
        model.name,
        model.currency,
        model.inputPerMillion,
        model.outputPerMillion,
        0,
        0,
        "2025-01-01T00:00:00.000Z",
        null
      );
  }
}

getDb()
  .prepare(
    `INSERT INTO user_ai_tools
     (id, name, category, status, notes, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?, ?)`
  )
  .run(
    TOOL_SUB,
    "Subscription IDE",
    "ide",
    null,
    FIXTURE_TIME,
    FIXTURE_TIME
  );

aiResourceRepository.createAiResource({
  id: AR_FREE,
  name: "Free CLI access",
  modelId: REGISTRY_MODELS.free.id,
  accessMethod: "free_tier",
  entitlementName: "free tier",
  entitlementSourceUrl: "https://example.invalid/tier",
  entitlementCheckedAt: FIXTURE_TIME,
  createdAt: FIXTURE_TIME,
});

aiResourceRepository.createAiResource({
  id: AR_PAYG,
  name: "Pay as you go CLI access",
  modelId: REGISTRY_MODELS.cny.id,
  accessMethod: "pay_as_you_go",
  createdAt: FIXTURE_TIME,
});

aiResourceRepository.createAiResource({
  id: AR_SUB,
  name: "Subscription IDE access",
  toolId: TOOL_SUB,
  modelId: REGISTRY_MODELS.priced.id,
  accessMethod: "subscription",
  createdAt: FIXTURE_TIME,
});

aiResourceRepository.createAiResource({
  id: AR_ARCHIVED,
  name: "Archived access (never in a pool)",
  modelId: REGISTRY_MODELS.bare.id,
  accessMethod: "pay_as_you_go",
  createdAt: FIXTURE_TIME,
});
aiResourceRepository.archiveAiResource(AR_ARCHIVED, FIXTURE_TIME);

const PROJECT_ID = plannerService.createProject({
  name: "C3B Smoke Project",
}).id;

const PLAN_V1_ID = plannerService.createProjectPlan({
  projectId: PROJECT_ID,
  strategy: "balanced",
  summary: "manual fixture plan",
}).id;

/*
 * The pricing basis of a combination evaluation is the project's own
 * pricing_basis_at, NOT any plan's created_at. The manual plan keeps
 * its created_at pinned so the test can tell the two apart.
 */
const PLAN_V1_CREATED_AT = "2020-01-01T00:00:00.000Z";

getDb()
  .prepare(`UPDATE project_plans SET created_at = ? WHERE id = ?`)
  .run(PLAN_V1_CREATED_AT, PLAN_V1_ID);

const TASK_1_ID = plannerService.createProjectTask({
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

const TASK_2_ID = plannerService.createProjectTask({
  planId: PLAN_V1_ID,
  name: "Verify the widget",
  category: "testing",
  complexity: "low",
  requiredCapabilities: JSON.stringify([]),
  estimatedInputTokensMin: 100,
  estimatedInputTokensMax: 200,
  estimatedOutputTokensMin: 50,
  estimatedOutputTokensMax: 100,
}).id;

/* ---------------------------------------------------------------- */
/* Helpers over the temp database                                    */
/* ---------------------------------------------------------------- */

function assignmentRows(planId) {
  return plannerRepository.listPlanResourceAssignments(planId);
}

function allAssignments() {
  return getDb()
    .prepare(
      `SELECT ${`id,
        plan_id,
        project_task_id,
        ai_resource_id,
        registry_model_id,
        resource_source,
        role,
        role_source,
        is_primary,
        sequence,
        planned_cost_min_micros,
        planned_cost_max_micros,
        planned_cost_currency,
        planned_time_min_minutes,
        planned_time_max_minutes,
        fit_status,
        cost_basis,
        rationale,
        created_at,
        updated_at`}
       FROM plan_resource_assignments`
    )
    .all();
}

function countRows(table) {
  return Number(
    getDb().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n
  );
}

function countProjectPlans(projectId) {
  return Number(
    getDb()
      .prepare(`SELECT COUNT(*) AS n FROM project_plans WHERE project_id = ?`)
      .get(projectId).n
  );
}

function plansOfProject() {
  return plannerRepository.listProjectPlans(PROJECT_ID);
}

function planByVersion(version) {
  const plan = plansOfProject().find(
    (entry) => entry.version === version
  );

  if (!plan) {
    throw new Error(`no plan with version ${version}`);
  }

  return plan;
}

function assignmentFor(planId, taskId) {
  return assignmentRows(planId).find(
    (row) => row.project_task_id === taskId
  );
}

const MIXED_TASK_2_COST_MIN = 200;
const MIXED_TASK_2_COST_MAX = 400;

/* ---------------------------------------------------------------- */
/* Schema                                                            */
/* ---------------------------------------------------------------- */

check("1. project_plans carries the pricing_basis_at column", () => {
  const columns = getDb()
    .prepare(`PRAGMA table_info(project_plans)`)
    .all()
    .map((column) => column.name);

  assert(
    columns.includes("pricing_basis_at"),
    `project_plans columns: ${columns.join(", ")}`
  );
});

check("2. project_plans.strategy CHECK is widened to the combination strategies", () => {
  const sql = getDb()
    .prepare(
      `SELECT sql FROM sqlite_master
       WHERE type = 'table' AND name = 'project_plans'`
    )
    .get().sql;

  assertEqual(
    (sql.match(/'existing'/g) ?? []).length,
    1,
    "existing strategy declared"
  );
  assert(
    sql.includes("'registry_expanded'"),
    "registry_expanded strategy declared"
  );
});

check("3. plan_resource_assignments exists", () => {
  const row = getDb()
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name = 'plan_resource_assignments'`
    )
    .get();

  assert(row !== undefined, "table is missing");
});

check("4. assignment DDL states the exactly-one resource representation", () => {
  const sql = getDb()
    .prepare(
      `SELECT sql FROM sqlite_master
       WHERE type = 'table' AND name = 'plan_resource_assignments'`
    )
    .get().sql;

  assert(
    sql.includes("resource_source") &&
      sql.includes("'registered'") &&
      sql.includes("'registry'"),
    "resource_source enum"
  );
  assert(
    sql.includes("registry_model_id"),
    "registry_model_id column"
  );
  assert(
    sql.includes("ai_resource_id IS NOT NULL") &&
      sql.includes("registry_model_id IS NOT NULL"),
    "exactly-one CHECK"
  );
});

check("5. the unique expression index covers both resource id columns", () => {
  const sql = getDb()
    .prepare(
      `SELECT sql FROM sqlite_master
       WHERE type = 'index' AND name = 'idx_plan_resource_assignments_unique'`
    )
    .get().sql;

  assert(
    sql.includes("COALESCE(ai_resource_id, '')") &&
      sql.includes("COALESCE(registry_model_id, '')"),
    `unique index: ${sql}`
  );
});

check("6. integrity_check is ok", () => {
  assertEqual(
    getDb().prepare(`PRAGMA integrity_check`).get()
      ?.integrity_check,
    "ok",
    "integrity_check"
  );
});

/* ---------------------------------------------------------------- */
/* Error paths                                                       */
/* ---------------------------------------------------------------- */

check("7. unknown project is refused", () => {
  assertServiceError(
    () => generateProjectPlanCombinations("not_a_project", { now: NOW_1 }),
    "PROJECT_NOT_FOUND",
    "unknown project"
  );
});

check("8. a project without plans is refused", () => {
  const emptyProjectId = plannerService.createProject({
    name: "no plans",
  }).id;

  assertServiceError(
    () =>
      generateProjectPlanCombinations(emptyProjectId, { now: NOW_1 }),
    "PROJECT_HAS_NO_PLANS",
    "project with no plans"
  );
});

check("9. a plan without tasks is refused", () => {
  const emptyPlanProjectId = plannerService.createProject({
    name: "no tasks",
  }).id;
  plannerService.createProjectPlan({
    projectId: emptyPlanProjectId,
    strategy: "balanced",
  });

  assertServiceError(
    () =>
      generateProjectPlanCombinations(emptyPlanProjectId, { now: NOW_1 }),
    "PLAN_HAS_NO_TASKS",
    "plan with no tasks"
  );
});

check("10. an invalid instant is refused", () => {
  assertServiceError(
    () =>
      generateProjectPlanCombinations(PROJECT_ID, { now: "not-an-instant" }),
    "INVALID_INSTANT",
    "invalid now"
  );
});

/* ---------------------------------------------------------------- */
/* First generation                                                  */
/* ---------------------------------------------------------------- */

const generationOne = generateProjectPlanCombinations(PROJECT_ID, {
  now: NOW_1,
});

check("11. one to five plans are returned", () => {
  assert(
    generationOne.plans.length >= 1 &&
      generationOne.plans.length <= 5,
    `plans count ${generationOne.plans.length}`
  );
});

check("12. duplicate strategies collapse and the order matches the rules", () => {
  const strategies = generationOne.plans.map(
    (plan) => plan.strategy
  );

  assertEqual(
    JSON.stringify(strategies),
    JSON.stringify(["existing", "mixed", "registry_expanded"]),
    "deduplicated strategy set in order"
  );
});

check("13. new plans use fresh, increasing versions", () => {
  const versions = generationOne.plans.map((plan) => plan.version);

  assertEqual(
    JSON.stringify(versions),
    JSON.stringify([2, 3, 4]),
    "versions above the manual v1"
  );
  for (const version of versions) {
    assert(
      version > 1,
      `version ${version} must be above the pre-existing v1`
    );
  }
});

check("14. every new plan shares one pricing_basis_at equal to the generation instant", () => {
  for (const plan of generationOne.plans) {
    assertEqual(
      planByVersion(plan.version).pricing_basis_at,
      NOW_1,
      `pricing_basis_at of version ${plan.version}`
    );
  }
});

check("15. each plan summary is non-empty and echoes its strategy", () => {
  for (const plan of generationOne.plans) {
    const row = planByVersion(plan.version);

    assert(
      typeof row.summary === "string" &&
        row.summary.trim() !== "",
      `summary of version ${plan.version}`
    );
    assert(
      row.summary.includes(plan.strategy),
      `summary echoes strategy ${plan.strategy}`
    );
  }
});

check("16. stored plan count grows by exactly the returned plans", () => {
  assertEqual(
    countProjectPlans(PROJECT_ID),
    4,
    "v1 + three generated plans"
  );
});

check("17. assignment rows are written", () => {
  assertEqual(
    countRows("plan_resource_assignments"),
    6,
    "three plans x two tasks"
  );
  for (const plan of generationOne.plans) {
    assertEqual(
      plan.assignmentCount,
      2,
      `assignments of version ${plan.version}`
    );
    assertEqual(
      assignmentRows(
        planByVersion(plan.version).id
      ).length,
      2,
      `stored assignments of version ${plan.version}`
    );
  }
});

check("18. the old v1 plan is untouched", () => {
  const v1 = planByVersion(1);

  assertEqual(v1.strategy, "balanced", "v1 strategy unchanged");
  assertEqual(
    v1.created_at,
    PLAN_V1_CREATED_AT,
    "v1 created_at unchanged"
  );
  assertEqual(
    v1.pricing_basis_at,
    null,
    "v1 pricing_basis_at stays null (immutable old row)"
  );
  assertEqual(v1.version, 1, "v1 version");
});

check("19. each plan's sequence is a contiguous 1..n run", () => {
  for (const plan of generationOne.plans) {
    const rows = assignmentRows(planByVersion(plan.version).id);
    const sequences = rows.map((row) => row.sequence);

    assertEqual(
      JSON.stringify(sequences),
      JSON.stringify([1, 2]),
      `sequences of version ${plan.version}`
    );
  }
});

check("20. assignment order follows project_tasks.sequence, not insertion", () => {
  const mixed = generationOne.plans.find(
    (plan) => plan.strategy === "mixed"
  );
  const rows = assignmentRows(planByVersion(mixed.version).id);

  assertEqual(
    rows[0].project_task_id === TASK_1_ID &&
      rows[1].project_task_id === TASK_2_ID,
    true,
    "task 1 gets sequence 1, task 2 sequence 2"
  );
});

check("21. is_primary is always 0 (nothing is selected or recommended)", () => {
  for (const row of allAssignments()) {
    assertEqual(row.is_primary, 0, `assignment ${row.id}`);
  }
});

check("22. role and role_source are persisted from the rules", () => {
  const roles = new Set();
  const sources = new Set();

  for (const row of allAssignments()) {
    roles.add(row.role);
    sources.add(row.role_source);
  }

  for (const role of ["implementer", "reviewer"]) {
    assert(roles.has(role), `role ${role} present`);
  }
  assertEqual(
    JSON.stringify([...sources]),
    JSON.stringify(["default_from_category"]),
    "roles come from the category map"
  );
  for (const row of allAssignments()) {
    assert(
      [
        "implementer",
        "reviewer",
        "researcher",
        "designer",
        "assistant",
      ].includes(row.role),
      `valid role ${row.role}`
    );
  }
});

check("23. fit_status tri-state is stored and below_minimum is never stored", () => {
  const existing = planByVersion(2);
  const expanded = planByVersion(4);

  for (const row of assignmentRows(existing.id)) {
    assertEqual(row.fit_status, "meets", "existing plan fit");
  }
  for (const row of assignmentRows(expanded.id)) {
    assertEqual(
      row.fit_status,
      "unknown",
      "bare registry model fit is unknown, never fabricated"
    );
  }
  for (const row of allAssignments()) {
    assert(
      row.fit_status !== "below_minimum",
      `no below_minimum row (${row.id})`
    );
  }
});

check("24. a confirmed free entitlement is stored as a real zero cost", () => {
  const existing = planByVersion(2);
  const row = assignmentFor(existing.id, TASK_1_ID);

  assertEqual(row.planned_cost_min_micros, 0, "min");
  assertEqual(row.planned_cost_max_micros, 0, "max");
  assertEqual(row.planned_cost_currency, "USD", "currency");
  assert(
    row.cost_basis.includes("zero because the free_tier entitlement is confirmed"),
    `cost_basis: ${row.cost_basis}`
  );
});

check("25. currencies are never merged across assignments", () => {
  const mixed = planByVersion(3);
  const row = assignmentFor(mixed.id, TASK_2_ID);

  assertEqual(
    row.ai_resource_id,
    AR_PAYG,
    "pay-as-you-go registered resource"
  );
  assertEqual(row.planned_cost_min_micros, MIXED_TASK_2_COST_MIN, "min");
  assertEqual(row.planned_cost_max_micros, MIXED_TASK_2_COST_MAX, "max");
  assertEqual(row.planned_cost_currency, "CNY", "CNY stays CNY");
  assert(
    row.cost_basis.includes("pay_as_you_go"),
    `cost_basis: ${row.cost_basis}`
  );
  const other = assignmentFor(mixed.id, TASK_1_ID);

  assertEqual(
    other.planned_cost_currency,
    "USD",
    "the other assignment keeps USD - no merge"
  );
});

check("26. unknown cost is three NULLs, never 0 and never an assumed currency", () => {
  const expanded = planByVersion(4);

  for (const row of assignmentRows(expanded.id)) {
    assertEqual(row.planned_cost_min_micros, null, "min");
    assertEqual(row.planned_cost_max_micros, null, "max");
    assertEqual(row.planned_cost_currency, null, "currency");
    assert(
      row.cost_basis !== null &&
        row.cost_basis.includes("unknown"),
      `cost_basis: ${row.cost_basis}`
    );
  }
});

check("27. resource reference is exactly ai_resource_id or registry_model_id", () => {
  const plans = {};
  for (const plan of generationOne.plans) {
    plans[plan.strategy] = planByVersion(plan.version).id;
  }

  for (const row of assignmentRows(plans.existing)) {
    assertEqual(row.resource_source, "registered", "existing source");
    assert(row.ai_resource_id !== null, "registered id set");
    assertEqual(row.registry_model_id, null, "no registry id");
  }

  for (const row of assignmentRows(plans.registry_expanded)) {
    assertEqual(row.resource_source, "registry", "expanded source");
    assertEqual(row.ai_resource_id, null, "never a registered id");
    assert(
      row.registry_model_id === REGISTRY_MODELS.bare.id,
      `registry-only model id on a model with no ai_resources row: ${row.registry_model_id}`
    );
  }

  const mixed = assignmentRows(plans.mixed);

  assertEqual(mixed.length, 2, "mixed plan assigns both tasks");
  assert(
    mixed.every((row) => row.resource_source === "registered"),
    "mixed plan stays on registered resources in this fixture"
  );
  assert(
    mixed.some((row) => row.ai_resource_id === AR_FREE) &&
      mixed.some((row) => row.ai_resource_id === AR_PAYG),
    "mixed plan blends the free and pay-as-you-go registered resources"
  );
});

check("28. an archived resource and an unconfirmed subscription are never assigned", () => {
  const rows = allAssignments();

  assert(
    rows.every((row) => row.ai_resource_id !== AR_ARCHIVED),
    "archived resource excluded"
  );
  assert(
    rows.every((row) => row.ai_resource_id !== AR_SUB),
    "unconfirmed subscription never appears (not even as zero)"
  );
});

check("29. generation never fabricates ai_resources rows", () => {
  assertEqual(
    countRows("ai_resources"),
    4,
    "only the four fixtures exist"
  );
});

check("30. project_task_ai_options and the money/session layers are untouched", () => {
  assertEqual(
    countRows("project_task_ai_options"),
    0,
    "no candidate options written"
  );
  assertEqual(countRows("usage_records"), 0, "usage_records");
  assertEqual(countRows("cost_records"), 0, "cost_records");
  assertEqual(countRows("task_sessions"), 0, "task_sessions");
  assertEqual(countRows("task_usage_records"), 0, "task_usage_records");
});

check("31. generated plans own no new project_tasks", () => {
  const generatedIds = generationOne.plans.map(
    (plan) => planByVersion(plan.version).id
  );

  for (const id of generatedIds) {
    assertEqual(
      plannerRepository.listProjectTasks(id).length,
      0,
      `plan ${id} owns no tasks`
    );
  }
  assertEqual(countRows("project_tasks"), 2, "only the two fixtures");
});

check("32. planned_time is the step's own range on every assignment of it", () => {
  const mixed = planByVersion(3);
  const rows = assignmentRows(mixed.id);
  const t1 = rows.find((row) => row.project_task_id === TASK_1_ID);
  const t2 = rows.find((row) => row.project_task_id === TASK_2_ID);

  assertEqual(t1.planned_time_min_minutes, 45, "T1 min");
  assertEqual(t1.planned_time_max_minutes, 120, "T1 max");
  assertEqual(t2.planned_time_min_minutes, 15, "T2 min");
  assertEqual(t2.planned_time_max_minutes, 30, "T2 max");
});

/* ---------------------------------------------------------------- */
/* Regeneration                                                      */
/* ---------------------------------------------------------------- */

const generationTwo = generateProjectPlanCombinations(PROJECT_ID, {
  now: NOW_2,
});

check("33. regeneration appends versions instead of overwriting", () => {
  const versions = generationTwo.plans.map((plan) => plan.version);

  assertEqual(
    JSON.stringify(versions),
    JSON.stringify([5, 6, 7]),
    "v5..v7 appended"
  );
  assertEqual(countProjectPlans(PROJECT_ID), 7, "four + three");
  assertEqual(
    countRows("plan_resource_assignments"),
    12,
    "six + six"
  );
  assertEqual(
    planByVersion(1).strategy,
    "balanced",
    "v1 still untouched"
  );
  assertEqual(
    planByVersion(2).strategy,
    "existing",
    "v2 untouched"
  );
});

check("34. a recorded pricing_basis_at is reused across generations", () => {
  for (const plan of generationTwo.plans) {
    assertEqual(
      planByVersion(plan.version).pricing_basis_at,
      NOW_1,
      `version ${plan.version} reuses the older shared instant`
    );
  }
  assert(
    plansOfProject().every(
      (plan) => plan.pricing_basis_at !== NOW_2
    ),
    "NOW_2 is never used as a pricing basis while a valid one exists"
  );
});

check("35. regeneration produces identical, deterministic rows", () => {
  const expandedA = assignmentRows(planByVersion(4).id);
  const expandedB = assignmentRows(planByVersion(7).id);

  assertEqual(
    JSON.stringify(
      expandedA.map((row) => [
        row.project_task_id,
        row.ai_resource_id,
        row.registry_model_id,
        row.role,
        row.sequence,
        row.planned_cost_min_micros,
        row.planned_cost_max_micros,
        row.planned_cost_currency,
        row.fit_status,
      ])
    ),
    JSON.stringify(
      expandedB.map((row) => [
        row.project_task_id,
        row.ai_resource_id,
        row.registry_model_id,
        row.role,
        row.sequence,
        row.planned_cost_min_micros,
        row.planned_cost_max_micros,
        row.planned_cost_currency,
        row.fit_status,
      ])
    ),
    "v4 and v7 (registry_expanded) carry the same assignment facts"
  );
});

/* ---------------------------------------------------------------- */
/* Cascade                                                           */
/* ---------------------------------------------------------------- */

check("36. deleting a task cascades only that task's assignments", () => {
  const before = allAssignments();

  getDb()
    .prepare(`DELETE FROM project_tasks WHERE id = ?`)
    .run(TASK_1_ID);

  const after = allAssignments();

  assertEqual(
    before.length - after.length,
    6,
    "one assignment per plan referenced task 1 (three plans of each generation)"
  );
  assert(
    after.every((row) => row.project_task_id !== TASK_1_ID),
    "no dangling task references"
  );
});

check("37. deleting a combination plan cascades its assignments", () => {
  const countBeforePlan = countRows("project_plans");
  const planId = planByVersion(5).id;

  getDb()
    .prepare(`DELETE FROM project_plans WHERE id = ?`)
    .run(planId);

  assertEqual(
    countRows("project_plans"),
    countBeforePlan - 1,
    "plan gone"
  );
  assertEqual(
    countRows(
      "plan_resource_assignments"
    ),
    allAssignments().length,
    "assignments consistent"
  );
  assert(
    allAssignments().every((row) => row.plan_id !== planId),
    "no dangling plan references"
  );
});

/* ---------------------------------------------------------------- */
/* Atomicity                                                         */
/* ---------------------------------------------------------------- */

check("38. a failed batch rolls everything back", () => {
  const plansBefore = countRows("project_plans");
  const assignmentsBefore = countRows("plan_resource_assignments");
  const shared = "dup_assignment_id";

  const plans = [
    {
      id: `${shared}_plan_a`,
      strategy: "existing",
      summary: "rollback probe A",
      pricingBasisAt: NOW_1,
      assignments: [
        {
          id: "dup_a_1",
          planId: `${shared}_plan_a`,
          projectTaskId: TASK_2_ID,
          resourceSource: "registered",
          aiResourceId: AR_FREE,
          role: "implementer",
          roleSource: "default_from_category",
          sequence: 1,
          fitStatus: "meets",
          createdAt: NOW_1,
        },
      ],
    },
    {
      id: `${shared}_plan_b`,
      strategy: "mixed",
      summary: "rollback probe B",
      pricingBasisAt: NOW_1,
      assignments: [
        {
          id: "dup_a_1",
          planId: `${shared}_plan_b`,
          projectTaskId: TASK_2_ID,
          resourceSource: "registered",
          aiResourceId: AR_PAYG,
          role: "reviewer",
          roleSource: "default_from_category",
          sequence: 1,
          fitStatus: "meets",
          createdAt: NOW_1,
        },
      ],
    },
  ];

  assertSqliteError(
    () =>
      plannerRepository.saveCombinationPlans({
        projectId: PROJECT_ID,
        createdAt: NOW_1,
        plans,
      }),
    /UNIQUE|primary key|constraint/i,
    "duplicate assignment id"
  );

  assertEqual(
    countRows("project_plans"),
    plansBefore,
    "no plan rows leaked"
  );
  assertEqual(
    countRows("plan_resource_assignments"),
    assignmentsBefore,
    "no assignment rows leaked"
  );
  assertEqual(
    plansOfProject().some((plan) => plan.id === `${shared}_plan_a`),
    false,
    "failed plan A not present"
  );
});

/* ---------------------------------------------------------------- */
/* Vocabulary                                                        */
/* ---------------------------------------------------------------- */

check("39. no scoring or selection vocabulary lives in the plan tables", () => {
  const sql = getDb()
    .prepare(
      `SELECT sql FROM sqlite_master
       WHERE type = 'table'
         AND name IN ('project_plans', 'plan_resource_assignments')`
    )
    .all()
    .map((row) => row.sql)
    .join("\n");
  const forbidden = [
    "score",
    "rank",
    "winner",
    "best",
    "recommend",
    "selected",
    "favourite",
  ];

  for (const word of forbidden) {
    assert(
      !sql.toLowerCase().includes(word),
      `forbidden vocabulary "${word}"`
    );
  }
});

check("40. the real databases are never touched", () => {
  const after =
    sha256Of(PROJECT_LOCAL_DB) === realProjectDbBefore;
  const productionAfter =
    JSON.stringify(snapshotProductionDatabase()) ===
    JSON.stringify(productionDatabaseBefore);

  assertEqual(
    sha256Of(PROJECT_LOCAL_DB),
    realProjectDbBefore,
    "project-local db sha256 unchanged"
  );
  assert(after, "project-local db hash unchanged");
  assert(
    productionAfter,
    "production data dir files unchanged"
  );
  assertEqual(
    sha256Of(PROJECT_LOCAL_DB).toLowerCase(),
    "ba4a9d1ec45db9a7a6df6e7c7b055d029176fc43208bd2d13eeea17bf0d0e509",
    "real dev db sha matches the pinned hash"
  );
});

/* ---------------------------------------------------------------- */

console.log(`\ncombination-persistence: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }

  process.exit(1);
}