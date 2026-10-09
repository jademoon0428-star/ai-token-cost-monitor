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

const DIR = path.dirname(
  fileURLToPath(import.meta.url)
);

register(
  pathToFileURL(
    path.join(DIR, "ts-smoke-loader.mjs")
  ).href,
  import.meta.url
);

const productionFileSnapshot =
  snapshotProductionFiles();

const TEMP_DIR = mkdtempSync(
  path.join(tmpdir(), "commercial-lifecycle-smoke-")
);

process.env.NODE_ENV = "development";
process.chdir(TEMP_DIR);

const { dbPath, getDb } = await import(
  "../lib/db.ts"
);
const service = await import(
  "../lib/services/commercial-service.ts"
);
const repo = await import(
  "../lib/repositories/commercial-repository.ts"
);

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    console.error(
      `FAIL ${name}: ${error.message}`
    );
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(
        expected
      )}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertAllCapabilities(
  evaluation,
  expectedValue,
  label
) {
  for (const [capability, value] of Object.entries(
    evaluation.capabilities
  )) {
    if (value !== expectedValue) {
      throw new Error(
        `${label}: capability ${capability} expected ${expectedValue}, got ${value}`
      );
    }
  }
}

const T0 = new Date(
  "2026-01-01T00:00:00.000Z"
);
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

function at(offsetMs) {
  return new Date(T0.getTime() + offsetMs);
}

check(
  "fresh database has no commercial_state row",
  () => {
    assertEqual(
      repo.getCommercialStateRow(),
      undefined,
      "row"
    );
  }
);

check(
  "ensureCommercialStateRow creates singleton with first_use_at uninitialized",
  () => {
    const row = repo.ensureCommercialStateRow(
      T0.toISOString()
    );

    assertEqual(
      row.first_use_at,
      null,
      "first_use_at"
    );
    assertEqual(row.paid, 0, "paid");

    const count = Number(
      getDb()
        .prepare(
          `SELECT COUNT(*) AS count FROM commercial_state`
        )
        .get().count
    );

    assertEqual(count, 1, "row count");
  }
);

check(
  "getCommercialLifecycle before start returns null and does not write first_use_at",
  () => {
    const lifecycle =
      service.getCommercialLifecycle(T0);

    assertEqual(
      lifecycle,
      null,
      "lifecycle before start"
    );

    const row = repo.getCommercialStateRow();

    assertEqual(
      row?.first_use_at ?? null,
      null,
      "first_use_at after read"
    );
  }
);

check(
  "capabilities are denied until the trial explicitly starts",
  () => {
    assertEqual(
      service.evaluateCommercialCapabilities(T0),
      null,
      "evaluation before start"
    );
    assertEqual(
      service.isCommercialCapabilityAllowed(
        "planner_advanced",
        T0
      ),
      false,
      "capability before start"
    );
  }
);

check(
  "startCommercialTrial writes first_use_at and begins full_access_trial",
  () => {
    const lifecycle =
      service.startCommercialTrial(T0);

    assertEqual(
      lifecycle.lifecycleState,
      "full_access_trial",
      "lifecycleState"
    );
    assertEqual(
      lifecycle.firstUseAt,
      T0.toISOString(),
      "firstUseAt"
    );
    assertEqual(
      lifecycle.trialExpired,
      false,
      "trialExpired"
    );
    assertEqual(
      lifecycle.daysSinceFirstUse,
      0,
      "daysSinceFirstUse"
    );
    assertEqual(
      repo.getCommercialStateRow()?.first_use_at,
      T0.toISOString(),
      "stored first_use_at"
    );
  }
);

check(
  "repeated startCommercialTrial never changes the original first_use_at",
  () => {
    const again =
      service.startCommercialTrial(
        at(5 * DAY_MS)
      );

    assertEqual(
      again.firstUseAt,
      T0.toISOString(),
      "firstUseAt after repeat start"
    );
    assertEqual(
      repo.getCommercialStateRow()?.first_use_at,
      T0.toISOString(),
      "stored first_use_at after repeat start"
    );
    assertEqual(
      again.lifecycleState,
      "full_access_trial",
      "lifecycleState"
    );
    assertEqual(
      again.daysSinceFirstUse,
      5,
      "daysSinceFirstUse"
    );
  }
);

