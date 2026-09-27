/*
 * v1.4-C AI Project Planner API smoke test.
 *
 * Every assertion here goes through the real Next.js route handlers
 * (app/api/planner/**\/route.ts) with a real Request object, so the
 * HTTP status codes and the JSON bodies are what a client would
 * actually receive. Nothing calls the service directly.
 *
 * The database is an isolated, freshly-created temp file:
 * NODE_ENV=development plus a chdir to a temp directory happen
 * BEFORE any library module is loaded, so neither
 * data/ai-token-cost-monitor.db nor %APPDATA%\AI-Cost-Management is
 * ever opened for writing. seed:registry is never called.
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

const productionFileSnapshot = snapshotRealDatabases();

const TEMP_DIR = mkdtempSync(path.join(tmpdir(), "v14c-planner-api-smoke-"));

process.env.NODE_ENV = "development";
process.chdir(TEMP_DIR);

const { dbPath, getDb } = await import("../lib/db.ts");
const { initDb } = await import("../lib/schema.ts");
const { createTask } = await import("../lib/services/task-service.ts");
const {
  createUserAiTool,
} = await import("../lib/registry/ai-registry-repository.ts");

const projectsRoute = await import(
  "../app/api/planner/projects/route.ts"
);
const projectRoute = await import(
  "../app/api/planner/projects/[id]/route.ts"
);
const plansRoute = await import(
  "../app/api/planner/projects/[id]/plans/route.ts"
);
const planRoute = await import(
  "../app/api/planner/plans/[id]/route.ts"
);
const planTasksRoute = await import(
  "../app/api/planner/plans/[id]/tasks/route.ts"
);
const taskRoute = await import(
  "../app/api/planner/tasks/[id]/route.ts"
);
const aiOptionsRoute = await import(
  "../app/api/planner/tasks/[id]/ai-options/route.ts"
);
const selectRoute = await import(
  "../app/api/planner/tasks/[id]/ai-options/[optionId]/select/route.ts"
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

/*
 * Calls a route handler and returns { status, body }. The handler
 * returns a real NextResponse, so this is the same object a browser
 * would receive.
 */
async function call(
  handler,
  { method = "GET", url, body, params = {} }
) {
  const request = new Request(
    `${BASE}${url}`,
    {
      method,
      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(body),
            headers: {
              "content-type": "application/json",
            },
          }),
    }
  );

  const response = await handler(
    request,
    {
      params: Promise.resolve(params),
    }
  );

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
    contentType:
      response.headers.get(
        "content-type"
      ),
  };
}

const get = (handler, url, params) =>
  call(handler, {
    url,
    params,
  });

const post = (handler, url, body, params) =>
  call(handler, {
    method: "POST",
    url,
    body,
    params,
  });

const patch = (handler, url, body, params) =>
  call(handler, {
    method: "PATCH",
    url,
    body,
    params,
  });

/*
 * Asserts the shared error envelope: { error, code } with the
 * expected status.
 */
function expectError(response, status, code, label) {
  assertEqual(
    response.status,
    status,
    `${label} status`
  );
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
    code === undefined ? "error" : "code,error",
    `${label} carries only the documented error fields`
  );

  if (code !== undefined) {
    assertEqual(
      response.body.code,
      code,
      `${label} code`
    );
  }
}

function columnsOf(name) {
  return getDb()
    .prepare(`PRAGMA table_info(${name})`)
    .all()
    .map((column) => column.name);
}

function countRows(name) {
  return Number(
    getDb()
      .prepare(`SELECT COUNT(*) AS total FROM ${name}`)
      .get().total
  );
}

/* ---------------------------------------------------------------- */
/* Fixtures: 2 providers, 3 models, 2 tools, 2 execution tasks      */
/* ---------------------------------------------------------------- */

const NOW = "2026-09-27T00:00:00.000Z";

initDb();

getDb()
  .prepare(
    `INSERT INTO providers (id, name, created_at) VALUES (?, ?, ?)`
  )
  .run("provider_api_a", "API Provider A", NOW);
getDb()
  .prepare(
    `INSERT INTO providers (id, name, created_at) VALUES (?, ?, ?)`
  )
  .run("provider_api_b", "API Provider B", NOW);

for (const [id, providerId] of [
  ["provider_api_a_model_1", "provider_api_a"],
  ["provider_api_a_model_2", "provider_api_a"],
  ["provider_api_b_model_1", "provider_api_b"],
]) {
  getDb()
    .prepare(
      `INSERT INTO models (id, provider_id, name, created_at) VALUES (?, ?, ?, ?)`
    )
    .run(id, providerId, id, NOW);
}

