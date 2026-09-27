/*
 * v1.4-C AI Project Planner data-layer smoke test.
 *
 * Runs entirely against an isolated, freshly-created temp database
 * (NODE_ENV=development + chdir to a temp dir BEFORE the library
 * modules are loaded), so neither data/ai-token-cost-monitor.db nor
 * %APPDATA%\AI-Cost-Management is ever opened for writing.
 *
 * Provider / model / tool fixtures are inserted directly into the
 * temp database. seed:registry is never called.
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

const TEMP_DIR = mkdtempSync(path.join(tmpdir(), "v14c-planner-smoke-"));

process.env.NODE_ENV = "development";
process.chdir(TEMP_DIR);

const { dbPath, getDb } = await import("../lib/db.ts");
const { initDb } = await import("../lib/schema.ts");
const plannerRepository = await import("../lib/repositories/planner-repository.ts");
const plannerService = await import("../lib/services/planner-service.ts");
const { createTask } = await import("../lib/services/task-service.ts");
const { createUserAiTool } = await import("../lib/registry/ai-registry-repository.ts");

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

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);

  if (a !== b) {
    throw new Error(`${message}: expected ${b}, got ${a}`);
  }
}

function expectServiceError(fn, code) {
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
      `expected PlannerServiceError "${code}", got ${
        error instanceof Error
          ? `${error.constructor.name} ${error.message}`
          : String(error)
      }`
    );
  }

  throw new Error(`expected PlannerServiceError "${code}", call did not throw`);
}

function expectSqliteConstraint(fn, pattern) {
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
      `expected a sqlite constraint error matching ${pattern}, got ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  throw new Error("expected a sqlite constraint error, call did not throw");
}

function tableExists(name) {
  return (
    getDb()
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`
      )
      .get(name) !== undefined
  );
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

function countRowsWhere(name, where, ...params) {
  return Number(
    getDb()
      .prepare(`SELECT COUNT(*) AS total FROM ${name} ${where}`)
      .get(...params).total
  );
}

/* ---------------------------------------------------------------- */
/* Fixtures: 2 providers, 3 models, 2 user tools, 2 execution tasks */
/* ---------------------------------------------------------------- */

const NOW = "2026-09-27T00:00:00.000Z";

initDb();

getDb()
  .prepare(
    `INSERT INTO providers (id, name, created_at) VALUES (?, ?, ?)`
  )
  .run("provider_smoke_a", "Smoke Provider A", NOW);
getDb()
  .prepare(
    `INSERT INTO providers (id, name, created_at) VALUES (?, ?, ?)`
  )
  .run("provider_smoke_b", "Smoke Provider B", NOW);

for (const [id, providerId] of [
  ["provider_smoke_a_model_1", "provider_smoke_a"],
  ["provider_smoke_a_model_2", "provider_smoke_a"],
  ["provider_smoke_b_model_1", "provider_smoke_b"],
]) {
  getDb()
    .prepare(
      `INSERT INTO models (id, provider_id, name, created_at) VALUES (?, ?, ?, ?)`
    )
    .run(id, providerId, id.replace(/^provider_smoke_[ab]_/, ""), NOW);
}

createUserAiTool({
  id: "tool_smoke_cli",
  name: "Smoke CLI",
  category: "cli",
  createdAt: NOW,
});
createUserAiTool({
  id: "tool_smoke_ide",
  name: "Smoke IDE",
  category: "ide",
  createdAt: NOW,
});

const EXEC_TASK_1 = createTask({ name: "Smoke execution task 1" }).id;
const EXEC_TASK_2 = createTask({ name: "Smoke execution task 2" }).id;

/* ---------------------------------------------------------------- */

const PROJECT_A = plannerService.createProject({
  name: "Smoke project A",
  goal: "verify the planner data layer",
  budgetMinMicros: 1000000,
  budgetMaxMicros: 5000000,
  budgetCurrency: "USD",
  deadlineDays: 14,
});
const PROJECT_B = plannerService.createProject({
  name: "Smoke project B",
});

const PLAN_A = plannerService.createProjectPlan({
  projectId: PROJECT_A.id,
  strategy: "balanced",
  summary: "plan A v1",
});
const PLAN_A_V2 = plannerService.createProjectPlan({
  projectId: PROJECT_A.id,
  strategy: "cost_first",
});

