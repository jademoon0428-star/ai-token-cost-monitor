/*
 * v1.4-A Task/Session data-layer smoke test.
 *
 * Runs entirely against an isolated, freshly-created temp database
 * (NODE_ENV=development + chdir to a temp dir BEFORE the library
 * modules are loaded), so the user's production database in
 * %APPDATA%\AI-Cost-Management is never opened. The temp DB is
 * created by the real initDb()/schema and the fixtures go through
 * the real usage/cost repositories and the real task service.
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

const TEMP_DIR = mkdtempSync(path.join(tmpdir(), "v14-tasks-smoke-"));

process.env.NODE_ENV = "development";
process.chdir(TEMP_DIR);

const { dbPath, getDb } = await import("../lib/db.ts");
const { insertCostRecord } = await import("../lib/repositories/cost-repository.ts");
const { insertUsageRecord } = await import("../lib/repositories/usage-repository.ts");
const taskRepository = await import("../lib/repositories/task-repository.ts");
const taskService = await import("../lib/services/task-service.ts");

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

function expectTaskServiceError(fn, code) {
  try {
    fn();
  } catch (error) {
    if (
      error instanceof taskService.TaskServiceError &&
      error.code === code
    ) {
      return;
    }

    throw new Error(
      `expected TaskServiceError code "${code}", got ${
        error instanceof Error
          ? `${error.constructor.name} ${error.message}`
          : String(error)
      }`
    );
  }

  throw new Error(`expected TaskServiceError code "${code}", call did not throw`);
}

function countActiveSessions() {
  return Number(
    getDb()
      .prepare(
        `SELECT COUNT(*) AS count
         FROM task_sessions
         WHERE status = 'active'`
      )
      .get().count
  );
}

const NOW = "2026-09-01T08:00:00.000Z";

function seedUsage(
  id,
  timestamp,
  source,
  accuracy,
  inputTokens = 1000,
  outputTokens = 500
) {
  insertUsageRecord(
    {
      id,
      provider: "Acme",
      model: "acme-chat",
      timestamp,
      inputTokens,
      outputTokens,
      cachedTokens: 0,
      reasoningTokens: 0,
      source,
      accuracy,
      application: "smoke",
      project: "v1.4-A",
    },
    { ignoreDuplicate: true }
  );
}

function seedCost(id, usageRecordId, totalCostMicros, currency, provenance = "source_reported") {
  insertCostRecord({
    id,
    usageRecordId,
    inputCostMicros: 0,
    outputCostMicros: totalCostMicros,
    cachedCostMicros: 0,
    reasoningCostMicros: 0,
    totalCostMicros,
    currency,
    pricingVersion: "smoke-v1.4A",
    provenance,
  });
}

// ---- fixtures -------------------------------------------------------------

const TASK_A = "smoke-task-A";
const TASK_B = "smoke-task-B";
const TASK_C = "smoke-task-C";
const TASK_D = "smoke-task-D";
const TASK_E = "smoke-task-E";
const TASK_F = "smoke-task-F";
const TASK_G = "smoke-task-G";

const USAGE_CNY_1 = "smoke_usage_cny_1";
const USAGE_CNY_2 = "smoke_usage_cny_2";
const USAGE_NO_COST = "smoke_usage_no_cost";
const USAGE_ESTIMATED = "smoke_usage_estimated";
const USAGE_USD = "smoke_usage_usd";

seedUsage(USAGE_CNY_1, "2026-09-01T00:00:00.000Z", "official_export", "verified");
seedUsage(USAGE_CNY_2, "2026-09-02T00:00:00.000Z", "official_api", "verified");
seedUsage(USAGE_NO_COST, "2026-09-03T00:00:00.000Z", "official_export", "verified");
seedUsage(USAGE_ESTIMATED, "2026-09-04T00:00:00.000Z", "local_estimate", "estimated");
seedUsage(USAGE_USD, "2026-09-05T00:00:00.000Z", "official_export", "verified");

seedCost("smoke_cost_cny_1", USAGE_CNY_1, 123450000, "CNY");
seedCost("smoke_cost_cny_2", USAGE_CNY_2, 67890, "CNY");
seedCost("smoke_cost_estimated", USAGE_ESTIMATED, 111, "USD", "estimated");
seedCost("smoke_cost_usd", USAGE_USD, 333, "USD");

for (const { id, name } of [
  { id: TASK_A, name: "Refactor v1.4-A" },
  { id: TASK_B, name: "Mixed currency task" },
  { id: TASK_C, name: "No-cost task" },
  { id: TASK_D, name: "Unreliable-only task" },
  { id: TASK_E, name: "Verified + missing-cost companion" },
  { id: TASK_F, name: "Verified + estimated companion" },
  { id: TASK_G, name: "All reliable task" },
]) {
  taskService.createTask({ id, name });
}

// ---- checks ---------------------------------------------------------------

check("1. schema: tasks/task_sessions/task_usage_records + partial unique index exist", () => {
  const rows = getDb()
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
         AND name IN ('tasks', 'task_sessions', 'task_usage_records')
         AND sql IS NOT NULL`
    )
    .all();

  for (const name of ["tasks", "task_sessions", "task_usage_records"]) {
    if (!rows.some((row) => row.name === name)) {
      throw new Error(`table ${name} missing`);
    }
  }

  const index = getDb()
    .prepare(
      `SELECT sql
       FROM sqlite_master
       WHERE type = 'index'
         AND name = 'idx_task_sessions_one_active'`
    )
    .get();

  if (!index || !/WHERE status = 'active'/i.test(index.sql)) {
    throw new Error("partial unique index idx_task_sessions_one_active missing");
  }

  const unique = getDb()
    .prepare(
      `SELECT sql
       FROM sqlite_master
       WHERE type = 'table'
         AND name = 'task_usage_records'`
    )
    .get();

  if (!unique || !/UNIQUE\s*\(\s*task_session_id\s*,\s*usage_record_id\s*\)/i.test(unique.sql)) {
    throw new Error("UNIQUE(task_session_id, usage_record_id) constraint missing");
  }
});

check("2. createTask stores a task (open) and listTasks returns it", () => {
  const task = taskRepository.getTask(TASK_A);

  if (!task || task.name !== "Refactor v1.4-A" || task.status !== "open") {
    throw new Error(`unexpected task row: ${JSON.stringify(task)}`);
  }

  const ids = taskRepository.listTasks().map((row) => row.id);

  if (!ids.includes(TASK_D)) {
    throw new Error("listTasks does not contain task D");
  }
});

check("3. startTaskSession creates an active session with started_at, no ended_at", () => {
  const session = taskService.startTaskSession({
    taskId: TASK_A,
    sessionId: "smoke-session-1",
  });

  if (session.status !== "active" || session.ended_at !== null) {
    throw new Error(`unexpected session: ${JSON.stringify(session)}`);
  }

  const active = taskRepository.getActiveSession();

  if (!active || active.id !== "smoke-session-1") {
    throw new Error("getActiveSession did not return the new session");
  }
});

check("4. second startTaskSession throws ACTIVE_SESSION_EXISTS, one active stays", () => {
  expectTaskServiceError(
    () => taskService.startTaskSession({ taskId: TASK_C }),
    "ACTIVE_SESSION_EXISTS"
  );

  if (countActiveSessions() !== 1) {
    throw new Error("expected exactly one active session");
  }
});

check("5. raw second active insert is rejected by the database partial unique index", () => {
  let constraintError = null;

  try {
    taskRepository.createTaskSession({
      id: "smoke-session-dup",
      taskId: TASK_A,
      startedAt: NOW,
      status: "active",
    });
  } catch (error) {
    constraintError = error;
  }

  if (!(constraintError instanceof Error) || !/UNIQUE constraint failed/i.test(constraintError.message)) {
    throw new Error("database did not enforce the single-active-session invariant");
  }

  if (countActiveSessions() !== 1) {
    throw new Error("expected exactly one active session after rejected insert");
  }
});

check("6. completeTaskSession closes the session and clears getActiveSession", () => {
  const completed = taskService.completeTaskSession({ sessionId: "smoke-session-1" });

  if (completed.status !== "completed" || completed.ended_at === null) {
    throw new Error(`unexpected completed session: ${JSON.stringify(completed)}`);
  }

  if (taskRepository.getActiveSession() !== undefined) {
    throw new Error("getActiveSession should be empty after completion");
  }
});

check("7. completing an already-completed session throws SESSION_NOT_ACTIVE", () => {
  expectTaskServiceError(
    () => taskService.completeTaskSession({ sessionId: "smoke-session-1" }),
    "SESSION_NOT_ACTIVE"
  );
});

check("8. a new session can be started after close, and updateTask writes status", () => {
  const session = taskService.startTaskSession({
    taskId: TASK_A,
    sessionId: "smoke-session-2",
  });

  const active = taskRepository.getActiveSession();

  if (!active || active.id !== "smoke-session-2") {
    throw new Error("new session was not the active one");
  }

  const closed = taskRepository.updateTask(TASK_A, {
    status: "closed",
    updatedAt: NOW,
  });

  if (closed.status !== "closed") {
    throw new Error(`updateTask did not persist status: ${JSON.stringify(closed)}`);
  }
});

check("9. abandonTaskSession marks the session abandoned and releases the active slot", () => {
  const abandoned = taskService.abandonTaskSession({ sessionId: "smoke-session-2" });

  if (abandoned.status !== "abandoned" || abandoned.ended_at === null) {
    throw new Error(`unexpected abandoned session: ${JSON.stringify(abandoned)}`);
  }

  if (taskRepository.getActiveSession() !== undefined) {
    throw new Error("getActiveSession should be empty after abandonment");
  }
});

check("10. associating usage records attaches them to the active session of the task", () => {
  const session = taskService.startTaskSession({
    taskId: TASK_A,
    sessionId: "smoke-session-3",
  });

  for (const usageId of [USAGE_CNY_1, USAGE_CNY_2, USAGE_NO_COST, USAGE_ESTIMATED]) {
    const result = taskService.associateUsageRecord({
      taskId: TASK_A,
      usageRecordId: usageId,
    });

    if (result.inserted !== true) {
      throw new Error(`expected inserted=true for ${usageId}`);
    }
  }

  const bundles = taskRepository.getTaskUsageBundles(TASK_A);

  if (bundles.length !== 4) {
    throw new Error(`expected 4 bundles, got ${bundles.length}`);
  }

  for (const bundle of bundles) {
    if (bundle.task_session_id !== session.id) {
      throw new Error(`bundle attached to wrong session: ${bundle.task_session_id}`);
    }
  }
});

check("11. duplicate association is idempotent and does not insert twice", () => {
  const result = taskService.associateUsageRecord({
    taskId: TASK_A,
    usageRecordId: USAGE_CNY_1,
  });

  if (result.inserted !== false) {
    throw new Error("duplicate association should report inserted=false");
  }

  if (taskRepository.getTaskUsageBundles(TASK_A).length !== 4) {
    throw new Error("duplicate association created an extra bundle");
  }
});

check("12. task with unreliable associations is unavailable (null), no eligible subset is summed", () => {
  const cost = taskService.getTaskVerifiedCost(TASK_A);

  if (cost !== null) {
    throw new Error(`task A mixes reliable and unreliable records, expected null, got ${JSON.stringify(cost)}`);
  }
});

check("13. associating a non-existent usage record throws USAGE_NOT_FOUND", () => {
  expectTaskServiceError(
    () =>
      taskService.associateUsageRecord({
        taskId: TASK_A,
        usageRecordId: "smoke_usage_does_not_exist",
      }),
    "USAGE_NOT_FOUND"
  );
});

check("14. associating with a session of another task throws SESSION_TASK_MISMATCH", () => {
  expectTaskServiceError(
    () =>
      taskService.associateUsageRecord({
        taskId: TASK_B,
        usageRecordId: USAGE_CNY_1,
        sessionId: "smoke-session-3",
      }),
    "SESSION_TASK_MISMATCH"
  );
});

check("15. associating to a completed session throws SESSION_NOT_ACTIVE", () => {
  taskService.completeTaskSession({ sessionId: "smoke-session-3" });

  expectTaskServiceError(
    () =>
      taskService.associateUsageRecord({
        taskId: TASK_A,
        usageRecordId: USAGE_CNY_1,
        sessionId: "smoke-session-3",
      }),
    "SESSION_NOT_ACTIVE"
  );
});

check("16. mixed-currency task cost is unavailable (null), never converted", () => {
  const session = taskService.startTaskSession({
    taskId: TASK_B,
    sessionId: "smoke-session-4",
  });

  for (const usageId of [USAGE_CNY_1, USAGE_USD]) {
    taskService.associateUsageRecord({
      taskId: TASK_B,
      sessionId: session.id,
      usageRecordId: usageId,
    });
  }

  const cost = taskService.getTaskVerifiedCost(TASK_B);

  if (cost !== null) {
    throw new Error(`mixed currency should be null, got ${JSON.stringify(cost)}`);
  }
});

check("17. task whose only association has no cost record is unavailable (null)", () => {
  taskService.completeTaskSession({ sessionId: "smoke-session-4" });

  const session = taskService.startTaskSession({
    taskId: TASK_C,
    sessionId: "smoke-session-5",
  });

  taskService.associateUsageRecord({
    taskId: TASK_C,
    sessionId: session.id,
    usageRecordId: USAGE_NO_COST,
  });

  const cost = taskService.getTaskVerifiedCost(TASK_C);

  if (cost !== null) {
    throw new Error(`no-cost task should be null, got ${JSON.stringify(cost)}`);
  }

  taskService.completeTaskSession({ sessionId: "smoke-session-5" });
});

check("18. task with only unreliable attribution is unavailable (null), not an estimate", () => {
  const session = taskService.startTaskSession({
    taskId: TASK_D,
    sessionId: "smoke-session-6",
  });

  taskService.associateUsageRecord({
    taskId: TASK_D,
    sessionId: session.id,
    usageRecordId: USAGE_ESTIMATED,
  });

  const cost = taskService.getTaskVerifiedCost(TASK_D);

  if (cost !== null) {
    throw new Error(`unreliable-only task should be null, got ${JSON.stringify(cost)}`);
  }
});

check("19. all-reliable single-currency task returns the verified sum", () => {
  taskService.completeTaskSession({ sessionId: "smoke-session-6" });

  const session = taskService.startTaskSession({
    taskId: TASK_G,
    sessionId: "smoke-session-7",
  });

  for (const usageId of [USAGE_CNY_1, USAGE_CNY_2]) {
    taskService.associateUsageRecord({
      taskId: TASK_G,
      sessionId: session.id,
      usageRecordId: usageId,
    });
  }

  const cost = taskService.getTaskVerifiedCost(TASK_G);

  if (!cost || cost.amountMicros !== 123517890 || cost.currency !== "CNY") {
    throw new Error(`all-reliable task should be {123517890, CNY}, got ${JSON.stringify(cost)}`);
  }
});

check("20. verified official CNY cost + official-verified usage without cost_record -> null", () => {
  taskService.completeTaskSession({ sessionId: "smoke-session-7" });

  const session = taskService.startTaskSession({
    taskId: TASK_E,
    sessionId: "smoke-session-8",
  });

  for (const usageId of [USAGE_CNY_1, USAGE_NO_COST]) {
    taskService.associateUsageRecord({
      taskId: TASK_E,
      sessionId: session.id,
      usageRecordId: usageId,
    });
  }

  const cost = taskService.getTaskVerifiedCost(TASK_E);

  if (cost !== null) {
    throw new Error(`verified cost + missing cost_record should be null, got ${JSON.stringify(cost)}`);
  }
});

check("21. verified official CNY cost + local_estimate/estimated cost -> null", () => {
  taskService.completeTaskSession({ sessionId: "smoke-session-8" });

  const session = taskService.startTaskSession({
    taskId: TASK_F,
    sessionId: "smoke-session-9",
  });

  for (const usageId of [USAGE_CNY_1, USAGE_ESTIMATED]) {
    taskService.associateUsageRecord({
      taskId: TASK_F,
      sessionId: session.id,
      usageRecordId: usageId,
    });
  }

  const cost = taskService.getTaskVerifiedCost(TASK_F);

  if (cost !== null) {
    throw new Error(`verified cost + estimated cost should be null, got ${JSON.stringify(cost)}`);
  }
});

check("22. smoke test is fully isolated from the production and project databases", () => {
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