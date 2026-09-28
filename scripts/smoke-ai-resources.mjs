/*
 * R3.1 AI Resource layer smoke test.
 *
 * Every assertion goes through the real Next.js route handlers
 * (app/api/planner/resources/**\/route.ts) with a real Request
 * object, so the HTTP status codes and the JSON bodies are what a
 * client would actually receive.
 *
 * The database is an isolated, freshly-created temp file:
 * NODE_ENV=development plus a chdir to a temp directory happen
 * BEFORE any library module is loaded, so neither
 * data/ai-token-cost-monitor.db nor %APPDATA%\AI-Cost-Management is
 * ever opened for writing. seed:registry is never called.
 *
 * The real project database is fingerprinted by SHA-256 as well as
 * by size and mtime before the run and again at the end. R3.1 must
 * leave it byte-for-byte identical.
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

const REAL_PROJECT_DB = path.resolve(
  DIR,
  "..",
  "data",
  "ai-token-cost-monitor.db"
);

function sha256Of(file) {
  const hash = createHash("sha256");
  hash.update(readFileSync(file));
  return hash.digest("hex");
}

function realDbFiles() {
  const dataDirs = [path.resolve(DIR, "..", "data")];

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

const realDatabaseBefore = realDbFiles();
const realDbShaBefore = sha256Of(REAL_PROJECT_DB);

const TEMP_DIR = mkdtempSync(
  path.join(tmpdir(), "r31-ai-resources-")
);

process.env.NODE_ENV = "development";
process.chdir(TEMP_DIR);

const { dbPath, getDb } = await import("../lib/db.ts");
const { initDb } = await import("../lib/schema.ts");
const aiResourceService = await import(
  "../lib/services/ai-resource-service.ts"
);
const {
  plannerErrorStatus,
} = await import("../lib/planner-api-errors.ts");
const {
  createUserAiTool,
} = await import("../lib/registry/ai-registry-repository.ts");

const resourcesRoute = await import(
  "../app/api/planner/resources/route.ts"
);
const resourceRoute = await import(
  "../app/api/planner/resources/[id]/route.ts"
);
const archiveRoute = await import(
  "../app/api/planner/resources/[id]/archive/route.ts"
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

/* ---------------------------------------------------------------- */
/* Route invocation helpers                                         */
/* ---------------------------------------------------------------- */

const BASE = "http://localhost:3000";

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
      `response body is not JSON: ${text.slice(
        0,
        200
      )}`
    );
  }

  return {
    status: response.status,
    body: parsed,
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

const patch = (handler, url, body, params) =>
  call(handler, {
    method: "PATCH",
    url,
    body,
    params,
  });

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
    "code,error",
    `${label} carries only the documented error fields`
  );
  assertEqual(
    response.body.code,
    code,
    `${label} code`
  );
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
/* Fixtures: 1 provider, 3 models, 2 user tools                     */
/* ---------------------------------------------------------------- */

const NOW = "2026-09-28T00:00:00.000Z";

initDb();

getDb()
  .prepare(
    `INSERT INTO providers (id, name, created_at) VALUES (?, ?, ?)`
  )
  .run("provider_r31", "R3.1 Provider", NOW);

for (const id of [
  "model_r31_a",
  "model_r31_b",
  "model_r31_c",
]) {
  getDb()
    .prepare(
      `INSERT INTO models (id, provider_id, name, created_at) VALUES (?, ?, ?, ?)`
    )
    .run(id, "provider_r31", id, NOW);
}

createUserAiTool({
  id: "tool_r31_cli",
  name: "R3.1 CLI",
  category: "cli",
  createdAt: NOW,
});
createUserAiTool({
  id: "tool_r31_ide",
  name: "R3.1 IDE",
  category: "ide",
  createdAt: NOW,
});

const DIRECT = { name: "Direct API (PAYG)", modelId: "model_r31_a", accessMethod: "pay_as_you_go" };

/* ---------------------------------------------------------------- */
/* 1-6. Schema and creation                                         */
/* ---------------------------------------------------------------- */