createUserAiTool({
  id: "tool_api_cli",
  name: "API CLI",
  category: "cli",
  createdAt: NOW,
});
createUserAiTool({
  id: "tool_api_ide",
  name: "API IDE",
  category: "ide",
  createdAt: NOW,
});

const EXEC_TASK_1 = createTask({
  name: "API execution task 1",
}).id;

/* ---------------------------------------------------------------- */
/* Shared fixtures built through the API itself                     */
/* ---------------------------------------------------------------- */

const projectRes = await post(
  projectsRoute.POST,
  "/api/planner/projects",
  {
    name: "API smoke project",
    goal: "verify the planner HTTP contract",
    preference: "balanced",
    budgetMinMicros: 1000000,
    budgetMaxMicros: 5000000,
    budgetCurrency: "USD",
    deadlineDays: 14,
  }
);

const PROJECT = projectRes.body.project;

const plan1Res = await post(
  plansRoute.POST,
  `/api/planner/projects/${PROJECT.id}/plans`,
  {
    strategy: "balanced",
    summary: "v1",
  },
  { id: PROJECT.id }
);
const PLAN_1 = plan1Res.body.plan;

const plan2Res = await post(
  plansRoute.POST,
  `/api/planner/projects/${PROJECT.id}/plans`,
  { strategy: "cost_first" },
  { id: PROJECT.id }
);
const PLAN_2 = plan2Res.body.plan;

const task1Res = await post(
  planTasksRoute.POST,
  `/api/planner/plans/${PLAN_1.id}/tasks`,
  {
    name: "Design the contract",
    category: "architecture",
    complexity: "medium",
    requiredCapabilities: '["tools"]',
    estimatedInputTokensMin: 1000,
    estimatedInputTokensMax: 5000,
  },
  { id: PLAN_1.id }
);
const TASK_1 = task1Res.body.task;

const task2Res = await post(
  planTasksRoute.POST,
  `/api/planner/plans/${PLAN_1.id}/tasks`,
  {
    name: "Write the route",
    category: "coding",
    complexity: "high",
    taskId: EXEC_TASK_1,
  },
  { id: PLAN_1.id }
);
const TASK_2 = task2Res.body.task;

const opt1Res = await post(
  aiOptionsRoute.POST,
  `/api/planner/tasks/${TASK_1.id}/ai-options`,
  {
    modelId: "provider_api_a_model_1",
    costMinMicros: 100000,
    costMaxMicros: 400000,
    costCurrency: "USD",
    timeMinMinutes: 5,
    timeMaxMinutes: 30,
    fitStatus: "meets",
    pricingBasis: "official price card",
  },
  { id: TASK_1.id }
);
const OPT_1 = opt1Res.body.option;

const opt2Res = await post(
  aiOptionsRoute.POST,
  `/api/planner/tasks/${TASK_1.id}/ai-options`,
  {
    modelId: "provider_api_a_model_2",
    toolId: "tool_api_cli",
    costMinMicros: 50000,
    costMaxMicros: 90000,
    costCurrency: "CNY",
    timeMinMinutes: 3,
    timeMaxMinutes: 12,
    fitStatus: "below_minimum",
  },
  { id: TASK_1.id }
);
const OPT_2 = opt2Res.body.option;

const opt3Res = await post(
  aiOptionsRoute.POST,
  `/api/planner/tasks/${TASK_1.id}/ai-options`,
  { modelId: "provider_api_b_model_1" },
  { id: TASK_1.id }
);
const OPT_3 = opt3Res.body.option;

/* ---------------------------------------------------------------- */

await check("1. POST /api/planner/projects returns 201 with a server-built project", () => {
  assertEqual(
    projectRes.status,
    201,
    "status"
  );
  assertEqual(projectRes.body.ok, true, "ok");
  assert(
    typeof projectRes.body.project?.id === "string" &&
      projectRes.body.project.id.length > 0,
    "the server generated an id"
  );
  assertEqual(
    projectRes.body.project.status,
    "planning",
    "status always starts at planning"
  );
  assertEqual(
    projectRes.body.project.budget_currency,
    "USD",
    "the budget is stored as sent"
  );
  assert(
    typeof projectRes.body.project.created_at === "string",
    "the server generated created_at"
  );
  assert(
    typeof projectRes.body.project.updated_at === "string",
    "the server generated updated_at"
  );
  assert(
    (projectRes.contentType ?? "").includes(
      "application/json"
    ),
    "content-type is json"
  );
});

