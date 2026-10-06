/*
 * R3.5-A AI Productivity API smoke test.
 *
 * Every assertion goes through the real Next.js route handlers with
 * a real Request object, so the HTTP status codes and the JSON
 * bodies are what a client would actually receive. The report is
 * read through GET /api/planner/plans/[id]/productivity; fixtures
 * are built through the planner routes, the real task service and
 * the real usage/cost repositories.
 *
 * The database is an isolated, freshly-created temp file:
 * NODE_ENV=development plus a chdir to a temp directory happen
 * BEFORE any library module is loaded, so neither
 * data/ai-token-cost-monitor.db nor %APPDATA%\AI-Cost-Management is
 * ever opened for writing. seed:registry is never called.
 *
 * Every productivity GET is bracketed by a content hash of all
 * planner and execution tables, so a report that writes anything -
 * on either side of the boundary - fails the check it appeared in.
 */
import {
  existsSync,
  mkdtempSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
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

const productionFileSnapshot = snapshotRealDatabases();

const TEMP_DIR = mkdtempSync(
  path.join(tmpdir(), "v14c-planner-productivity-smoke-")
);

process.env.NODE_ENV = "development";
process.chdir(TEMP_DIR);

const { dbPath, getDb } = await import("../lib/db.ts");
const { initDb } = await import("../lib/schema.ts");
const taskService = await import(
  "../lib/services/task-service.ts"
);
const {
  insertUsageRecord,
} = await import("../lib/repositories/usage-repository.ts");
const {
  insertCostRecord,
} = await import("../lib/repositories/cost-repository.ts");
const {
  saveCombinationPlans,
} = await import("../lib/repositories/planner-repository.ts");

const projectsRoute = await import(
  "../app/api/planner/projects/route.ts"
);
const plansRoute = await import(
  "../app/api/planner/projects/[id]/plans/route.ts"
);
const planTasksRoute = await import(
  "../app/api/planner/plans/[id]/tasks/route.ts"
);
const aiOptionsRoute = await import(
  "../app/api/planner/tasks/[id]/ai-options/route.ts"
);
const selectRoute = await import(
  "../app/api/planner/tasks/[id]/ai-options/[optionId]/select/route.ts"
);
const productivityRoute = await import(
  "../app/api/planner/plans/[id]/productivity/route.ts"
);

let passed = 0;
let failed = 0;

/*
 * Checks may be synchronous or return a promise. Awaiting every
 * result is what stops a rejected promise from being counted as a
 * pass, so a broken assertion can never hide behind an async body.
 */
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
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
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

/* ---------------------------------------------------------------- */
/* Route invocation helpers                                         */
/* ---------------------------------------------------------------- */

const BASE = "http://localhost:3000";

async function call(
  handler,
  { method = "GET", url, body, params = {} }
) {
  const request = new Request(`${BASE}${url}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          body: JSON.stringify(body),
          headers: {
            "content-type": "application/json",
          },
        }),
  });

  const response = await handler(request, {
    params: Promise.resolve(params),
  });

  const text = await response.text();

  let parsed;

  try {
    parsed = text === "" ? null : JSON.parse(text);
  } catch {
    throw new Error(
      `response body is not JSON: ${text.slice(0, 200)}`
    );
  }

  return {
    status: response.status,
    body: parsed,
    contentType: response.headers.get("content-type"),
  };
}

const get = (handler, url, params) =>
  call(handler, { url, params });

const post = (handler, url, body, params) =>
  call(handler, {
    method: "POST",
    url,
    body,
    params,
  });

function expectError(response, status, code, label) {
  assertEqual(response.status, status, `${label} status`);
  assert(
    response.body !== null &&
      typeof response.body === "object",
    `${label} body must be an object`
  );
  assertEqual(
    typeof response.body.error,
    "string",
    `${label} must carry a message`
  );
  assert(
    response.body.error.length > 0,
    `${label} message must not be empty`
  );
  assertEqual(
    response.body.ok,
    undefined,
    `${label} must not report ok`
  );
  assertEqual(
    Object.keys(response.body)
      .sort()
      .join(","),
    "code,error",
    `${label} carries only the documented error fields`
  );
  assertEqual(response.body.code, code, `${label} code`);
}

/* ---------------------------------------------------------------- */
/* Zero-write bracket                                               */
/* ---------------------------------------------------------------- */

/*
 * A content hash of every planner and execution table. Each
 * productivity GET runs between two of these snapshots; any write on
 * either side of the boundary changes at least one hash and fails
 * the check that bracketed the call.
 */
const TRACKED_TABLES = [
  "providers",
  "models",
  "usage_records",
  "cost_records",
  "tasks",
  "task_sessions",
  "task_usage_records",
  "projects",
  "project_plans",
  "project_stages",
  "project_tasks",
  "project_task_ai_options",
  "plan_resource_assignments",
];

function snapshotTables() {
  const db = getDb();
  const parts = [];

  for (const table of TRACKED_TABLES) {
    const rows = db
      .prepare(`SELECT * FROM ${table} ORDER BY rowid`)
      .all();

    parts.push(
      `${table}|${createHash("sha256")
        .update(JSON.stringify(rows))
        .digest("hex")}`
    );
  }

  return parts.join("\n");
}

async function getProductivity(planId, label) {
  const before = snapshotTables();

  const response = await get(
    productivityRoute.GET,
    `/api/planner/plans/${planId}/productivity`,
    { id: planId }
  );

  const after = snapshotTables();

  assertEqual(
    after,
    before,
    `${label}: the productivity GET must not write anything`
  );

  return response;
}

/* ---------------------------------------------------------------- */
/* Fixtures                                                         */
/* ---------------------------------------------------------------- */

const NOW = "2026-10-01T00:00:00.000Z";

initDb();

getDb()
  .prepare(
    `INSERT INTO providers (id, name, created_at) VALUES (?, ?, ?)`
  )
  .run("provider_prod_provider", "Prod Provider", NOW);
getDb()
  .prepare(
    `INSERT INTO models (id, provider_id, name, created_at) VALUES (?, ?, ?, ?)`
  )
  .run(
    "provider_prod_provider_prod_model",
    "provider_prod_provider",
    "prod-model",
    NOW
  );

const EXEC_A = taskService.createTask({
  name: "Execution A",
}).id;
const EXEC_C = taskService.createTask({
  name: "Execution C",
}).id;

function seedUsage(
  id,
  source,
  accuracy,
  inputTokens,
  outputTokens
) {
  insertUsageRecord(
    {
      id,
      provider: "Prod Provider",
      model: "prod-model",
      timestamp: NOW,
      inputTokens,
      outputTokens,
      cachedTokens: 0,
      reasoningTokens: 0,
      source,
      accuracy,
      application: "smoke",
      project: "R3.5-A",
    },
    { ignoreDuplicate: true }
  );
}

function seedCost(
  id,
  usageRecordId,
  totalCostMicros,
  currency
) {
  insertCostRecord({
    id,
    usageRecordId,
    inputCostMicros: 0,
    outputCostMicros: totalCostMicros,
    cachedCostMicros: 0,
    reasoningCostMicros: 0,
    totalCostMicros,
    currency,
    pricingVersion: "smoke-R3.5-A",
    provenance: "source_reported",
  });
}

/*
 * Two reliable official records for execution task A, one reliable
 * CNY record for task C, and one unreliable record held back until
 * the check that turns task A's verified cost into null.
 */
seedUsage("u_a1", "official_api", "verified", 1000, 400);
seedUsage("u_a2", "official_api", "verified", 500, 400);
seedUsage("u_c1", "official_api", "verified", 500, 200);
seedUsage("u_unrel", "application", "estimated", 100, 50);

seedCost("c_a1", "u_a1", 50000, "USD");
seedCost("c_a2", "u_a2", 60000, "USD");
seedCost("c_c1", "u_c1", 70000, "CNY");
seedCost("c_unrel", "u_unrel", 90000, "USD");

function attributeToActiveSession(usageRecordId) {
  const result = taskService.autoAttributeUsageRecord({
    usageRecordId,
  });

  if (result !== "inserted") {
    throw new Error(
      `fixture: expected auto attribution "inserted" for ${usageRecordId}, got "${result}"`
    );
  }
}

const sessionA1 = taskService.startTaskSession({
  taskId: EXEC_A,
  sessionId: "prod-smoke-session-a1",
});
attributeToActiveSession("u_a1");
attributeToActiveSession("u_a2");
taskService.completeTaskSession({ sessionId: sessionA1.id });

const sessionC1 = taskService.startTaskSession({
  taskId: EXEC_C,
  sessionId: "prod-smoke-session-c1",
});
attributeToActiveSession("u_c1");
taskService.completeTaskSession({ sessionId: sessionC1.id });

const projectRes = await post(
  projectsRoute.POST,
  "/api/planner/projects",
  {
    name: "Productivity smoke project",
    goal: "verify the productivity HTTP contract",
    preference: "balanced",
  }
);

if (projectRes.status !== 201) {
  throw new Error(
    `fixture: project POST failed with ${projectRes.status}: ${JSON.stringify(projectRes.body)}`
  );
}

const PROJECT = projectRes.body.project;

const planRes = await post(
  plansRoute.POST,
  `/api/planner/projects/${PROJECT.id}/plans`,
  { strategy: "balanced", summary: "manual plan" },
  { id: PROJECT.id }
);

if (planRes.status !== 201) {
  throw new Error(
    `fixture: plan POST failed with ${planRes.status}: ${JSON.stringify(planRes.body)}`
  );
}

const PLAN_1 = planRes.body.plan;

const taskARes = await post(
  planTasksRoute.POST,
  `/api/planner/plans/${PLAN_1.id}/tasks`,
  {
    name: "Linked step A",
    category: "architecture",
    complexity: "medium",
    estimatedInputTokensMin: 1000,
    estimatedInputTokensMax: 3000,
    estimatedOutputTokensMin: 100,
    estimatedOutputTokensMax: 300,
    taskId: EXEC_A,
  },
  { id: PLAN_1.id }
);
const TASK_A = taskARes.body.task;

const taskBRes = await post(
  planTasksRoute.POST,
  `/api/planner/plans/${PLAN_1.id}/tasks`,
  {
    name: "Unlinked step B",
    category: "coding",
    complexity: "low",
  },
  { id: PLAN_1.id }
);
const TASK_B = taskBRes.body.task;

const taskCRes = await post(
  planTasksRoute.POST,
  `/api/planner/plans/${PLAN_1.id}/tasks`,
  {
    name: "Linked step C",
    category: "architecture",
    complexity: "low",
    taskId: EXEC_C,
  },
  { id: PLAN_1.id }
);
const TASK_C = taskCRes.body.task;

const optARes = await post(
  aiOptionsRoute.POST,
  `/api/planner/tasks/${TASK_A.id}/ai-options`,
  {
    modelId: "provider_prod_provider_prod_model",
    costMinMicros: 100000,
    costMaxMicros: 400000,
    costCurrency: "USD",
    timeMinMinutes: 5,
    timeMaxMinutes: 30,
    fitStatus: "meets",
  },
  { id: TASK_A.id }
);
const OPT_A = optARes.body.option;

const optCRes = await post(
  aiOptionsRoute.POST,
  `/api/planner/tasks/${TASK_C.id}/ai-options`,
  {
    modelId: "provider_prod_provider_prod_model",
    costMinMicros: 100000,
    costMaxMicros: 400000,
    costCurrency: "USD",
    timeMinMinutes: 5,
    timeMaxMinutes: 30,
    fitStatus: "meets",
  },
  { id: TASK_C.id }
);
const OPT_C = optCRes.body.option;

const selectARes = await post(
  selectRoute.POST,
  `/api/planner/tasks/${TASK_A.id}/ai-options/${OPT_A.id}/select`,
  undefined,
  { id: TASK_A.id, optionId: OPT_A.id }
);
const selectCRes = await post(
  selectRoute.POST,
  `/api/planner/tasks/${TASK_C.id}/ai-options/${OPT_C.id}/select`,
  undefined,
  { id: TASK_C.id, optionId: OPT_C.id }
);

if (
  selectARes.status !== 200 ||
  selectCRes.status !== 200
) {
  throw new Error(
    `fixture: select failed with ${selectARes.status}/${selectCRes.status}`
  );
}

/*
 * A combination plan owns no project_tasks rows: it persists
 * assignments that reference the source plan's steps. saveCombinationPlans
 * writes that shape directly so the report's cross-plan union is
 * covered without running the combination evaluation.
 */
const COMBO_PLAN_ID = "prod-smoke-combo-plan";

saveCombinationPlans({
  projectId: PROJECT.id,
  createdAt: NOW,
  plans: [
    {
      id: COMBO_PLAN_ID,
      strategy: "cost_first",
      summary: "combo",
      pricingBasisAt: NOW,
      assignments: [
        {
          id: "prod-smoke-assignment-1",
          planId: COMBO_PLAN_ID,
          projectTaskId: TASK_A.id,
          resourceSource: "registry",
          registryModelId: "provider_prod_provider_prod_model",
          role: "implementer",
          roleSource: "default_from_category",
          sequence: 1,
          plannedCostMinMicros: 100000,
          plannedCostMaxMicros: 400000,
          plannedCostCurrency: "USD",
          plannedTimeMinMinutes: 5,
          plannedTimeMaxMinutes: 30,
          fitStatus: "meets",
          createdAt: NOW,
        },
      ],
    },
  ],
});

/* ---------------------------------------------------------------- */
/* Checks                                                           */
/* ---------------------------------------------------------------- */

let mainBody = null;

await check(
  "1. GET productivity returns 200 with the report envelope (zero-write bracketed)",
  async () => {
    const res = await getProductivity(
      PLAN_1.id,
      "check 1"
    );

    assertEqual(res.status, 200, "status");
    assertEqual(res.body.ok, true, "ok");
    assert(
      (res.contentType ?? "").includes("application/json"),
      "content-type is json"
    );

    for (const key of [
      "plan",
      "tasks",
      "summary",
      "context",
    ]) {
      assert(
        key in res.body,
        `the envelope carries ${key}`
      );
    }

    assertEqual(
      res.body.plan.id,
      PLAN_1.id,
      "plan id"
    );
    assertEqual(
      res.body.plan.projectId,
      PROJECT.id,
      "plan projectId"
    );
    assertEqual(
      res.body.plan.strategy,
      "balanced",
      "plan strategy"
    );
    assert(
      Array.isArray(res.body.tasks),
      "tasks is an array"
    );
    assert(
      Array.isArray(res.body.tasks) &&
        res.body.tasks.length === 3,
      "three planned steps"
    );

    mainBody = res.body;
  }
);

await check("2. task rows are complete and sequence-ordered", () => {
  assert(mainBody !== null, "check 1 ran first");

  const [rowA, rowB, rowC] = mainBody.tasks;

  assertEqual(rowA.projectTaskId, TASK_A.id, "row A");
  assertEqual(rowB.projectTaskId, TASK_B.id, "row B");
  assertEqual(rowC.projectTaskId, TASK_C.id, "row C");
  assertEqual(rowA.sequence, 1, "sequence A");
  assertEqual(rowB.sequence, 2, "sequence B");
  assertEqual(rowC.sequence, 3, "sequence C");
  assertEqual(rowA.name, "Linked step A", "name A");
  assertEqual(rowB.taskPlanId, PLAN_1.id, "taskPlanId B");
  assertEqual(
    rowA.executionTaskId,
    EXEC_A,
    "execution link A"
  );
  assertEqual(
    rowB.executionTaskId,
    null,
    "execution link B"
  );
  assertEqual(
    rowC.executionTaskId,
    EXEC_C,
    "execution link C"
  );
});

await check("3. an unlinked step reports null actual and unknown deltas", () => {
  const rowB = mainBody.tasks[1];

  assertEqual(
    rowB.coverage.linked,
    false,
    "coverage.linked"
  );
  assertEqual(
    rowB.coverage.hasSessions,
    false,
    "coverage.hasSessions"
  );
  assertEqual(
    rowB.coverage.verifiedCostAvailable,
    false,
    "coverage.verifiedCostAvailable"
  );
  assertEqual(rowB.actual, null, "actual is null");
  assertEqual(
    rowB.deltas.inputTokens,
    "unknown",
    "deltas.inputTokens"
  );
  assertEqual(
    rowB.deltas.outputTokens,
    "unknown",
    "deltas.outputTokens"
  );
  assertEqual(
    rowB.deltas.sessionMinutesVsPlan,
    "unknown",
    "deltas.sessionMinutesVsPlan"
  );
  assertEqual(
    rowB.deltas.cost.currencyMatches,
    false,
    "deltas.cost.currencyMatches"
  );
  assertEqual(
    rowB.deltas.cost.rangeCheck,
    "unknown",
    "deltas.cost.rangeCheck"
  );
});

await check("4. linked step A reports sessions and auto attribution", () => {
  const rowA = mainBody.tasks[0];

  assertEqual(
    rowA.coverage.linked,
    true,
    "coverage.linked"
  );
  assertEqual(
    rowA.coverage.hasSessions,
    true,
    "coverage.hasSessions"
  );
  assertEqual(rowA.actual.sessions.count, 1, "sessions");
  assertEqual(
    rowA.actual.sessions.completed,
    1,
    "completed"
  );
  assertEqual(
    rowA.actual.sessions.abandoned,
    0,
    "abandoned"
  );
  assertEqual(rowA.actual.sessions.active, 0, "active");
  assertEqual(
    rowA.actual.sessions.activeSessionMs,
    null,
    "activeSessionMs"
  );
  assertEqual(
    rowA.actual.attribution.auto,
    2,
    "attribution auto"
  );
  assertEqual(
    rowA.actual.attribution.manual,
    0,
    "attribution manual"
  );
  assertEqual(
    rowA.actual.attribution.total,
    2,
    "attribution total"
  );
});

await check("5. linked step A tokens and model mix match the fixtures", () => {
  const rowA = mainBody.tasks[0];

  assertEqual(rowA.actual.tokens.input, 1500, "input");
  assertEqual(rowA.actual.tokens.output, 800, "output");
  assertEqual(rowA.actual.tokens.cached, 0, "cached");
  assertEqual(
    rowA.actual.tokens.reasoning,
    0,
    "reasoning"
  );
  assertEqual(
    rowA.actual.modelMix.length,
    1,
    "one model in the mix"
  );
  assertEqual(
    rowA.actual.modelMix[0].provider,
    "Prod Provider",
    "mix provider"
  );
  assertEqual(
    rowA.actual.modelMix[0].records,
    2,
    "mix records"
  );
});

await check("6. step A verified cost is the official single-currency sum", () => {
  const rowA = mainBody.tasks[0];

  assert(
    rowA.actual.verifiedCost !== null,
    "verified cost is available"
  );
  assertEqual(
    rowA.actual.verifiedCost.amountMicros,
    110000,
    "amountMicros"
  );
  assertEqual(
    rowA.actual.verifiedCost.currency,
    "USD",
    "currency"
  );
  assertEqual(
    rowA.coverage.verifiedCostAvailable,
    true,
    "coverage.verifiedCostAvailable"
  );
});

await check("7. step A deltas: within / above / below / within-USD", () => {
  const rowA = mainBody.tasks[0];

  assertEqual(
    rowA.deltas.inputTokens,
    "within",
    "inputTokens"
  );
  assertEqual(
    rowA.deltas.outputTokens,
    "above",
    "outputTokens"
  );
  assertEqual(
    rowA.deltas.sessionMinutesVsPlan,
    "below",
    "sessionMinutesVsPlan"
  );
  assertEqual(
    rowA.deltas.cost.currencyMatches,
    true,
    "cost.currencyMatches"
  );
  assertEqual(
    rowA.deltas.cost.rangeCheck,
    "within",
    "cost.rangeCheck"
  );
});

await check("8. step C mixes a CNY verified cost with a USD plan (no arithmetic)", () => {
  const rowC = mainBody.tasks[2];

  assertEqual(
    rowC.actual.tokens.input,
    500,
    "input"
  );
  assertEqual(
    rowC.actual.tokens.output,
    200,
    "output"
  );
  assert(
    rowC.actual.verifiedCost !== null,
    "verified cost is available"
  );
  assertEqual(
    rowC.actual.verifiedCost.currency,
    "CNY",
    "actual currency"
  );
  assertEqual(
    rowC.deltas.inputTokens,
    "unknown",
    "no estimate means unknown"
  );
  assertEqual(
    rowC.deltas.outputTokens,
    "unknown",
    "no estimate means unknown"
  );
  assertEqual(
    rowC.deltas.cost.currencyMatches,
    false,
    "currencies differ"
  );
  assertEqual(
    rowC.deltas.cost.rangeCheck,
    "unknown",
    "cross-currency never computes"
  );
  assert(
    rowC.planned.selectedOption !== null,
    "the selected option is reported as the user's decision"
  );
  assertEqual(
    rowC.planned.selectedOption.estimatedCostCurrency,
    "USD",
    "planned currency"
  );
});

await check("9. summary totals and unattributed context", () => {
  assertEqual(
    mainBody.summary.taskCount,
    3,
    "taskCount"
  );
  assertEqual(
    mainBody.summary.linkedCount,
    2,
    "linkedCount"
  );
  assertEqual(
    mainBody.summary.withSessionsCount,
    2,
    "withSessionsCount"
  );
  assertEqual(
    mainBody.summary.verifiedCostCount,
    2,
    "verifiedCostCount"
  );
  assertEqual(
    mainBody.summary.totalTokens.input,
    2000,
    "total input"
  );
  assertEqual(
    mainBody.summary.totalTokens.output,
    1000,
    "total output"
  );
  assertEqual(
    mainBody.context.unattributedUsageRecords,
    1,
    "u_unrel is still unattributed"
  );
});

await check("10. the report carries no score, rank or recommendation", async () => {
  const res = await getProductivity(PLAN_1.id, "check 10");

  const serialized = JSON.stringify(res.body);

  for (const forbidden of [
    "score",
    "rank",
    "recommend",
    "isPrimary",
    "is_primary",
  ]) {
    assert(
      !serialized.includes(forbidden),
      `the body must not contain "${forbidden}"`
    );
  }

  const row = res.body.tasks[0];

  for (const key of [
    "score",
    "rank",
    "recommendation",
    "isPrimary",
  ]) {
    assert(
      !(key in row),
      `a task row must not carry "${key}"`
    );
  }
});

await check("11. an unknown plan maps to the PLAN_NOT_FOUND 404 envelope", async () => {
  const res = await getProductivity(
    "no-such-plan",
    "check 11"
  );

  expectError(res, 404, "PLAN_NOT_FOUND", "404 body");
});

await check("12. a combination plan reports source steps with their assignment", async () => {
  const res = await getProductivity(
    COMBO_PLAN_ID,
    "check 12"
  );

  assertEqual(res.status, 200, "status");
  assertEqual(res.body.ok, true, "ok");
  assertEqual(
    res.body.plan.strategy,
    "cost_first",
    "strategy"
  );
  assertEqual(
    res.body.plan.version,
    2,
    "the combination plan is version 2"
  );
  assertEqual(
    res.body.tasks.length,
    1,
    "one source step"
  );

  const row = res.body.tasks[0];

  assertEqual(
    row.projectTaskId,
    TASK_A.id,
    "the source step"
  );
  assertEqual(
    row.taskPlanId,
    PLAN_1.id,
    "owned by the source plan"
  );
  assertEqual(
    row.coverage.linked,
    true,
    "still linked"
  );
  assert(
    row.planned.assignment !== null,
    "the assignment is reported"
  );
  assertEqual(
    row.planned.assignment.role,
    "implementer",
    "role"
  );
  assertEqual(
    row.planned.assignment.plannedCostCurrency,
    "USD",
    "assignment currency"
  );
  assertEqual(
    row.planned.assignment.plannedCostMicros.min,
    100000,
    "cost min"
  );
  assertEqual(
    row.planned.assignment.plannedCostMicros.max,
    400000,
    "cost max"
  );
  assertEqual(
    row.planned.assignment.plannedTimeMinutes.min,
    5,
    "time min"
  );
  assertEqual(
    row.planned.assignment.resource.resourceSource,
    "registry",
    "resource source"
  );
  assertEqual(
    row.planned.assignment.resource.registryModelId,
    "provider_prod_provider_prod_model",
    "registry model"
  );
  assertEqual(
    row.deltas.sessionMinutesVsPlan,
    "below",
    "instant sessions fall under the planned range"
  );
  assertEqual(
    row.deltas.cost.currencyMatches,
    true,
    "same currency"
  );
  assertEqual(
    row.deltas.cost.rangeCheck,
    "within",
    "verified total inside the planned range"
  );
});

await check("13. one unreliable record turns step A verified cost into null", async () => {
  const sessionA2 = taskService.startTaskSession({
    taskId: EXEC_A,
    sessionId: "prod-smoke-session-a2",
  });
  attributeToActiveSession("u_unrel");
  taskService.completeTaskSession({
    sessionId: sessionA2.id,
  });

  const res = await getProductivity(
    PLAN_1.id,
    "check 13"
  );

  assertEqual(res.status, 200, "status");

  const rowA = res.body.tasks[0];

  assertEqual(
    rowA.actual.verifiedCost,
    null,
    "verified cost is unavailable, not an estimate"
  );
  assertEqual(
    rowA.coverage.verifiedCostAvailable,
    false,
    "coverage says so"
  );
  assertEqual(
    rowA.actual.attribution.auto,
    3,
    "the unreliable record is attributed too"
  );
  assertEqual(
    rowA.actual.tokens.input,
    1600,
    "tokens still add up"
  );
  assertEqual(
    rowA.deltas.cost.currencyMatches,
    false,
    "no cost comparison without a verified total"
  );
  assertEqual(
    rowA.deltas.cost.rangeCheck,
    "unknown",
    "no cost comparison without a verified total"
  );
  assertEqual(
    res.body.context.unattributedUsageRecords,
    0,
    "nothing is unattributed now"
  );
  assertEqual(
    res.body.summary.verifiedCostCount,
    1,
    "only step C keeps its verified cost"
  );
  assertEqual(
    res.body.summary.totalTokens.input,
    2100,
    "totals include the new record"
  );
});

await check("14. the smoke run never touched the real databases", () => {
  const normalized = path.normalize(TEMP_DIR);

  assert(
    dbPath.startsWith(normalized),
    `dbPath ${dbPath} is not under the temp dir ${TEMP_DIR}`
  );

  const after = snapshotRealDatabases();

  assert(
    JSON.stringify(after) ===
      JSON.stringify(productionFileSnapshot),
    "production database files changed during the smoke test"
  );
});

console.log("");
console.log(`ts-smoke: ${passed} passed, ${failed} failed`);
console.log(`isolated db: ${dbPath}`);
console.log(`temp dir kept for inspection: ${TEMP_DIR}`);

if (failed > 0) {
  process.exit(1);
}

/*
 * Both real databases are fingerprinted before the run and again at
 * the end. Nothing in this smoke may touch either of them, and the
 * temp-dir chdir above is what keeps that true.
 */
function snapshotRealDatabases() {
  const projectDataDir = path.resolve(DIR, "..", "data");

  const dataDirs = [projectDataDir];

  if (process.env.APPDATA) {
    dataDirs.push(
      path.join(
        process.env.APPDATA,
        "AI-Cost-Management",
        "data"
      )
    );
  }

  const suffixes = ["", "-wal", "-shm"];

  const files = [];

  for (const dir of dataDirs) {
    for (const suffix of suffixes) {
      files.push(
        path.join(dir, `ai-token-cost-monitor.db${suffix}`)
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