await check("1. schema creates ai_resources with exactly the designed columns", () => {
  const columns = columnsOf("ai_resources");

  assertEqual(
    columns.join(","),
    "id,name,tool_id,model_id,access_method,entitlement_name,entitlement_source_url,entitlement_checked_at,status,notes,created_at,updated_at",
    "ai_resources column set"
  );
  assertEqual(
    countRows("ai_resources"),
    0,
    "a fresh database starts empty"
  );
  assertEqual(
    getDb()
      .prepare(`PRAGMA journal_mode`)
      .get().journal_mode,
    "wal",
    "journal mode stays WAL"
  );
});

const directRes = await post(
  resourcesRoute.POST,
  "/api/planner/resources",
  DIRECT
);
const DIRECT_ID = directRes.body.resource.id;

await check("2. can create a direct API resource with toolId null", () => {
  assertEqual(directRes.status, 201, "status");
  assertEqual(directRes.body.ok, true, "ok");
  assertEqual(
    directRes.body.resource.model_id,
    "model_r31_a",
    "model_id stored"
  );
  assertEqual(
    directRes.body.resource.access_method,
    "pay_as_you_go",
    "access_method stored"
  );
  assertEqual(
    directRes.body.resource.tool_id,
    null,
    "a direct resource has no tool binding"
  );
  assertEqual(
    directRes.body.resource.status,
    "active",
    "a new resource starts active"
  );
  assert(
    typeof directRes.body.resource.id === "string" &&
      directRes.body.resource.id.length > 0,
    "the server generated an id"
  );
});

const subRes = await post(
  resourcesRoute.POST,
  "/api/planner/resources",
  {
    name: "Pro subscription",
    modelId: "model_r31_b",
    toolId: "tool_r31_cli",
    accessMethod: "subscription",
    entitlementName: "Pro plan",
    entitlementSourceUrl: "https://example.invalid/pro",
    entitlementCheckedAt: NOW,
  }
);
const SUB_ID = subRes.body.resource.id;

await check("3. can create a subscription resource", () => {
  assertEqual(subRes.status, 201, "status");
  assertEqual(
    subRes.body.resource.access_method,
    "subscription",
    "access_method stored"
  );
  assertEqual(
    subRes.body.resource.tool_id,
    "tool_r31_cli",
    "tool binding stored"
  );
  assertEqual(
    subRes.body.resource.entitlement_name,
    "Pro plan",
    "entitlement name stored"
  );
  assertEqual(
    subRes.body.resource.entitlement_source_url,
    "https://example.invalid/pro",
    "entitlement source stored"
  );
});

const freeRes = await post(
  resourcesRoute.POST,
  "/api/planner/resources",
  {
    name: "Free tier",
    modelId: "model_r31_a",
    toolId: "tool_r31_cli",
    accessMethod: "free_tier",
  }
);

await check("4. can create a free_tier resource", () => {
  assertEqual(freeRes.status, 201, "status");
  assertEqual(
    freeRes.body.resource.access_method,
    "free_tier",
    "access_method stored"
  );
});

const paygRes = await post(
  resourcesRoute.POST,
  "/api/planner/resources",
  {
    name: "Pay as you go direct",
    modelId: "model_r31_c",
    toolId: null,
    accessMethod: "pay_as_you_go",
  }
);

await check("5. can create a pay_as_you_go resource", () => {
  assertEqual(paygRes.status, 201, "status");
  assertEqual(
    paygRes.body.resource.access_method,
    "pay_as_you_go",
    "access_method stored"
  );
  assertEqual(
    paygRes.body.resource.tool_id,
    null,
    "an explicit null toolId is stored as no tool"
  );
});

const unknownRes = await post(
  resourcesRoute.POST,
  "/api/planner/resources",
  {
    name: "Unknown access",
    modelId: "model_r31_c",
    toolId: "tool_r31_ide",
    accessMethod: "unknown",
  }
);

await check("6. can create an unknown resource", () => {
  assertEqual(unknownRes.status, 201, "status");
  assertEqual(
    unknownRes.body.resource.access_method,
    "unknown",
    "unknown is a legal closed-set value"
  );
});