await check("2. GET /api/planner/projects lists projects", () => {
  return get(
    projectsRoute.GET,
    "/api/planner/projects"
  ).then((res) => {
    assertEqual(res.status, 200, "status");
    assertEqual(res.body.ok, true, "ok");
    assert(
      Array.isArray(res.body.items),
      "items must be an array"
    );
    assert(
      res.body.items.some(
        (item) => item.id === PROJECT.id
      ),
      "the created project is listed"
    );
  });
});

await check("3. GET /api/planner/projects?status= filters, and an unknown value is 400", () => {
  return get(
    projectsRoute.GET,
    "/api/planner/projects?status=planning"
  ).then((res) => {
    assertEqual(res.status, 200, "status");
    assertEqual(
      res.body.items.length,
      1,
      "one planning project"
    );
  });
});

await check("4. invalid project status query returns 400", () => {
  return get(
    projectsRoute.GET,
    "/api/planner/projects?status=frozen"
  ).then((res) => {
    expectError(
      res,
      400,
      "INVALID_QUERY",
      "invalid status query"
    );
  });
});

await check("5. GET /api/planner/projects/[id] returns the project alone", () => {
  return get(
    projectRoute.GET,
    `/api/planner/projects/${PROJECT.id}`,
    { id: PROJECT.id }
  ).then((res) => {
    assertEqual(res.status, 200, "status");
    assertEqual(res.body.ok, true, "ok");
    assertEqual(
      res.body.project.id,
      PROJECT.id,
      "project id"
    );

    /*
     * The detail endpoint is deliberately not an aggregate: plans,
     * tasks and options each have their own endpoint.
     */
    for (const key of [
      "plans",
      "tasks",
      "options",
      "ai_options",
      "current_plan",
    ]) {
      assert(
        !(key in res.body),
        `GET project must not embed "${key}"`
      );
    }

    assert(
      !("total_cost_micros" in res.body.project),
      "a project must not carry a computed total"
    );
  });
});

await check("6. PATCH /api/planner/projects/[id] updates only the fields it is sent", () => {
  return patch(
    projectRoute.PATCH,
    `/api/planner/projects/${PROJECT.id}`,
    {
      description: "updated through the API",
      preference: "time_first",
    },
    { id: PROJECT.id }
  ).then((res) => {
    assertEqual(res.status, 200, "status");
    assertEqual(
      res.body.project.description,
      "updated through the API",
      "description updated"
    );
    assertEqual(
      res.body.project.preference,
      "time_first",
      "preference updated"
    );
    assertEqual(
      res.body.project.name,
      PROJECT.name,
      "an unsent field is untouched"
    );
    assertEqual(
      res.body.project.budget_min_micros,
      PROJECT.budget_min_micros,
      "an unsent budget field is untouched"
    );
  });
});

await check("7. the first plan is version 1, the second 2, the third 3", () => {
  assertEqual(plan1Res.status, 201, "first plan status");
  assertEqual(PLAN_1.version, 1, "first plan version");

  assertEqual(plan2Res.status, 201, "second plan status");
  assertEqual(PLAN_2.version, 2, "second plan version");

  return post(
    plansRoute.POST,
    `/api/planner/projects/${PROJECT.id}/plans`,
    { strategy: "time_first" },
    { id: PROJECT.id }
  ).then((res) => {
    assertEqual(res.status, 201, "third plan status");
    assertEqual(
      res.body.plan.version,
      3,
      "third plan version"
    );
    assertEqual(
      res.body.plan.project_id,
      PROJECT.id,
      "the plan belongs to the project"
    );
  });
});

await check("8. the client cannot control the plan version", () => {
  return post(
    plansRoute.POST,
    `/api/planner/projects/${PROJECT.id}/plans`,
    {
      strategy: "balanced",
      version: 99,
    },
    { id: PROJECT.id }
  ).then((res) => {
    expectError(
      res,
      400,
      "UNKNOWN_FIELD",
      "version in the body"
    );
  });
});

await check("9. a second project restarts at version 1", () => {
  return post(
    projectsRoute.POST,
    "/api/planner/projects",
    { name: "Version scope project" }
  ).then((created) => {
    const other = created.body.project;

    return post(
      plansRoute.POST,
      `/api/planner/projects/${other.id}/plans`,
      { strategy: "balanced" },
      { id: other.id }
    ).then((res) => {
      assertEqual(
        res.body.plan.version,
        1,
        "versions are per project, not global"
      );
    });
  });
});

