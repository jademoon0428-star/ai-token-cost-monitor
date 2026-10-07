/*
 * v1.4-C Planner Stage API smoke test (M1-D,
 * PLANNER_STAGE_AND_TASK_MODEL_DESIGN.md).
 *
 * Every assertion goes through the real Next.js route handlers for
 * the stage layer (app/api/planner/**) with a real Request object,
 * so the HTTP status codes and the JSON bodies are what a client
 * would actually receive - including the two error mappings this
 * phase adds (STAGE_NOT_FOUND -> 404, STAGE_HAS_TASKS -> 409).
 *
 * The database is an isolated, freshly-created temp file:
 * NODE_ENV=development plus a chdir to a temp directory happen
 * BEFORE any library module is loaded, so neither
 * data/ai-token-cost-monitor.db nor %APPDATA%\AI-Cost-Management is
 * ever opened for writing. seed:registry is never called.
 *
 * One step binds a planned step to a stage (M2-A) through the task
 * API itself - POST/PATCH accept stageId, null unbinds, and a stage
 * of another project is refused with STAGE_PROJECT_MISMATCH - so no
 * direct SQL is used for task binding anymore.
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

const TEMP_DIR = mkdtempSync(
  path.join(tmpdir(), "v14c-planner-stages-smoke-")
);

process.env.NODE_ENV = "development";
process.chdir(TEMP_DIR);

const { dbPath, getDb } = await import("../lib/db.ts");
const { initDb } = await import("../lib/schema.ts");

const projectsRoute = await import(
  "../app/api/planner/projects/route.ts"
);
const plansRoute = await import(
  "../app/api/planner/projects/[id]/plans/route.ts"
);
const planTasksRoute = await import(
  "../app/api/planner/plans/[id]/tasks/route.ts"
);
const taskRoute = await import(
  "../app/api/planner/tasks/[id]/route.ts"
);
const stagesRoute = await import(
  "../app/api/planner/projects/[id]/stages/route.ts"
);
const stageRoute = await import(
  "../app/api/planner/stages/[id]/route.ts"
);
const stageArchiveRoute = await import(
  "../app/api/planner/stages/[id]/archive/route.ts"
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

function countRows(name) {
  return Number(
    getDb()
      .prepare(
        `SELECT COUNT(*) AS total FROM ${name}`
      )
      .get().total
  );
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
    contentType:
      response.headers.get("content-type"),
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

const del = (handler, url, params) =>
  call(handler, {
    method: "DELETE",
    url,
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
    response.body.code,
    code,
    `${label} code`
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
}

/* ---------------------------------------------------------------- */
/* Fixtures built through the API itself                            */
/* ---------------------------------------------------------------- */

initDb();

const projectRes = await post(
  projectsRoute.POST,
  "/api/planner/projects",
  {
    name: "Stage smoke project",
    goal: "verify the stage HTTP contract",
  }
);

if (projectRes.status !== 201) {
  throw new Error(
    `project fixture failed: ${projectRes.status} ${JSON.stringify(projectRes.body)}`
  );
}

const PROJECT = projectRes.body.project;

const planRes = await post(
  plansRoute.POST,
  `/api/planner/projects/${PROJECT.id}/plans`,
  { strategy: "balanced" },
  { id: PROJECT.id }
);

if (planRes.status !== 201) {
  throw new Error(
    `plan fixture failed: ${planRes.status} ${JSON.stringify(planRes.body)}`
  );
}

const PLAN = planRes.body.plan;

const taskRes = await post(
  planTasksRoute.POST,
  `/api/planner/plans/${PLAN.id}/tasks`,
  {
    name: "Bind me to a stage",
    category: "architecture",
    complexity: "medium",
  },
  { id: PLAN.id }
);

if (taskRes.status !== 201) {
  throw new Error(
    `task fixture failed: ${taskRes.status} ${JSON.stringify(taskRes.body)}`
  );
}

const TASK = taskRes.body.task;

/* ---------------------------------------------------------------- */
/* Stage checks                                                      */
/* ---------------------------------------------------------------- */

let STAGE_1;
let STAGE_2;
let STAGE_TASK;

await check(
  "1. 创建项目：POST 返回 201 且状态为 planning",
  () => {
    assertEqual(
      PROJECT.status,
      "planning",
      "new project status"
    );
    assert(
      typeof PROJECT.id === "string" &&
        PROJECT.id.length > 0,
      "project must carry an id"
    );
    assertEqual(
      countRows("project_stages"),
      0,
      "a fresh project starts with no stages"
    );
  }
);