check(
  "commercial_state singleton row count stays 1",
  () => {
    service.getCommercialLifecycle(at(HOUR_MS));
    service.getCommercialLifecycle(
      at(2 * HOUR_MS)
    );

    const row = getDb()
      .prepare(
        `SELECT COUNT(*) AS count FROM commercial_state`
      )
      .get();

    assertEqual(
      Number(row.count),
      1,
      "row count"
    );
  }
);

check(
  "first_use_at is never rewritten by later reads",
  () => {
    const later =
      service.getCommercialLifecycle(
        at(200 * DAY_MS)
      );

    assertEqual(
      later.firstUseAt,
      T0.toISOString(),
      "firstUseAt after 200 days"
    );
    assertEqual(
      later.lifecycleState,
      "paid_required",
      "lifecycleState after 200 days"
    );
  }
);

check(
  "paidRequiredAt is exactly first use + 90 days",
  () => {
    const lifecycle =
      service.getCommercialLifecycle(T0);

    assertEqual(
      lifecycle.paidRequiredAt,
      new Date(
        T0.getTime() + 90 * DAY_MS
      ).toISOString(),
      "paidRequiredAt"
    );
  }
);

check(
  "day 89 -> full_access_trial",
  () => {
    const lifecycle = service.getCommercialLifecycle(
      at(88 * DAY_MS + 12 * HOUR_MS)
    );

    assertEqual(
      lifecycle.lifecycleState,
      "full_access_trial",
      "lifecycleState"
    );
    assertEqual(
      lifecycle.trialExpired,
      false,
      "trialExpired"
    );
  }
);

check(
  "day 90 -> full_access_trial",
  () => {
    const lifecycle = service.getCommercialLifecycle(
      at(89 * DAY_MS + 12 * HOUR_MS)
    );

    assertEqual(
      lifecycle.lifecycleState,
      "full_access_trial",
      "lifecycleState"
    );
    assertEqual(
      lifecycle.trialExpired,
      false,
      "trialExpired"
    );
  }
);

check(
  "last millisecond before day 91 -> full_access_trial",
  () => {
    const lifecycle = service.getCommercialLifecycle(
      at(90 * DAY_MS - 1)
    );

    assertEqual(
      lifecycle.lifecycleState,
      "full_access_trial",
      "lifecycleState"
    );
  }
);

check(
  "exact day 91 boundary -> paid_required",
  () => {
    const lifecycle = service.getCommercialLifecycle(
      at(90 * DAY_MS)
    );

    assertEqual(
      lifecycle.lifecycleState,
      "paid_required",
      "lifecycleState"
    );
    assertEqual(
      lifecycle.trialExpired,
      true,
      "trialExpired"
    );
    assertEqual(
      lifecycle.daysSinceFirstUse,
      90,
      "daysSinceFirstUse"
    );
  }
);

check(
  "day 91 midday -> paid_required",
  () => {
    const lifecycle = service.getCommercialLifecycle(
      at(90 * DAY_MS + 12 * HOUR_MS)
    );

    assertEqual(
      lifecycle.lifecycleState,
      "paid_required",
      "lifecycleState"
    );
  }
);

check(
  "91 days elapsed -> paid_required",
  () => {
    const lifecycle = service.getCommercialLifecycle(
      at(91 * DAY_MS)
    );

    assertEqual(
      lifecycle.lifecycleState,
      "paid_required",
      "lifecycleState"
    );
  }
);

check(
  "capability set is exactly the six frozen names",
  () => {
    const evaluation =
      service.evaluateCommercialCapabilities(
        at(10 * DAY_MS)
      );

    const names =
      Object.keys(
        evaluation.capabilities
      ).sort();

    const expected = [
      "ai_activity_advanced",
      "budget_control",
      "cost_advanced",
      "planner_advanced",
      "planner_historical_efficiency",
      "productivity_efficiency",
    ].sort();

    assertEqual(
      JSON.stringify(names),
      JSON.stringify(expected),
      "capability names"
    );
  }
);