await check("10. GET /api/planner/projects/[id]/plans lists versions in order", () => {
  return get(
    plansRoute.GET,
    `/api/planner/projects/${PROJECT.id}/plans`,
    { id: PROJECT.id }
  ).then((res) => {
    assertEqual(res.status, 200, "status");
    assertEqual(
      res.body.items.length,
      3,
      "three plan versions"
    );
    assertEqual(
      res.body.items
        .map((plan) => plan.version)
        .join(","),
      "1,2,3",
      "versions come back oldest first"
    );
  });
});

await check("11. GET /api/planner/plans/[id] returns one plan", () => {
  return get(
    planRoute.GET,
    `/api/planner/plans/${PLAN_1.id}`,
    { id: PLAN_1.id }
  ).then((res) => {
    assertEqual(res.status, 200, "status");
    assertEqual(res.body.ok, true, "ok");
    assertEqual(
      res.body.plan.id,
      PLAN_1.id,
      "plan id"
    );
    assertEqual(
      res.body.plan.version,
      1,
      "plan version"
    );
  });
});

await check("12. the first planned task is sequence 1, the second 2", () => {
  assertEqual(task1Res.status, 201, "first task status");
  assertEqual(TASK_1.sequence, 1, "first task sequence");

  assertEqual(task2Res.status, 201, "second task status");
  assertEqual(TASK_2.sequence, 2, "second task sequence");
});

await check("13. the client cannot control the sequence", () => {
  return post(
    planTasksRoute.POST,
    `/api/planner/plans/${PLAN_1.id}/tasks`,
    {
      name: "Sequence attempt",
      category: "coding",
      complexity: "low",
      sequence: 99,
    },
    { id: PLAN_1.id }
  ).then((res) => {
    expectError(
      res,
      400,
      "UNKNOWN_FIELD",
      "sequence in the body"
    );
  });
});

await check("14. GET /api/planner/plans/[id]/tasks lists steps in sequence order", () => {
  return get(
    planTasksRoute.GET,
    `/api/planner/plans/${PLAN_1.id}/tasks`,
    { id: PLAN_1.id }
  ).then((res) => {
    assertEqual(res.status, 200, "status");
    assertEqual(
      res.body.items.length,
      2,
      "two planned steps"
    );
    assertEqual(
      res.body.items
        .map((task) => task.sequence)
        .join(","),
      "1,2",
      "sequences come back in order"
    );
  });
});

await check("15. PATCH /api/planner/tasks/[id] updates the step", () => {
  return patch(
    taskRoute.PATCH,
    `/api/planner/tasks/${TASK_1.id}`,
    {
      name: "Design the contract (revised)",
      complexity: "high",
      requiredCapabilities: '["tools","vision"]',
    },
    { id: TASK_1.id }
  ).then((res) => {
    assertEqual(res.status, 200, "status");
    assertEqual(
      res.body.task.name,
      "Design the contract (revised)",
      "name updated"
    );
    assertEqual(
      res.body.task.complexity,
      "high",
      "complexity updated"
    );
    assertEqual(
      res.body.task.required_capabilities,
      '["tools","vision"]',
      "required_capabilities updated verbatim"
    );
    assertEqual(
      res.body.task.sequence,
      1,
      "sequence is unchanged by a patch"
    );
    assertEqual(
      res.body.task.estimated_input_tokens_min,
      1000,
      "an unsent estimate is untouched"
    );
  });
});

await check("16. the client cannot move a step, reorder it, or set its status", () => {
  const forbidden = [
    "sequence",
    "planId",
    "status",
    "id",
    "createdAt",
    "is_selected",
  ];

  return forbidden.reduce(
    (chain, key) =>
      chain.then(() =>
        patch(
          taskRoute.PATCH,
          `/api/planner/tasks/${TASK_1.id}`,
          { [key]: 1 },
          { id: TASK_1.id }
        ).then((res) => {
          expectError(
            res,
            400,
            "UNKNOWN_FIELD",
            `patching "${key}"`
          );
        })
      ),
    Promise.resolve()
  );
});