/* ---------------------------------------------------------------- */
/* 7-11. Refusals                                                   */
/* ---------------------------------------------------------------- */

await check("7. a missing model_id is refused", () => {
  return post(
    resourcesRoute.POST,
    "/api/planner/resources",
    {
      name: "No such model",
      modelId: "no-such-model",
      accessMethod: "free_tier",
    }
  ).then((res) => {
    expectError(
      res,
      404,
      "MODEL_NOT_FOUND",
      "unknown model"
    );
    assertEqual(
      countRows("ai_resources"),
      5,
      "no row was created"
    );
  });
});

await check("8. a missing tool_id is refused", () => {
  return post(
    resourcesRoute.POST,
    "/api/planner/resources",
    {
      name: "No such tool",
      modelId: "model_r31_a",
      toolId: "no-such-tool",
      accessMethod: "free_tier",
    }
  ).then((res) => {
    expectError(
      res,
      404,
      "TOOL_NOT_FOUND",
      "unknown tool"
    );
    assertEqual(
      countRows("ai_resources"),
      5,
      "no row was created"
    );
  });
});

await check("9. an access_method outside the closed set is refused", () => {
  return post(
    resourcesRoute.POST,
    "/api/planner/resources",
    {
      name: "Trial",
      modelId: "model_r31_a",
      accessMethod: "trial",
    }
  ).then((res) => {
    expectError(
      res,
      400,
      "INVALID_ENUM",
      "invalid accessMethod"
    );
    assertEqual(
      countRows("ai_resources"),
      5,
      "no row was created"
    );
  });
});

await check("10. an empty name is refused", () => {
  return post(
    resourcesRoute.POST,
    "/api/planner/resources",
    {
      name: "  ",
      modelId: "model_r31_a",
      accessMethod: "free_tier",
    }
  ).then((res) => {
    expectError(
      res,
      400,
      "INVALID_TEXT",
      "blank name"
    );
    assertEqual(
      countRows("ai_resources"),
      5,
      "no row was created"
    );
  });
});

await check("11. a duplicate (tool_id, model_id, access_method) is refused", () => {
  return Promise.all([
    /*
     * The direct API key: NULL tool collapses to '' by the expression
     * index, so a second "direct API" row for the same model and
     * method is a conflict even though SQLite would otherwise treat
     * two NULLs as distinct.
     */
    post(
      resourcesRoute.POST,
      "/api/planner/resources",
      DIRECT
    ).then((res) =>
      expectError(
        res,
        409,
        "DUPLICATE_AI_RESOURCE",
        "duplicate direct resource"
      )
    ),
    /*
     * The tool-bound key, caught by the UNIQUE(tool_id, model_id,
     * access_method) constraint.
     */
    post(
      resourcesRoute.POST,
      "/api/planner/resources",
      {
        name: "Free tier duplicate",
        modelId: "model_r31_a",
        toolId: "tool_r31_cli",
        accessMethod: "free_tier",
      }
    ).then((res) =>
      expectError(
        res,
        409,
        "DUPLICATE_AI_RESOURCE",
        "duplicate tool-bound resource"
      )
    ),
  ]).then(() => {
    assertEqual(
      countRows("ai_resources"),
      5,
      "neither duplicate created a row"
    );
  });
});

/* ---------------------------------------------------------------- */
/* 12-16. Listing, archiving, reading                               */
/* ---------------------------------------------------------------- */

await check("12. list defaults to the active view", () => {
  return get(
    resourcesRoute.GET,
    "/api/planner/resources"
  ).then((res) => {
    assertEqual(res.status, 200, "status");
    assertEqual(res.body.ok, true, "ok");
    assertEqual(
      res.body.items.length,
      5,
      "all five resources are active"
    );
    assertEqual(
      res.body.items.every(
        (item) => item.status === "active"
      ),
      true,
      "no archived row in the default view"
    );
  });
});