const PT_1 = plannerService.createProjectTask({
  planId: PLAN_A.id,
  name: "Design the schema",
  category: "architecture",
  complexity: "medium",
  requiredCapabilities: '["tools","reasoning"]',
  estimatedInputTokensMin: 1000,
  estimatedInputTokensMax: 5000,
  estimatedOutputTokensMin: 500,
  estimatedOutputTokensMax: 2000,
});
const PT_2 = plannerService.createProjectTask({
  planId: PLAN_A.id,
  name: "Write the migration",
  category: "coding",
  complexity: "high",
  requiredCapabilities: "[]",
  taskId: EXEC_TASK_1,
});

const OPT_1 = plannerService.createProjectTaskAiOption({
  projectTaskId: PT_1.id,
  modelId: "provider_smoke_a_model_1",
  costMinMicros: 100000,
  costMaxMicros: 400000,
  costCurrency: "USD",
  timeMinMinutes: 5,
  timeMaxMinutes: 30,
  // PT_1's required_capabilities (set to ["vision"] in check 6) are
  // satisfied here. Unrelated to the cost figures above.
  fitStatus: "meets",
  pricingBasis: "official price card",
});
const OPT_2 = plannerService.createProjectTaskAiOption({
  projectTaskId: PT_1.id,
  modelId: "provider_smoke_a_model_2",
  toolId: "tool_smoke_cli",
  costMinMicros: 50000,
  costMaxMicros: 90000,
  costCurrency: "CNY",
  timeMinMinutes: 3,
  timeMaxMinutes: 12,
  // This model has no vision, so it is below_minimum for PT_1 even
  // though it is the cheaper option in CNY.
  fitStatus: "below_minimum",
});
const OPT_3 = plannerService.createProjectTaskAiOption({
  projectTaskId: PT_1.id,
  modelId: "provider_smoke_b_model_1",
});

/* Set in check 15 and asserted in check 16. */
let PT_2_OPTION;

/* ---------------------------------------------------------------- */

check("1. the four planner tables exist", () => {
  for (const table of [
    "projects",
    "project_plans",
    "project_tasks",
    "project_task_ai_options",
  ]) {
    assert(tableExists(table), `${table} is missing`);
  }
});

check("2. the existing core tables still exist", () => {
  for (const table of [
    "providers",
    "models",
    "usage_records",
    "cost_records",
    "budgets",
    "pricing_versions",
    "import_logs",
    "ai_model_capabilities",
    "user_ai_tools",
  ]) {
    assert(tableExists(table), `${table} is missing`);
  }
});

check("3. the existing Task Session tables are structurally unchanged", () => {
  assertEqual(
    columnsOf("tasks").join(","),
    "id,name,status,created_at,updated_at",
    "tasks columns changed"
  );
  assertEqual(
    columnsOf("task_sessions").join(","),
    "id,task_id,started_at,ended_at,status,created_at",
    "task_sessions columns changed"
  );
  assertEqual(
    columnsOf("task_usage_records").join(","),
    "id,task_session_id,usage_record_id,attribution_status,created_at",
    "task_usage_records columns changed"
  );
  assertEqual(
    columnsOf("usage_records").join(","),
    "id,provider_id,model_id,timestamp,input_tokens,output_tokens,cached_tokens,reasoning_tokens,application,project,import_id,source,accuracy,created_at",
    "usage_records columns changed"
  );
  assertEqual(
    columnsOf("cost_records").join(","),
    "id,usage_record_id,import_id,input_cost_micros,output_cost_micros,cached_cost_micros,reasoning_cost_micros,total_cost_micros,currency,pricing_version,provenance,created_at",
    "cost_records columns changed"
  );
  assertEqual(
    columnsOf("models").join(","),
    "id,provider_id,name,created_at",
    "models columns changed"
  );
  assertEqual(
    columnsOf("pricing_versions").join(","),
    "id,provider_id,model,currency,input_per_million,output_per_million,cached_per_million,reasoning_per_million,effective_from,effective_to",
    "pricing_versions columns changed"
  );
});