await check(
  "2. 创建两个 stage：sequence 依次为 1、2，状态 active",
  async () => {
    const first = await post(
      stagesRoute.POST,
      `/api/planner/projects/${PROJECT.id}/stages`,
      {
        name: "Requirements",
        description: "first stage",
      },
      { id: PROJECT.id }
    );

    assertEqual(
      first.status,
      201,
      "stage 1 create status"
    );

    STAGE_1 = first.body.stage;

    const second = await post(
      stagesRoute.POST,
      `/api/planner/projects/${PROJECT.id}/stages`,
      { name: "Test and release" },
      { id: PROJECT.id }
    );

    assertEqual(
      second.status,
      201,
      "stage 2 create status"
    );

    STAGE_2 = second.body.stage;

    assertEqual(
      STAGE_1.sequence,
      1,
      "stage 1 sequence is assigned by the service"
    );
    assertEqual(
      STAGE_2.sequence,
      2,
      "stage 2 sequence continues the project order"
    );
    assertEqual(
      STAGE_1.status,
      "active",
      "a new stage is active"
    );
    assertEqual(
      STAGE_1.project_id,
      PROJECT.id,
      "the stage belongs to its project"
    );
  }
);

await check(
  "3. 查询 stage 列表：按 sequence 排序返回全部 stage",
  async () => {
    const res = await get(
      stagesRoute.GET,
      `/api/planner/projects/${PROJECT.id}/stages`,
      { id: PROJECT.id }
    );

    assertEqual(res.status, 200, "list status");

    const items = res.body.items;

    assertEqual(
      items.length,
      2,
      "both stages are listed"
    );
    assertEqual(
      items[0].sequence,
      1,
      "first item is sequence 1"
    );
    assertEqual(
      items[1].sequence,
      2,
      "second item is sequence 2"
    );
    assertEqual(
      items[0].name,
      "Requirements",
      "first item name"
    );
    assertEqual(
      items[1].name,
      "Test and release",
      "second item name"
    );
  }
);

await check(
  "4. 更新 stage：PATCH 改名与描述生效，sequence 不变",
  async () => {
    const res = await patch(
      stageRoute.PATCH,
      `/api/planner/stages/${STAGE_1.id}`,
      {
        name: "Requirements (renamed)",
        description: "renamed by smoke",
      },
      { id: STAGE_1.id }
    );

    assertEqual(res.status, 200, "patch status");
    assertEqual(
      res.body.stage.name,
      "Requirements (renamed)",
      "name updated"
    );
    assertEqual(
      res.body.stage.description,
      "renamed by smoke",
      "description updated"
    );
    assertEqual(
      res.body.stage.sequence,
      1,
      "sequence untouched by an edit"
    );
    assertEqual(
      res.body.stage.status,
      "active",
      "status untouched by an edit"
    );
  }
);

await check(
  "5. archive stage：状态变 archived，行仍在列表中",
  async () => {
    const res = await post(
      stageArchiveRoute.POST,
      `/api/planner/stages/${STAGE_2.id}/archive`,
      undefined,
      { id: STAGE_2.id }
    );

    assertEqual(res.status, 200, "archive status");
    assertEqual(
      res.body.stage.status,
      "archived",
      "archived status"
    );

    const list = await get(
      stagesRoute.GET,
      `/api/planner/projects/${PROJECT.id}/stages`,
      { id: PROJECT.id }
    );

    assertEqual(
      list.body.items.length,
      2,
      "archiving does not delete the row"
    );
    assertEqual(
      list.body.items[1].status,
      "archived",
      "the list carries the status"
    );
  }
);

await check(
  "6. 旧任务 stage_id=null 正常读取，PATCH 更新 stageId 成功",
  async () => {
    const before = await get(
      planTasksRoute.GET,
      `/api/planner/plans/${PLAN.id}/tasks`,
      { id: PLAN.id }
    );

    assertEqual(
      before.status,
      200,
      "task list status"
    );

    const untouched = before.body.items.find(
      (item) => item.id === TASK.id
    );

    assert(
      untouched !== undefined,
      "the fixture task is listed"
    );
    assertEqual(
      untouched.stage_id,
      null,
      "a task created without stageId reads back stage_id=null"
    );

    const res = await patch(
      taskRoute.PATCH,
      `/api/planner/tasks/${TASK.id}`,
      { stageId: STAGE_1.id },
      { id: TASK.id }
    );

    assertEqual(res.status, 200, "bind patch status");
    assertEqual(
      res.body.task.stage_id,
      STAGE_1.id,
      "the PATCH bound the task to stage 1"
    );
  }
);

await check(
  "7. 删除被任务引用的 stage 必须失败 STAGE_HAS_TASKS (409)",
  async () => {
    const res = await del(
      stageRoute.DELETE,
      `/api/planner/stages/${STAGE_1.id}`,
      { id: STAGE_1.id }
    );

    expectError(
      res,
      409,
      "STAGE_HAS_TASKS",
      "delete referenced stage"
    );

    const list = await get(
      stagesRoute.GET,
      `/api/planner/projects/${PROJECT.id}/stages`,
      { id: PROJECT.id }
    );

    assertEqual(
      list.body.items.length,
      2,
      "the referenced stage still exists after the refusal"
    );
  }
);