const archiveRes = await post(
  archiveRoute.POST,
  `/api/planner/resources/${DIRECT_ID}/archive`,
  undefined,
  { id: DIRECT_ID }
);

await check("13. archive moves a resource out of the active view", () => {
  assertEqual(archiveRes.status, 200, "status");
  assertEqual(archiveRes.body.ok, true, "ok");
  assertEqual(
    archiveRes.body.resource.status,
    "archived",
    "the row is archived"
  );
});

await check("14. an archived resource no longer appears in the active list", () => {
  return Promise.all([
    get(
      resourcesRoute.GET,
      "/api/planner/resources"
    ).then((res) => {
      assertEqual(
        res.body.items.length,
        4,
        "active view dropped the archived row"
      );
      assertEqual(
        res.body.items.some(
          (item) => item.id === DIRECT_ID
        ),
        false,
        "the archived resource is absent"
      );
    }),
    get(
      resourcesRoute.GET,
      "/api/planner/resources?status=archived"
    ).then((res) => {
      assertEqual(
        res.body.items.length,
        1,
        "the archived view has exactly it"
      );
      assertEqual(
        res.body.items[0].id,
        DIRECT_ID,
        "the archived row is listed"
      );
    }),
    get(
      resourcesRoute.GET,
      "/api/planner/resources?status=all"
    ).then((res) => {
      assertEqual(
        res.body.items.length,
        5,
        "all view includes archived and active"
      );
    }),
    get(
      resourcesRoute.GET,
      "/api/planner/resources?status=frozen"
    ).then((res) =>
      expectError(
        res,
        400,
        "INVALID_QUERY",
        "invalid status query"
      )
    ),
  ]);
});

await check("15. archive does not delete the record", () => {
  assertEqual(
    countRows("ai_resources"),
    5,
    "the row still exists in the table"
  );
  const row = getDb()
    .prepare(
      `SELECT id, status FROM ai_resources WHERE id = ?`
    )
    .get(DIRECT_ID);

  assert(row !== undefined, "the row is present");
  assertEqual(
    row.status,
    "archived",
    "the row is archived, not gone"
  );
});

await check("16. an archived resource is still readable by id", () => {
  return get(
    resourceRoute.GET,
    `/api/planner/resources/${DIRECT_ID}`,
    { id: DIRECT_ID }
  ).then((res) => {
    assertEqual(res.status, 200, "status");
    assertEqual(
      res.body.resource.id,
      DIRECT_ID,
      "the archived resource loads"
    );
    assertEqual(
      res.body.resource.status,
      "archived",
      "and reads back as archived"
    );
  });
});

/* ---------------------------------------------------------------- */
/* 17-18. PATCH                                                      */
/* ---------------------------------------------------------------- */

await check("17. PATCH updates only the allowed fields", () => {
  return patch(
    resourceRoute.PATCH,
    `/api/planner/resources/${SUB_ID}`,
    {
      name: "Pro subscription (renewed)",
      notes: "paid annually",
      entitlementName: "Pro plan 2026",
      entitlementSourceUrl: null,
    },
    { id: SUB_ID }
  ).then((res) => {
    assertEqual(res.status, 200, "status");
    assertEqual(
      res.body.resource.name,
      "Pro subscription (renewed)",
      "name updated"
    );
    assertEqual(
      res.body.resource.notes,
      "paid annually",
      "notes updated"
    );
    assertEqual(
      res.body.resource.entitlement_name,
      "Pro plan 2026",
      "entitlement name updated"
    );
    assertEqual(
      res.body.resource.entitlement_source_url,
      null,
      "an explicit null clears the optional value"
    );
    assertEqual(
      res.body.resource.access_method,
      "subscription",
      "an unsent field is untouched"
    );
    assertEqual(
      res.body.resource.model_id,
      "model_r31_b",
      "model_id is untouched"
    );
  });
});