check("4. projects CRUD", () => {
  const fetched = plannerRepository.getProject(PROJECT_A.id);

  assertEqual(fetched.name, "Smoke project A", "project name");
  assertEqual(fetched.preference, "balanced", "default preference");
  assertEqual(fetched.status, "planning", "default status");
  assertEqual(fetched.budget_currency, "USD", "budget currency");

  const updated = plannerService.updateProject(PROJECT_A.id, {
    description: "updated description",
    preference: "time_first",
  });

  assertEqual(updated.description, "updated description", "update description");
  assertEqual(updated.preference, "time_first", "update preference");
  assertEqual(
    updated.budget_min_micros,
    PROJECT_A.budget_min_micros,
    "partial update must not clear untouched budget fields"
  );

  const listed = plannerRepository.listProjects();

  assertEqual(listed.length, 2, "listProjects should return both projects");
  assertEqual(
    plannerRepository.listProjects({ status: "planning" }).length,
    2,
    "status filter"
  );

  plannerService.updateProjectStatus(PROJECT_B.id, "active");
  assertEqual(
    plannerRepository.getProject(PROJECT_B.id).status,
    "active",
    "updateProjectStatus"
  );
  assertEqual(
    plannerRepository.listProjects({ status: "active" }).length,
    1,
    "status filter after transition"
  );
});

check("5. project_plans CRUD", () => {
  assertEqual(
    plannerRepository.getProjectPlan(PLAN_A.id).version,
    1,
    "plan version"
  );
  assertEqual(
    plannerRepository.getProjectPlan(PLAN_A_V2.id).strategy,
    "cost_first",
    "plan strategy"
  );

  const plans = plannerRepository.listProjectPlans(PROJECT_A.id);

  assertEqual(plans.length, 2, "listProjectPlans");
  assertDeepEqual(
    plans.map((plan) => plan.version),
    [1, 2],
    "plans are ordered by version"
  );
  assertEqual(
    plannerRepository.listProjectPlans(PROJECT_B.id).length,
    0,
    "a project with no plans lists none"
  );
});

check("6. project_tasks CRUD", () => {
  const fetched = plannerRepository.getProjectTask(PT_1.id);

  assertEqual(fetched.category, "architecture", "category");
  assertEqual(fetched.complexity, "medium", "complexity");
  assertEqual(fetched.status, "planned", "default status");
  assertEqual(fetched.task_id, null, "task_id starts unlinked");
  assertEqual(
    plannerRepository.listProjectTasks(PLAN_A.id).length,
    2,
    "listProjectTasks"
  );

  const updated = plannerService.updateProjectTask(PT_1.id, {
    name: "Design the schema (revised)",
    complexity: "high",
    requiredCapabilities: '["vision"]',
  });

  assertEqual(updated.name, "Design the schema (revised)", "update name");
  assertEqual(updated.complexity, "high", "update complexity");
  assertEqual(
    updated.required_capabilities,
    '["vision"]',
    "update required_capabilities"
  );
  assertEqual(
    updated.estimated_input_tokens_min,
    1000,
    "partial update must not clear untouched token estimates"
  );

  plannerService.updateProjectTaskStatus(PT_1.id, "in_progress");
  assertEqual(
    plannerRepository.getProjectTask(PT_1.id).status,
    "in_progress",
    "updateProjectTaskStatus"
  );
});

check("7. project_task_ai_options CRUD", () => {
  const fetched = plannerRepository.getProjectTaskAiOption(OPT_1.id);

  assertEqual(fetched.model_id, "provider_smoke_a_model_1", "model_id");
  assertEqual(fetched.tool_id, null, "tool_id may be null");
  assertEqual(fetched.is_selected, 0, "default is_selected");
  assertEqual(fetched.fit_status, "meets", "fit_status");
  assertEqual(fetched.cost_currency, "USD", "cost currency");
  assertEqual(
    plannerRepository.listProjectTaskAiOptions(PT_1.id).length,
    3,
    "listProjectTaskAiOptions"
  );
  assertEqual(
    plannerRepository.listProjectTaskAiOptions(PT_2.id).length,
    0,
    "a planned task with no options lists none"
  );
});