check(
  "trial + unpaid: all six capabilities allowed",
  () => {
    const evaluation =
      service.evaluateCommercialCapabilities(
        at(10 * DAY_MS)
      );

    assertEqual(
      evaluation.lifecycleState,
      "full_access_trial",
      "lifecycleState"
    );
    assertEqual(
      evaluation.paid,
      false,
      "paid"
    );
    assertAllCapabilities(
      evaluation,
      true,
      "trial unpaid"
    );
  }
);

check(
  "day 91 + unpaid: state paid_required, all six denied",
  () => {
    const now = at(
      90 * DAY_MS + 12 * HOUR_MS
    );

    const evaluation =
      service.evaluateCommercialCapabilities(now);

    assertEqual(
      evaluation.lifecycleState,
      "paid_required",
      "lifecycleState"
    );
    assertEqual(
      evaluation.paid,
      false,
      "paid"
    );
    assertAllCapabilities(
      evaluation,
      false,
      "expired unpaid"
    );

    assertEqual(
      service.isCommercialCapabilityAllowed(
        "planner_advanced",
        now
      ),
      false,
      "single capability probe"
    );
  }
);

check(
  "day 91 + paid: state paid_required, all six allowed",
  () => {
    const now = at(
      90 * DAY_MS + 12 * HOUR_MS
    );

    const evaluation =
      service.setCommercialPaid(true, now);

    assertEqual(
      evaluation.lifecycleState,
      "paid_required",
      "lifecycleState"
    );
    assertEqual(
      evaluation.paid,
      true,
      "paid"
    );
    assertEqual(
      evaluation.paidAt,
      now.toISOString(),
      "paidAt"
    );
    assertAllCapabilities(
      evaluation,
      true,
      "expired paid"
    );
  }
);

check(
  "paid status persists across later reads",
  () => {
    const evaluation =
      service.evaluateCommercialCapabilities(
        at(91 * DAY_MS)
      );

    assertEqual(
      evaluation.paid,
      true,
      "paid"
    );
    assertAllCapabilities(
      evaluation,
      true,
      "expired paid persisted"
    );
  }
);

check(
  "paid unset returns to denied capabilities",
  () => {
    const now = at(
      92 * DAY_MS
    );

    const evaluation =
      service.setCommercialPaid(false, now);

    assertEqual(
      evaluation.paid,
      false,
      "paid"
    );
    assertEqual(
      evaluation.paidAt,
      null,
      "paidAt"
    );
    assertAllCapabilities(
      evaluation,
      false,
      "expired unpaid again"
    );
  }
);

check(
  "unknown capability name is denied",
  () => {
    assertEqual(
      service.isCommercialCapabilityAllowed(
        "not_a_capability",
        at(10 * DAY_MS)
      ),
      false,
      "unknown capability"
    );
  }
);

check(
  "service read did not create or touch any usage/cost/planner rows",
  () => {
    const tables = [
      "usage_records",
      "cost_records",
      "projects",
      "project_plans",
    ];

    for (const table of tables) {
      const row = getDb()
        .prepare(
          `SELECT COUNT(*) AS count FROM ${table}`
        )
        .get();

      assertEqual(
        Number(row.count),
        0,
        `${table} row count`
      );
    }
  }
);

const normalized = path.normalize(TEMP_DIR);

if (!dbPath.startsWith(normalized)) {
  console.error(
    `FAIL dbPath ${dbPath} is not under the temp dir ${TEMP_DIR}`
  );
  failed++;
} else {
  passed++;
  console.log(
    "PASS dbPath stays under the isolated temp dir"
  );
}

const after =
  snapshotProductionFiles();

if (
  JSON.stringify(after) !==
  JSON.stringify(productionFileSnapshot)
) {
  console.error(
    "FAIL production database files changed during the smoke test"
  );
  failed++;
} else {
  passed++;
  console.log(
    "PASS production database files unchanged"
  );
}

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