await check("17. POST /api/planner/tasks/[id]/ai-options returns 201", () => {
  assertEqual(opt1Res.status, 201, "status");
  assertEqual(opt1Res.body.ok, true, "ok");
  assert(
    typeof opt1Res.body.option?.id === "string" &&
      opt1Res.body.option.id.length > 0,
    "the server generated an id"
  );
  assertEqual(
    opt1Res.body.option.model_id,
    "provider_api_a_model_1",
    "model_id stored"
  );
  assertEqual(
    opt1Res.body.option.cost_currency,
    "USD",
    "a known price keeps all three fields"
  );
  assertEqual(
    opt1Res.body.option.fit_status,
    "meets",
    "fit_status stored"
  );
  assertEqual(
    opt1Res.body.option.is_selected,
    0,
    "a new option starts unselected"
  );
});

await check("18. a client-supplied isSelected cannot bypass the select endpoint", () => {
  return post(
    aiOptionsRoute.POST,
    `/api/planner/tasks/${TASK_1.id}/ai-options`,
    {
      modelId: "provider_api_b_model_1",
      toolId: "tool_api_ide",
      isSelected: 1,
    },
    { id: TASK_1.id }
  ).then((res) => {
    expectError(
      res,
      400,
      "UNKNOWN_FIELD",
      "isSelected in the body"
    );
  });
});

await check("19. is_selected stays 0 in the database after that rejected request", () => {
  const rows = getDb()
    .prepare(
      `SELECT COUNT(*) AS total FROM project_task_ai_options WHERE is_selected = 1`
    )
    .get();

  assertEqual(
    Number(rows.total),
    0,
    "no row was created as selected"
  );
});

await check("20. an is_selected field name is rejected too", () => {
  return post(
    aiOptionsRoute.POST,
    `/api/planner/tasks/${TASK_1.id}/ai-options`,
    {
      modelId: "provider_api_b_model_1",
      is_selected: 1,
    },
    { id: TASK_1.id }
  ).then((res) => {
    expectError(
      res,
      400,
      "UNKNOWN_FIELD",
      "is_selected in the body"
    );
  });
});

await check("21. GET /api/planner/tasks/[id]/ai-options lists the candidates", () => {
  return get(
    aiOptionsRoute.GET,
    `/api/planner/tasks/${TASK_1.id}/ai-options`,
    { id: TASK_1.id }
  ).then((res) => {
    assertEqual(res.status, 200, "status");
    assertEqual(
      res.body.items.length,
      3,
      "three candidates"
    );
    assertEqual(
      res.body.items.every(
        (option) => option.is_selected === 0
      ),
      true,
      "nothing is selected yet"
    );
  });
});

await check("22. select makes exactly one option selected", () => {
  return post(
    selectRoute.POST,
    `/api/planner/tasks/${TASK_1.id}/ai-options/${OPT_2.id}/select`,
    undefined,
    { id: TASK_1.id, optionId: OPT_2.id }
  ).then((res) => {
    assertEqual(res.status, 200, "status");
    assertEqual(res.body.ok, true, "ok");
    assertEqual(
      res.body.option.id,
      OPT_2.id,
      "the chosen option comes back"
    );
    assertEqual(
      res.body.option.is_selected,
      1,
      "and it is selected"
    );

    const rows = getDb()
      .prepare(
        `SELECT COUNT(*) AS total FROM project_task_ai_options WHERE project_task_id = ? AND is_selected = 1`
      )
      .get(TASK_1.id);

    assertEqual(
      Number(rows.total),
      1,
      "exactly one row is selected"
    );
  });
});

await check("23. selecting another option clears the previous one", () => {
  return post(
    selectRoute.POST,
    `/api/planner/tasks/${TASK_1.id}/ai-options/${OPT_1.id}/select`,
    undefined,
    { id: TASK_1.id, optionId: OPT_1.id }
  ).then((res) => {
    assertEqual(res.status, 200, "status");

    const rows = getDb()
      .prepare(
        `SELECT id, is_selected FROM project_task_ai_options WHERE project_task_id = ? ORDER BY created_at ASC`
      )
      .all(TASK_1.id);

    const selected = rows.filter(
      (row) => row.is_selected === 1
    );

    assertEqual(
      selected.length,
      1,
      "still exactly one"
    );
    assertEqual(
      selected[0].id,
      OPT_1.id,
      "the newest choice is the selected one"
    );

    const cleared = rows.find(
      (row) => row.id === OPT_2.id
    );

    assertEqual(
      cleared.is_selected,
      0,
      "the previous selection was cleared"
    );
  });
});