check("8. FK cascade: deleting a project removes its plans, tasks and options", () => {
  const cascadeProject = plannerService.createProject({
    name: "Cascade project",
  });

  const plan = plannerService.createProjectPlan({
    projectId: cascadeProject.id,
    strategy: "balanced",
  });
  const projectTask = plannerService.createProjectTask({
    planId: plan.id,
    name: "Cascade task",
    category: "coding",
    complexity: "low",
  });

  const option = plannerService.createProjectTaskAiOption({
    projectTaskId: projectTask.id,
    modelId: "provider_smoke_a_model_1",
  });

  assertEqual(
    countRowsWhere(
      "project_task_ai_options",
      "WHERE id = ?",
      option.id
    ),
    1,
    "option exists"
  );

  getDb()
    .prepare(`DELETE FROM projects WHERE id = ?`)
    .run(cascadeProject.id);

  assertEqual(
    countRowsWhere(
      "project_plans",
      "WHERE id = ?",
      plan.id
    ),
    0,
    "plan should be cascade deleted"
  );
  assertEqual(
    countRowsWhere(
      "project_tasks",
      "WHERE id = ?",
      projectTask.id
    ),
    0,
    "task should be cascade deleted"
  );
  assertEqual(
    countRowsWhere(
      "project_task_ai_options",
      "WHERE id = ?",
      option.id
    ),
    0,
    "option should be cascade deleted"
  );
});

check("9. project_tasks.task_id is ON DELETE SET NULL", () => {
  assertEqual(
    plannerRepository.getProjectTask(PT_2.id).task_id,
    EXEC_TASK_1,
    "planned task is linked to the execution task"
  );

  getDb()
    .prepare(`DELETE FROM tasks WHERE id = ?`)
    .run(EXEC_TASK_1);

  const afterDelete = plannerRepository.getProjectTask(PT_2.id);

  assertEqual(afterDelete.task_id, null, "task_id must be set to NULL, not cascade the planned task");
  assertEqual(
    countRowsWhere("project_tasks", "WHERE id = ?", PT_2.id),
    1,
    "the planned task row still exists"
  );
  assert(
    plannerRepository.getProjectTask(PT_2.id) !== undefined,
    "the planned task must survive deletion of its execution task"
  );
});

check("10. UNIQUE(project_id, version)", () => {
  expectSqliteConstraint(
    () =>
      plannerRepository.createProjectPlan({
        id: "plan_a_dup",
        projectId: PROJECT_A.id,
        version: 1,
        strategy: "balanced",
        createdAt: NOW,
      }),
    /UNIQUE constraint failed: project_plans\.project_id, project_plans\.version/i
  );
});

check("11. UNIQUE(plan_id, sequence)", () => {
  expectSqliteConstraint(
    () =>
      plannerRepository.createProjectTask({
        id: "ptask_dup_seq",
        planId: PLAN_A.id,
        sequence: 1,
        name: "Duplicate sequence",
        category: "coding",
        complexity: "low",
        createdAt: NOW,
      }),
    /UNIQUE constraint failed: project_tasks\.plan_id, project_tasks\.sequence/i
  );
});

check("12. the option unique expression index blocks duplicates and keeps NULL distinct from a real tool", () => {
  expectSqliteConstraint(
    () =>
      plannerRepository.createProjectTaskAiOption({
        id: "opt_dup_null_tool",
        projectTaskId: PT_1.id,
        modelId: "provider_smoke_a_model_1",
        createdAt: NOW,
      }),
    /UNIQUE constraint failed/i
  );

  expectSqliteConstraint(
    () =>
      plannerRepository.createProjectTaskAiOption({
        id: "opt_dup_same_tool",
        projectTaskId: PT_1.id,
        modelId: "provider_smoke_a_model_2",
        toolId: "tool_smoke_cli",
        createdAt: NOW,
      }),
    /UNIQUE constraint failed/i
  );

  // Same model, same planned task, but a real tool instead of NULL is
  // a different option and must be accepted.
  plannerRepository.createProjectTaskAiOption({
    id: "opt_same_model_with_tool",
    projectTaskId: PT_1.id,
    modelId: "provider_smoke_a_model_1",
    toolId: "tool_smoke_cli",
    createdAt: NOW,
  });

  assertEqual(
    plannerRepository.listProjectTaskAiOptions(PT_1.id).length,
    4,
    "NULL tool_id and a concrete tool_id are distinct options"
  );
});

check("13. one planned task can use several models", () => {
  const models = new Set(
    plannerRepository
      .listProjectTaskAiOptions(PT_1.id)
      .map((option) => option.model_id)
  );

  assertEqual(models.size, 3, `expected 3 distinct models, got ${models.size}`);
});