await check("18. status cannot be modified through PATCH", () => {
  return patch(
    resourceRoute.PATCH,
    `/api/planner/resources/${SUB_ID}`,
    { status: "archived" },
    { id: SUB_ID }
  ).then((res) => {
    expectError(
      res,
      400,
      "UNKNOWN_FIELD",
      "status in the PATCH body"
    );

    const row = getDb()
      .prepare(
        `SELECT status FROM ai_resources WHERE id = ?`
      )
      .get(SUB_ID);

    assertEqual(
      row.status,
      "active",
      "the status did not change"
    );
  });
});

/* ---------------------------------------------------------------- */
/* 19-20. Not-found and stable codes                                */
/* ---------------------------------------------------------------- */

await check("19. an unknown resource id is a 404 everywhere", () => {
  return Promise.all([
    get(
      resourceRoute.GET,
      "/api/planner/resources/no-such-resource",
      { id: "no-such-resource" }
    ).then((res) =>
      expectError(
        res,
        404,
        "AI_RESOURCE_NOT_FOUND",
        "GET missing resource"
      )
    ),
    patch(
      resourceRoute.PATCH,
      "/api/planner/resources/no-such-resource",
      { name: "Nope" },
      { id: "no-such-resource" }
    ).then((res) =>
      expectError(
        res,
        404,
        "AI_RESOURCE_NOT_FOUND",
        "PATCH missing resource"
      )
    ),
    post(
      archiveRoute.POST,
      "/api/planner/resources/no-such-resource/archive",
      undefined,
      { id: "no-such-resource" }
    ).then((res) =>
      expectError(
        res,
        404,
        "AI_RESOURCE_NOT_FOUND",
        "archive missing resource"
      )
    ),
  ]);
});

await check("20. missing model/tool and resource map to stable 404 codes", () => {
  assertEqual(
    plannerErrorStatus("MODEL_NOT_FOUND"),
    404,
    "MODEL_NOT_FOUND is a 404"
  );
  assertEqual(
    plannerErrorStatus("TOOL_NOT_FOUND"),
    404,
    "TOOL_NOT_FOUND is a 404"
  );
  assertEqual(
    plannerErrorStatus("AI_RESOURCE_NOT_FOUND"),
    404,
    "AI_RESOURCE_NOT_FOUND is a 404"
  );

  return post(
    resourcesRoute.POST,
    "/api/planner/resources",
    {
      name: "Bad refs",
      modelId: "model_r31_a",
      toolId: "no-such-tool",
      accessMethod: "free_tier",
    }
  ).then((res) =>
    expectError(
      res,
      404,
      "TOOL_NOT_FOUND",
      "the tool is still checked even with a valid model"
    )
  );
});

/* ---------------------------------------------------------------- */
/* API contract extras                                              */
/* ---------------------------------------------------------------- */

await check("e1. server-owned and judgement fields are rejected on POST", () => {
  const forbidden = [
    "id",
    "status",
    "createdAt",
    "updatedAt",
    "costMinMicros",
    "costCurrency",
    "role",
    "score",
    "rank",
    "selected",
    "recommended",
    "apiKey",
  ];

  return forbidden.reduce(
    (chain, key) =>
      chain.then(() =>
        post(
          resourcesRoute.POST,
          "/api/planner/resources",
          {
            name: "Leak",
            modelId: "model_r31_a",
            accessMethod: "free_tier",
            [key]: 1,
          }
        ).then((res) =>
          expectError(
            res,
            400,
            "UNKNOWN_FIELD",
            `sending "${key}"`
          )
        )
      ),
    Promise.resolve()
  ).then(() => {
    assertEqual(
      countRows("ai_resources"),
      5,
      "none of the rejected requests created a row"
    );
  });
});

await check("e2. server-owned and judgement fields are rejected on PATCH", () => {
  const forbidden = [
    "id",
    "createdAt",
    "updatedAt",
    "costMinMicros",
    "role",
    "score",
    "rank",
    "selected",
    "recommended",
  ];

  return forbidden.reduce(
    (chain, key) =>
      chain.then(() =>
        patch(
          resourceRoute.PATCH,
          `/api/planner/resources/${SUB_ID}`,
          { [key]: 1 },
          { id: SUB_ID }
        ).then((res) =>
          expectError(
            res,
            400,
            "UNKNOWN_FIELD",
            `patching "${key}"`
          )
        )
      ),
    Promise.resolve()
  );
});