await check(
  "8. 删除无引用 stage 成功：行从列表消失",
  async () => {
    const res = await del(
      stageRoute.DELETE,
      `/api/planner/stages/${STAGE_2.id}`,
      { id: STAGE_2.id }
    );

    assertEqual(
      res.status,
      200,
      "delete status"
    );
    assertEqual(
      res.body.ok,
      true,
      "delete reports ok"
    );

    const list = await get(
      stagesRoute.GET,
      `/api/planner/projects/${PROJECT.id}/stages`,
      { id: PROJECT.id }
    );

    assertEqual(
      list.body.items.length,
      1,
      "one stage is left"
    );
    assertEqual(
      list.body.items[0].id,
      STAGE_1.id,
      "the referenced stage survived"
    );
  }
);

await check(
  "9. 不存在的 stage 返回 404 STAGE_NOT_FOUND",
  async () => {
    const res = await del(
      stageRoute.DELETE,
      "/api/planner/stages/no-such-stage",
      { id: "no-such-stage" }
    );

    expectError(
      res,
      404,
      "STAGE_NOT_FOUND",
      "delete missing stage"
    );
  }
);

await check(
  "10. 真实数据库文件未被触碰",
  () => {
    assertEqual(
      JSON.stringify(snapshotRealDatabases()),
      JSON.stringify(productionFileSnapshot),
      "no real database file changed size or mtime"
    );
  }
);

await check(
  "11. 本次运行使用隔离临时数据库",
  () => {
    assert(
      path
        .normalize(dbPath)
        .startsWith(path.normalize(TEMP_DIR)),
      `dbPath ${dbPath} is not under the temp dir`
    );

    assert(
      countRows("project_stages") > 0,
      "the temp database really was used"
    );
  }
);

/* ---------------------------------------------------------------- */
/* M2-A task stage binding                                           */
/* ---------------------------------------------------------------- */

await check(
  "12. 创建任务携带 stageId：POST 返回 stage_id",
  async () => {
    const res = await post(
      planTasksRoute.POST,
      `/api/planner/plans/${PLAN.id}/tasks`,
      {
        name: "Created under a stage",
        category: "architecture",
        complexity: "medium",
        stageId: STAGE_1.id,
      },
      { id: PLAN.id }
    );

    assertEqual(
      res.status,
      201,
      "create with stage status"
    );
    assertEqual(
      res.body.task.stage_id,
      STAGE_1.id,
      "the created task carries its stage"
    );

    STAGE_TASK = res.body.task;
  }
);

await check(
  "13. stageId=null 解绑成功",
  async () => {
    const res = await patch(
      taskRoute.PATCH,
      `/api/planner/tasks/${STAGE_TASK.id}`,
      { stageId: null },
      { id: STAGE_TASK.id }
    );

    assertEqual(res.status, 200, "unbind status");
    assertEqual(
      res.body.task.stage_id,
      null,
      "the task is ungrouped again"
    );
  }
);

await check(
  "14. 跨项目 stage 绑定失败 STAGE_PROJECT_MISMATCH，不存在的 stage 返回 404",
  async () => {
    const otherProject = await post(
      projectsRoute.POST,
      "/api/planner/projects",
      { name: "Other project for binding" }
    );

    assertEqual(
      otherProject.status,
      201,
      "second project status"
    );

    const otherStage = await post(
      stagesRoute.POST,
      `/api/planner/projects/${otherProject.body.project.id}/stages`,
      { name: "Foreign stage" },
      { id: otherProject.body.project.id }
    );

    assertEqual(
      otherStage.status,
      201,
      "second stage status"
    );

    const mismatch = await patch(
      taskRoute.PATCH,
      `/api/planner/tasks/${TASK.id}`,
      { stageId: otherStage.body.stage.id },
      { id: TASK.id }
    );

    expectError(
      mismatch,
      400,
      "STAGE_PROJECT_MISMATCH",
      "cross-project bind"
    );

    const missing = await patch(
      taskRoute.PATCH,
      `/api/planner/tasks/${TASK.id}`,
      { stageId: "no-such-stage" },
      { id: TASK.id }
    );

    expectError(
      missing,
      404,
      "STAGE_NOT_FOUND",
      "bind missing stage"
    );

    const list = await get(
      planTasksRoute.GET,
      `/api/planner/plans/${PLAN.id}/tasks`,
      { id: PLAN.id }
    );

    const unchanged = list.body.items.find(
      (item) => item.id === TASK.id
    );

    assertEqual(
      unchanged.stage_id,
      STAGE_1.id,
      "the failed bindings left the original grouping intact"
    );
  }
);

console.log("");
console.log(
  `ts-smoke: ${passed} passed, ${failed} failed`
);
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

  const suffixes = ["", "-wal", "-shm"];

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