check("14. one tool can be paired with several models", () => {
  const withTool = plannerRepository
    .listProjectTaskAiOptions(PT_1.id)
    .filter((option) => option.tool_id === "tool_smoke_cli");

  assertEqual(withTool.length, 2, "tool_smoke_cli is used by two options");
  assertEqual(
    new Set(withTool.map((option) => option.model_id)).size,
    2,
    "the two options use different models"
  );
});

check("15. one model can appear on several planned tasks", () => {
  PT_2_OPTION = plannerService.createProjectTaskAiOption({
    projectTaskId: PT_2.id,
    modelId: "provider_smoke_a_model_1",
  });

  const onTaskOne = plannerRepository
    .listProjectTaskAiOptions(PT_1.id)
    .filter((option) => option.model_id === "provider_smoke_a_model_1");
  const onTaskTwo = plannerRepository
    .listProjectTaskAiOptions(PT_2.id)
    .filter((option) => option.model_id === "provider_smoke_a_model_1");

  assert(onTaskOne.length >= 1, "model used on planned task 1");
  assert(onTaskTwo.length >= 1, "same model used on planned task 2");

  // The reverse index is real too.
  const byModel = getDb()
    .prepare(
      `SELECT project_task_id FROM project_task_ai_options WHERE model_id = ?`
    )
    .all("provider_smoke_a_model_1");

  assert(byModel.length >= 2, "model_id index returns rows across tasks");
});

check("16. is_selected switches to exactly one option", () => {
  assertEqual(
    countRowsWhere(
      "project_task_ai_options",
      "WHERE project_task_id = ? AND is_selected = 1",
      PT_1.id
    ),
    0,
    "nothing is selected initially"
  );

  plannerService.selectProjectTaskAiOption(OPT_2.id);

  const options = plannerRepository.listProjectTaskAiOptions(PT_1.id);
  const selected = options.filter((option) => option.is_selected === 1);

  assertEqual(selected.length, 1, "exactly one option is selected");
  assertEqual(selected[0].id, OPT_2.id, "the user's choice is the selected one");

  plannerService.selectProjectTaskAiOption(OPT_1.id);

  const afterSwitch = plannerRepository.listProjectTaskAiOptions(PT_1.id);

  assertEqual(
    afterSwitch.filter((option) => option.is_selected === 1).length,
    1,
    "still exactly one selected after switching"
  );
  assertEqual(
    plannerRepository.getProjectTaskAiOption(OPT_1.id).is_selected,
    1,
    "newly selected option"
  );
  assertEqual(
    plannerRepository.getProjectTaskAiOption(OPT_2.id).is_selected,
    0,
    "previous selection is cleared"
  );

  // Selecting on one planned task never touches another.
  assertEqual(
    plannerRepository.getProjectTaskAiOption(
      PT_2_OPTION.id
    ).is_selected,
    0,
    "selection is scoped to one planned task"
  );
});

check("17. unknown pricing stays NULL, never 0 and never an assumed currency", () => {
  const unknown = plannerRepository.getProjectTaskAiOption(OPT_3.id);

  assertEqual(unknown.cost_min_micros, null, "unknown cost_min_micros");
  assertEqual(unknown.cost_max_micros, null, "unknown cost_max_micros");
  assertEqual(unknown.cost_currency, null, "unknown cost_currency");
  assertEqual(unknown.time_min_minutes, null, "unknown time_min_minutes");
  assertEqual(unknown.fit_status, "unknown", "unknown fit_status");

  expectServiceError(
    () =>
      plannerService.createProjectTaskAiOption({
        projectTaskId: PT_2.id,
        modelId: "provider_smoke_b_model_1",
        costMinMicros: 0,
        costMaxMicros: 0,
      }),
    "INCOMPLETE_COST"
  );

  // An explicit 0 is a real claim ("this is free"), which is not the
  // same as "unknown". Both are accepted, and they stay distinguishable.
  const free = plannerService.createProjectTaskAiOption({
    projectTaskId: PT_2.id,
    modelId: "provider_smoke_b_model_1",
    costMinMicros: 0,
    costMaxMicros: 0,
    costCurrency: "USD",
  });

  assertEqual(free.cost_min_micros, 0, "an explicit free price is stored as 0");
  assertEqual(free.cost_currency, "USD", "an explicit free price keeps its currency");
  assertEqual(
    plannerRepository.getProjectTaskAiOption(OPT_3.id).cost_min_micros,
    null,
    "unknown stays null and is never collapsed to the explicit 0"
  );
});