await check("24. select is scoped to one planned task", () => {
  return post(
    aiOptionsRoute.POST,
    `/api/planner/tasks/${TASK_2.id}/ai-options`,
    { modelId: "provider_api_a_model_1" },
    { id: TASK_2.id }
  ).then((created) => {
    const otherOption =
      created.body.option;

    assertEqual(
      otherOption.is_selected,
      0,
      "an option on another step starts unselected"
    );

    const rows = getDb()
      .prepare(
        `SELECT COUNT(*) AS total FROM project_task_ai_options WHERE project_task_id = ? AND is_selected = 1`
      )
      .get(TASK_1.id);

    assertEqual(
      Number(rows.total),
      1,
      "the other step's option did not disturb this one"
    );
  });
});

await check("25. select rejects an option that belongs to a different step", () => {
  const rows = getDb()
    .prepare(
      `SELECT id FROM project_task_ai_options WHERE project_task_id = ?`
    )
    .all(TASK_2.id);

  return post(
    selectRoute.POST,
    `/api/planner/tasks/${TASK_1.id}/ai-options/${rows[0].id}/select`,
    undefined,
    { id: TASK_1.id, optionId: rows[0].id }
  ).then((res) => {
    expectError(
      res,
      404,
      "AI_OPTION_NOT_FOUND",
      "cross-step select"
    );
  });
});

await check("26. unknown ids return 404 with the shared error envelope", () => {
  return Promise.all([
    get(
      projectRoute.GET,
      "/api/planner/projects/no-such-project",
      { id: "no-such-project" }
    ).then((res) =>
      expectError(
        res,
        404,
        "PROJECT_NOT_FOUND",
        "missing project"
      )
    ),
    get(
      planRoute.GET,
      "/api/planner/plans/no-such-plan",
      { id: "no-such-plan" }
    ).then((res) =>
      expectError(
        res,
        404,
        "PLAN_NOT_FOUND",
        "missing plan"
      )
    ),
    get(
      aiOptionsRoute.GET,
      "/api/planner/tasks/no-such-task/ai-options",
      { id: "no-such-task" }
    ).then((res) =>
      expectError(
        res,
        404,
        "PROJECT_TASK_NOT_FOUND",
        "missing project task"
      )
    ),
    post(
      selectRoute.POST,
      "/api/planner/tasks/no-such-task/ai-options/no-such-option/select",
      undefined,
      { id: "no-such-task", optionId: "no-such-option" }
    ).then((res) =>
      expectError(
        res,
        404,
        "PROJECT_TASK_NOT_FOUND",
        "missing step for select"
      )
    ),
  ]);
});

await check("27. an unknown model or tool reference returns 404", () => {
  return Promise.all([
    post(
      aiOptionsRoute.POST,
      `/api/planner/tasks/${TASK_1.id}/ai-options`,
      { modelId: "no-such-model" },
      { id: TASK_1.id }
    ).then((res) =>
      expectError(
        res,
        404,
        "MODEL_NOT_FOUND",
        "unknown model"
      )
    ),
    post(
      aiOptionsRoute.POST,
      `/api/planner/tasks/${TASK_1.id}/ai-options`,
      {
        modelId: "provider_api_b_model_1",
        toolId: "no-such-tool",
      },
      { id: TASK_1.id }
    ).then((res) =>
      expectError(
        res,
        404,
        "TOOL_NOT_FOUND",
        "unknown tool"
      )
    ),
  ]);
});

await check("28. a malformed body returns 400", () => {
  return call(projectsRoute.POST, {
    method: "POST",
    url: "/api/planner/projects",
    body: undefined,
  })
    .then((res) => {
      /*
       * No body at all: request.json() throws, so this is a 400
       * rather than a 500.
       */
      expectError(
        res,
        400,
        "INVALID_BODY",
        "empty body"
      );
    });
});

await check("29. a missing required field returns 400", () => {
  return post(
    projectsRoute.POST,
    "/api/planner/projects",
    { goal: "no name given" }
  ).then((res) => {
    expectError(
      res,
      400,
      "MISSING_FIELD",
      "missing name"
    );
  });
});

await check("30. a wrongly typed field returns 400", () => {
  return post(
    projectsRoute.POST,
    "/api/planner/projects",
    { name: 42 }
  ).then((res) => {
    expectError(
      res,
      400,
      "INVALID_FIELD_TYPE",
      "numeric name"
    );
  });
});