await check("e3. an invalid entitlement source URL is refused", () => {
  return patch(
    resourceRoute.PATCH,
    `/api/planner/resources/${SUB_ID}`,
    { entitlementSourceUrl: "not-a-url" },
    { id: SUB_ID }
  ).then((res) =>
    expectError(
      res,
      400,
      "INVALID_URL",
      "relative URL"
    )
  );
});

await check("e4. the archive endpoint ignores a request body", () => {
  return post(
    archiveRoute.POST,
    `/api/planner/resources/${SUB_ID}/archive`,
    { status: "active", deleted: true },
    { id: SUB_ID }
  ).then((res) => {
    assertEqual(res.status, 200, "status");
    assertEqual(
      res.body.resource.status,
      "archived",
      "the resource is archived"
    );
  });
});

await check("e5. the service has no status field in its update input", () => {
  /*
   * Bypassing the HTTP whitelist entirely: even if a caller pushes an
   * unrecognised "status" key straight into the service, the update
   * path does not read it and the row's status is untouched.
   */
  const row = aiResourceService.updateAiResource(SUB_ID, {
    name: "Still no status change",
    status: "archived",
  });

  assertEqual(
    row.status,
    "archived",
    "the row is still whatever the archive command set"
  );
  assertEqual(
    row.name,
    "Still no status change",
    "the recognised field still updated"
  );
});

await check("e6. ai_resources carries no scoring, ranking or credential column", () => {
  for (const column of columnsOf("ai_resources")) {
    for (const forbidden of [
      "score",
      "rank",
      "tier",
      "weight",
      "confidence",
      "quality",
      "winner",
      "role",
      "selected",
      "recommended",
      "cost",
      "price",
      "quota",
      "balance",
      "api_key",
      "token",
      "password",
      "secret",
      "credential",
    ]) {
      assert(
        !column.includes(forbidden),
        `ai_resources must not have "${column}"`
      );
    }
  }
});

/* ---------------------------------------------------------------- */
/* 21-22. Isolation and the real database                           */
/* ---------------------------------------------------------------- */

await check("21. the run used an isolated temporary database", () => {
  assert(
    path.normalize(dbPath).startsWith(
      path.normalize(TEMP_DIR)
    ),
    `dbPath ${dbPath} is not under the temp dir`
  );
  assert(
    existsSync(dbPath),
    "the temp database was created"
  );
  assertEqual(
    JSON.stringify(realDbFiles()),
    JSON.stringify(realDatabaseBefore),
    "no real database file changed size or mtime"
  );
});

await check("22. the real project database SHA-256 is unchanged", () => {
  const after = sha256Of(REAL_PROJECT_DB);

  assertEqual(
    after,
    realDbShaBefore,
    "real db bytes changed"
  );
});

/* ---------------------------------------------------------------- */
/* Final FK cascade, run last so it does not disturb fixtures       */
/* ---------------------------------------------------------------- */

await check("e7. deleting a model cascades its resources away", () => {
  const before = countRows("ai_resources");

  assertEqual(
    before,
    5,
    "precondition: five resources exist"
  );

  getDb()
    .prepare(
      `DELETE FROM models WHERE id = 'model_r31_a'`
    )
    .run();

  assertEqual(
    countRows("ai_resources"),
    3,
    "model_r31_a had two resources and they cascaded"
  );

  assertEqual(
    countRows("user_ai_tools"),
    2,
    "the tools themselves are untouched"
  );
});

console.log("");
console.log(`smoke-ai-resources: ${passed} passed, ${failed} failed`);
console.log(`real project db sha256: ${realDbShaBefore}`);
console.log(`isolated db: ${dbPath}`);
console.log(`temp dir kept for inspection: ${TEMP_DIR}`);

if (failed > 0) {
  console.error("");
  console.error("Failures:");

  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }

  process.exitCode = 1;
}