check("18. CNY and USD are stored as given and never converted or summed", () => {
  const cny = plannerRepository.getProjectTaskAiOption(OPT_2.id);
  const usd = plannerRepository.getProjectTaskAiOption(OPT_1.id);

  assertEqual(cny.cost_currency, "CNY", "CNY option stays CNY");
  assertEqual(usd.cost_currency, "USD", "USD option stays USD");
  assertEqual(cny.cost_min_micros, 50000, "CNY amount untouched");
  assertEqual(usd.cost_min_micros, 100000, "USD amount untouched");

  // The repository exposes no total and no conversion: the two
  // amounts stay separate rows with separate currencies.
  const currencies = getDb()
    .prepare(
      `SELECT DISTINCT cost_currency FROM project_task_ai_options WHERE cost_currency IS NOT NULL ORDER BY cost_currency`
    )
    .all()
    .map((row) => row.cost_currency);

  assertDeepEqual(currencies, ["CNY", "USD"], "both currencies coexist untouched");
});

check("19. invalid min/max ranges are rejected by the service", () => {
  expectServiceError(
    () =>
      plannerService.createProject({
        name: "Bad budget",
        budgetMinMicros: 900,
        budgetMaxMicros: 100,
        budgetCurrency: "USD",
      }),
    "INVALID_BUDGET_RANGE"
  );

  expectServiceError(
    () =>
      plannerService.createProjectTask({
        planId: PLAN_A.id,
        name: "Bad tokens",
        category: "coding",
        complexity: "low",
        estimatedInputTokensMin: 900,
        estimatedInputTokensMax: 100,
      }),
    "INVALID_TOKEN_RANGE"
  );

  expectServiceError(
    () =>
      plannerService.createProjectTaskAiOption({
        projectTaskId: PT_2.id,
        modelId: "provider_smoke_b_model_1",
        costMinMicros: 900,
        costMaxMicros: 100,
        costCurrency: "USD",
      }),
    "INVALID_COST_RANGE"
  );

  expectServiceError(
    () =>
      plannerService.createProjectTaskAiOption({
        projectTaskId: PT_2.id,
        modelId: "provider_smoke_b_model_1",
        timeMinMinutes: 90,
        timeMaxMinutes: 10,
      }),
    "INVALID_TIME_RANGE"
  );

  expectServiceError(
    () =>
      plannerService.createProject({
        name: "Half budget",
        budgetMinMicros: 100,
      }),
    "INCOMPLETE_COST"
  );
});

check("20. negative values are rejected by the service", () => {
  expectServiceError(
    () =>
      plannerService.createProject({
        name: "Negative budget",
        budgetMinMicros: -1,
        budgetMaxMicros: 100,
        budgetCurrency: "USD",
      }),
    "NEGATIVE_VALUE"
  );

  expectServiceError(
    () =>
      plannerService.createProject({
        name: "Negative deadline",
        deadlineDays: -1,
      }),
    "NEGATIVE_VALUE"
  );

  expectServiceError(
    () =>
      plannerService.createProjectTask({
        planId: PLAN_A.id,
        name: "Negative tokens",
        category: "coding",
        complexity: "low",
        estimatedOutputTokensMin: -5,
      }),
    "NEGATIVE_VALUE"
  );

  expectServiceError(
    () =>
      plannerService.createProjectTaskAiOption({
        projectTaskId: PT_2.id,
        modelId: "provider_smoke_b_model_1",
        costMinMicros: -1,
        costMaxMicros: 10,
        costCurrency: "USD",
      }),
    "NEGATIVE_VALUE"
  );

  expectServiceError(
    () =>
      plannerService.createProjectTaskAiOption({
        projectTaskId: PT_2.id,
        modelId: "provider_smoke_b_model_1",
        timeMinMinutes: -1,
      }),
    "NEGATIVE_VALUE"
  );
});