await check("31. an invalid fitStatus returns 400", () => {
  return post(
    aiOptionsRoute.POST,
    `/api/planner/tasks/${TASK_1.id}/ai-options`,
    {
      modelId: "provider_api_b_model_1",
      toolId: "tool_api_ide",
      fitStatus: "great",
    },
    { id: TASK_1.id }
  ).then((res) => {
    expectError(
      res,
      400,
      "INVALID_ENUM",
      "invalid fitStatus"
    );
  });
});

await check("32. an incomplete cost returns 400", () => {
  return post(
    aiOptionsRoute.POST,
    `/api/planner/tasks/${TASK_1.id}/ai-options`,
    {
      modelId: "provider_api_b_model_1",
      costMinMicros: 0,
      costMaxMicros: 0,
    },
    { id: TASK_1.id }
  ).then((res) => {
    expectError(
      res,
      400,
      "INCOMPLETE_COST",
      "cost without a currency"
    );
  });
});

await check("33. negative values return 400", () => {
  return Promise.all([
    post(
      projectsRoute.POST,
      "/api/planner/projects",
      {
        name: "Negative budget",
        budgetMinMicros: -1,
        budgetMaxMicros: 100,
        budgetCurrency: "USD",
      }
    ).then((res) =>
      expectError(
        res,
        400,
        "NEGATIVE_VALUE",
        "negative budget"
      )
    ),
    post(
      aiOptionsRoute.POST,
      `/api/planner/tasks/${TASK_1.id}/ai-options`,
      {
        modelId: "provider_api_b_model_1",
        toolId: "tool_api_cli",
        costMinMicros: -1,
        costMaxMicros: 10,
        costCurrency: "USD",
      },
      { id: TASK_1.id }
    ).then((res) =>
      expectError(
        res,
        400,
        "NEGATIVE_VALUE",
        "negative cost"
      )
    ),
  ]);
});

await check("34. an inverted range returns 400", () => {
  return Promise.all([
    post(
      projectsRoute.POST,
      "/api/planner/projects",
      {
        name: "Inverted budget",
        budgetMinMicros: 900,
        budgetMaxMicros: 100,
        budgetCurrency: "USD",
      }
    ).then((res) =>
      expectError(
        res,
        400,
        "INVALID_BUDGET_RANGE",
        "inverted budget"
      )
    ),
    post(
      planTasksRoute.POST,
      `/api/planner/plans/${PLAN_1.id}/tasks`,
      {
        name: "Inverted tokens",
        category: "coding",
        complexity: "low",
        estimatedInputTokensMin: 900,
        estimatedInputTokensMax: 100,
      },
      { id: PLAN_1.id }
    ).then((res) =>
      expectError(
        res,
        400,
        "INVALID_TOKEN_RANGE",
        "inverted tokens"
      )
    ),
  ]);
});

await check("35. unknown pricing stays NULL and is never turned into 0", () => {
  assertEqual(
    OPT_3.cost_min_micros,
    null,
    "unknown cost_min_micros"
  );
  assertEqual(
    OPT_3.cost_max_micros,
    null,
    "unknown cost_max_micros"
  );
  assertEqual(
    OPT_3.cost_currency,
    null,
    "unknown cost_currency"
  );
  assertEqual(
    OPT_3.fit_status,
    "unknown",
    "unknown fit_status"
  );
});

await check("36. CNY and USD are stored as sent and never converted", () => {
  assertEqual(
    OPT_2.cost_currency,
    "CNY",
    "the CNY option stays CNY"
  );
  assertEqual(
    OPT_1.cost_currency,
    "USD",
    "the USD option stays USD"
  );
  assertEqual(
    OPT_2.cost_min_micros,
    50000,
    "the CNY amount is untouched"
  );

  const currencies = getDb()
    .prepare(
      `SELECT DISTINCT cost_currency FROM project_task_ai_options WHERE cost_currency IS NOT NULL ORDER BY cost_currency`
    )
    .all()
    .map((row) => row.cost_currency);

  assertEqual(
    currencies.join(","),
    "CNY,USD",
    "both currencies coexist with no conversion"
  );
});

await check("37. fit_status is a capability fact and is not derived from cost", () => {
  /*
   * OPT_2 is the cheaper option in CNY and still below_minimum;
   * OPT_1 costs more and is meets. The API stored both as sent.
   */
  assertEqual(
    OPT_2.fit_status,
    "below_minimum",
    "a cheaper option can fail the requirement"
  );
  assertEqual(
    OPT_1.fit_status,
    "meets",
    "a dearer option can meet it"
  );
  assert(
    OPT_2.cost_min_micros < OPT_1.cost_min_micros,
    "precondition: OPT_2 really is cheaper"
  );
});