check("21. enums are fixed and fit_status is a capability-fit fact with exactly three states", () => {
  // A dedicated planned task keeps this check independent of the
  // options other checks add elsewhere. Its required_capabilities
  // are the thing fit_status describes.
  const PT_ENUM = plannerService.createProjectTask({
    planId: PLAN_A_V2.id,
    name: "Enum validation",
    category: "research",
    complexity: "low",
    requiredCapabilities: '["vision"]',
  });

  const validFit = ["meets", "below_minimum", "unknown"];

  for (const [index, status] of validFit.entries()) {
    const option = plannerService.createProjectTaskAiOption({
      id: `opt_fit_${status}`,
      projectTaskId: PT_ENUM.id,
      modelId: [
        "provider_smoke_a_model_1",
        "provider_smoke_a_model_2",
        "provider_smoke_b_model_1",
      ][index],
      fitStatus: status,
    });

    assertEqual(option.fit_status, status, `fit_status ${status} is accepted`);
  }

  const storedStatuses = new Set(
    plannerRepository
      .listProjectTaskAiOptions(PT_ENUM.id)
      .map((option) => option.fit_status)
  );

  for (const status of validFit) {
    assert(storedStatuses.has(status), `fit_status ${status} was stored`);
  }

  expectServiceError(
    () =>
      plannerService.createProjectTaskAiOption({
        projectTaskId: PT_ENUM.id,
        modelId: "provider_smoke_b_model_1",
        fitStatus: "great",
      }),
    "INVALID_FIT_STATUS"
  );

  // fit_status describes the task requirement, not the money. A free
  // option can be below_minimum (missing a required capability) and an
  // expensive option can be meets. The service must never derive one
  // from the other.
  const cheapButUnfit = plannerService.createProjectTaskAiOption({
    projectTaskId: PT_ENUM.id,
    modelId: "provider_smoke_b_model_1",
    toolId: "tool_smoke_cli",
    costMinMicros: 0,
    costMaxMicros: 0,
    costCurrency: "USD",
    fitStatus: "below_minimum",
  });
  const dearButFitting = plannerService.createProjectTaskAiOption({
    projectTaskId: PT_ENUM.id,
    modelId: "provider_smoke_b_model_1",
    toolId: "tool_smoke_ide",
    costMinMicros: 90000000,
    costMaxMicros: 120000000,
    costCurrency: "USD",
    fitStatus: "meets",
  });

  assertEqual(
    cheapButUnfit.fit_status,
    "below_minimum",
    "a free option can still fail the capability requirement"
  );
  assertEqual(
    dearButFitting.fit_status,
    "meets",
    "an expensive option can still meet the capability requirement"
  );
  assert(
    cheapButUnfit.cost_min_micros < dearButFitting.cost_min_micros,
    "precondition: the unfit option really is the cheaper one"
  );

  const declaredStatuses = getDb()
    .prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'project_task_ai_options'`
    )
    .get().sql;

  assertEqual(
    (declaredStatuses.match(/'meets'/g) ?? []).length,
    1,
    "fit_status is declared exactly once in the DDL"
  );
  assert(!declaredStatuses.includes("'good'"), "no extra fit_status value");

  expectServiceError(
    () => plannerService.createProject({ name: "x", preference: "fastest" }),
    "INVALID_PREFERENCE"
  );
  expectServiceError(
    () => plannerService.createProjectPlan({ projectId: PROJECT_A.id, strategy: "cheapest" }),
    "INVALID_STRATEGY"
  );
  expectServiceError(
    () =>
      plannerService.createProjectTask({
        planId: PLAN_A.id,
        name: "x",
        category: "quantum",
        complexity: "low",
      }),
    "INVALID_CATEGORY"
  );
  expectServiceError(
    () =>
      plannerService.createProjectTask({
        planId: PLAN_A.id,
        name: "x",
        category: "coding",
        complexity: "extreme",
      }),
    "INVALID_COMPLEXITY"
  );
  expectServiceError(
    () => plannerService.updateProjectStatus(PROJECT_A.id, "finished"),
    "INVALID_PROJECT_STATUS"
  );
  expectServiceError(
    () => plannerService.updateProjectTaskStatus(PT_1.id, "blocked"),
    "INVALID_PROJECT_TASK_STATUS"
  );
});

check("22. required_capabilities round-trips as a JSON string", () => {
  const stored = plannerRepository.getProjectTask(PT_1.id);

  assertEqual(
    stored.required_capabilities,
    '["vision"]',
    "the exact JSON string is stored"
  );
  assertDeepEqual(
    JSON.parse(stored.required_capabilities),
    ["vision"],
    "it parses back to the original array"
  );

  const jsonTask = plannerService.createProjectTask({
    planId: PLAN_A_V2.id,
    name: "JSON round trip",
    category: "research",
    complexity: "low",
    requiredCapabilities: '["tools", "vision", "reasoning"]',
  });

  assertDeepEqual(
    JSON.parse(
      plannerRepository.getProjectTask(
        jsonTask.id
      ).required_capabilities
    ),
    ["tools", "vision", "reasoning"],
    "multi-entry array round trip"
  );

  assertEqual(
    plannerRepository.getProjectTask(
      jsonTask.id
    ).required_capabilities,
    '["tools", "vision", "reasoning"]',
    "no silent reformatting of the stored string"
  );

  expectServiceError(
    () =>
      plannerService.createProjectTask({
        planId: PLAN_A_V2.id,
        name: "Bad json",
        category: "research",
        complexity: "low",
        requiredCapabilities: "tools,vision",
      }),
    "INVALID_JSON"
  );

  expectServiceError(
    () =>
      plannerService.createProjectTask({
        planId: PLAN_A_V2.id,
        name: "Bad json 2",
        category: "research",
        complexity: "low",
        requiredCapabilities: '["tools", 7]',
      }),
    "INVALID_JSON"
  );
});

check("23. no estimated data reached usage_records or cost_records", () => {
  assertEqual(
    countRows("usage_records"),
    0,
    "the planner must never write usage_records"
  );
  assertEqual(
    countRows("cost_records"),
    0,
    "the planner must never write cost_records"
  );
  assertEqual(
    countRows("import_logs"),
    0,
    "no import side effects"
  );

  const optionColumns = columnsOf("project_task_ai_options");

  assert(
    !optionColumns.includes("usage_record_id"),
    "an option must not reference a usage record"
  );
  assert(
    !columnsOf("project_tasks").includes("task_session_id"),
    "a planned task must not own a session reference"
  );
  assert(
    !columnsOf("projects").some((column) => column.includes("cost")),
    "a project must not store a cost"
  );
});

check("24. the existing Task Session behaviour is unchanged", () => {
  // A planned task linked to an execution task must not create,
  // end or otherwise disturb a session.
  assertEqual(
    countRows("task_sessions"),
    0,
    "linking a planned task must not create a session"
  );

  plannerService.linkProjectTaskToExecutionTask(PT_2.id, EXEC_TASK_2);

  assertEqual(
    plannerRepository.getProjectTask(PT_2.id).task_id,
    EXEC_TASK_2,
    "linkProjectTaskToExecutionTask links the existing task"
  );
  assertEqual(
    countRows("task_sessions"),
    0,
    "still no session was created"
  );
  assertEqual(
    countRows("task_usage_records"),
    0,
    "no usage was attributed"
  );

  assertDeepEqual(
    plannerRepository
      .listProjectTasksByExecutionTask(EXEC_TASK_2)
      .map((task) => task.id),
    [PT_2.id],
    "the planned task is discoverable from the execution task"
  );

  // Unlinking keeps the planned step and only clears the pointer.
  plannerService.linkProjectTaskToExecutionTask(PT_2.id, null);
  assertEqual(
    plannerRepository.getProjectTask(PT_2.id).task_id,
    null,
    "unlink clears the pointer"
  );
  assert(
    plannerRepository.getProjectTask(PT_2.id) !== undefined,
    "the planned step survives being unlinked"
  );
  assertEqual(
    countRowsWhere("tasks", "WHERE id = ?", EXEC_TASK_2),
    1,
    "the execution task itself is untouched"
  );

  expectServiceError(
    () => plannerService.linkProjectTaskToExecutionTask(PT_2.id, "no-such-task"),
    "TASK_NOT_FOUND"
  );
});

check("25. the planner tables carry no scoring column", () => {
  for (const table of [
    "projects",
    "project_plans",
    "project_tasks",
    "project_task_ai_options",
  ]) {
    for (const column of columnsOf(table)) {
      for (const forbidden of [
        "score",
        "rank",
        "weight",
        "confidence",
        "quality",
      ]) {
        assert(
          !column.includes(forbidden),
          `${table}.${column} must not exist`
        );
      }
    }
  }
});

check("26. smoke test is fully isolated from the production and project databases", () => {
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