await check("38. nothing was written to usage_records or cost_records", () => {
  assertEqual(
    countRows("usage_records"),
    0,
    "usage_records is untouched"
  );
  assertEqual(
    countRows("cost_records"),
    0,
    "cost_records is untouched"
  );
  assertEqual(
    countRows("budgets"),
    0,
    "budgets is untouched"
  );
  assertEqual(
    countRows("import_logs"),
    0,
    "no import side effects"
  );
});

await check("39. the Task Session layer is unchanged", () => {
  assertEqual(
    countRows("task_sessions"),
    0,
    "no session was created"
  );
  assertEqual(
    countRows("task_usage_records"),
    0,
    "no usage was attributed"
  );

  /*
   * TASK_2 was created with taskId, which is the one and only link
   * to the execution layer. It must not have started anything.
   */
  assertEqual(
    TASK_2.task_id,
    EXEC_TASK_1,
    "the link points at the existing task"
  );
  assertEqual(
    countRows("tasks"),
    1,
    "only the one fixture task exists"
  );
});

await check("40. a planned step survives deletion of its execution task", () => {
  getDb()
    .prepare(`DELETE FROM tasks WHERE id = ?`)
    .run(EXEC_TASK_1);

  return get(
    planTasksRoute.GET,
    `/api/planner/plans/${PLAN_1.id}/tasks`,
    { id: PLAN_1.id }
  ).then((res) => {
    assertEqual(
      res.status,
      200,
      "the plan still reads"
    );

    const task = res.body.items.find(
      (item) => item.id === TASK_2.id
    );

    assert(
      task !== undefined,
      "the planned step still exists"
    );
    assertEqual(
      task.task_id,
      null,
      "the link was set to NULL, not cascaded"
    );
  });
});

await check("41. no scoring, ranking or session column was introduced", () => {
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
        "task_session",
        "session_id",
        "exchange_rate",
      ]) {
        assert(
          !column.includes(forbidden),
          `${table}.${column} must not exist`
        );
      }
    }
  }
});

await check("42. the API adds no column to the existing core tables", () => {
  assertEqual(
    columnsOf("tasks").join(","),
    "id,name,status,created_at,updated_at",
    "tasks is unchanged"
  );
  assertEqual(
    columnsOf("task_sessions").join(","),
    "id,task_id,started_at,ended_at,status,created_at",
    "task_sessions is unchanged"
  );
  assertEqual(
    columnsOf("usage_records").length,
    14,
    "usage_records still has 14 columns"
  );
  assertEqual(
    columnsOf("cost_records").length,
    12,
    "cost_records still has 12 columns"
  );
  assertEqual(
    columnsOf("models").join(","),
    "id,provider_id,name,created_at",
    "models is unchanged"
  );
  assertEqual(
    columnsOf("providers").join(","),
    "id,name,created_at",
    "providers is unchanged"
  );
});

await check("43. the real project and production databases are unchanged", () => {
  const after = snapshotRealDatabases();

  assertEqual(
    JSON.stringify(after),
    JSON.stringify(productionFileSnapshot),
    "no real database file changed size or mtime"
  );
});

await check("44. this smoke run used an isolated temporary database", () => {
  assert(
    path.normalize(dbPath).startsWith(
      path.normalize(TEMP_DIR)
    ),
    `dbPath ${dbPath} is not under the temp dir`
  );

  const rows = getDb()
    .prepare(
      `SELECT COUNT(*) AS total FROM projects`
    )
    .get();

  assert(
    Number(rows.total) > 0,
    "the temp database really was used"
  );
});

console.log("");
console.log(`ts-smoke: ${passed} passed, ${failed} failed`);
console.log(`isolated db: ${dbPath}`);
console.log(
  `temp dir kept for inspection: ${TEMP_DIR}`
);

if (failed > 0) {
  process.exit(1);
}

/*
 * Both real databases are fingerprinted before the run and again at
 * the end. Nothing in this smoke may touch either of them, and the
 * temp-dir chdir above is what keeps that true.
 */
function snapshotRealDatabases() {
  const projectDataDir = path.resolve(
    DIR,
    "..",
    "data"
  );

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

  const suffixes = [
    "",
    "-wal",
    "-shm",
  ];

  const files = [];

  for (const dir of dataDirs) {
    for (const suffix of suffixes) {
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
