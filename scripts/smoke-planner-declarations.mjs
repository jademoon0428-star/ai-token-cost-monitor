/*
 * Declared Resources API smoke test (Commit 2).
 *
 * Covers the whole independent Declared Resources chain through the
 * real Next.js route handlers with real Request objects, so the HTTP
 * status codes and the JSON bodies are exactly what a client would
 * receive:
 *
 *   create -> list -> get -> update -> archive -> archived leaves the
 *   active view -> not found / validation error paths.
 *
 * What is asserted beyond the happy path:
 *
 * - the stored row has exactly the 16 documented columns, so no
 *   credential, api key, endpoint, balance or price column exists to
 *   leak; the same key set is what POST returns.
 * - capability facts stay three-state (1 / 0 / null) and are never
 *   turned into a boolean or a default.
 * - a price-shaped or credential-shaped body key is refused by the
 *   field whitelist (UNKNOWN_FIELD), and status cannot be written
 *   through PATCH, because archiving is a one-way command.
 * - archived rows leave the active list but are never deleted, so a
 *   stored AI option pointing at one still resolves.
 *
 * The database is an isolated, freshly-created temp file:
 * NODE_ENV=development plus a chdir to a temp directory happen BEFORE
 * any library module is loaded, so neither
 * data/ai-token-cost-monitor.db nor %APPDATA%\AI-Cost-Management is
 * ever opened for writing. Both real database files are fingerprinted
 * before the run and again at the end.
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
  path.join(tmpdir(), "declared-resources-smoke-")
);

process.env.NODE_ENV = "development";
process.chdir(TEMP_DIR);

const { dbPath, getDb } = await import("../lib/db.ts");
const { initDb } = await import("../lib/schema.ts");

const declarationsRoute = await import(
  "../app/api/planner/declarations/route.ts"
);
const declarationRoute = await import(
  "../app/api/planner/declarations/[id]/route.ts"
);
const archiveRoute = await import(
  "../app/api/planner/declarations/[id]/archive/route.ts"
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
  };
}

const get = (handler, url, params) =>
  call(handler, { url, params });

const post = (handler, url, body, params) =>
  call(handler, { method: "POST", url, body, params });

const patch = (handler, url, body, params) =>
  call(handler, { method: "PATCH", url, body, params });

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
  assert(
    typeof response.body.error === "string" &&
      response.body.error.length > 0,
    `${label} message must be a non-empty string`
  );
}

function expectOk(response, status, label) {
  assertEqual(response.status, status, `${label} status`);
  assert(
    response.body !== null &&
      typeof response.body === "object",
    `${label} body must be an object`
  );
  assertEqual(
    response.body.ok,
    true,
    `${label} ok flag`
  );
}

/*
 * The full column set of declared_ai_resources, in CREATE TABLE
 * order. Nothing outside this list is stored, so there is no
 * credential, key, token, endpoint, balance or price field anywhere
 * in the row or in an API response.
 */
const EXPECTED_COLUMNS = [
  "id",
  "name",
  "provider_name",
  "model_name",
  "channel",
  "entitlement",
  "pricing_state",
  "supports_tools",
  "supports_vision",
  "supports_reasoning",
  "context_window_tokens",
  "max_output_tokens",
  "status",
  "notes",
  "created_at",
  "updated_at",
];

/* ---------------------------------------------------------------- */
/* Fixtures                                                          */
/* ---------------------------------------------------------------- */

initDb();

const RICH = await post(
  declarationsRoute.POST,
  "/api/planner/declarations",
  {
    name: "Claude through a colleague seat",
    providerName: "Anthropic (work account)",
    modelName: "claude-sonnet",
    channel: "web_only",
    entitlement: "paid",
    pricingState: "unknown",
    supportsTools: 1,
    supportsVision: 0,
    supportsReasoning: null,
    contextWindowTokens: 200000,
    maxOutputTokens: null,
    notes: "shared seat; no key is stored",
  }
);

if (RICH.status !== 201) {
  throw new Error(
    `rich fixture failed: ${RICH.status} ${JSON.stringify(RICH.body)}`
  );
}

const DECLARED = RICH.body.declaration;

const MINIMAL = await post(
  declarationsRoute.POST,
  "/api/planner/declarations",
  { name: "Local llama.cpp server" }
);

if (MINIMAL.status !== 201) {
  throw new Error(
    `minimal fixture failed: ${MINIMAL.status} ${JSON.stringify(MINIMAL.body)}`
  );
}

const PLAIN = MINIMAL.body.declaration;

/* ---------------------------------------------------------------- */
/* A. CRUD                                                           */
/* ---------------------------------------------------------------- */

await check(
  "1. declared_ai_resources stores exactly 16 documented columns and no credential, key, endpoint or price column",
  () => {
    const columns = getDb()
      .prepare(
        `PRAGMA table_info(declared_ai_resources)`
      )
      .all()
      .map((row) => row.name);

    assertEqual(
      JSON.stringify(columns),
      JSON.stringify(EXPECTED_COLUMNS),
      "table columns"
    );
  }
);

await check(
  "2. create returns 201 with the stored row and nothing beyond it",
  () => {
    expectOk(RICH, 201, "create");

    assert(
      typeof DECLARED.id === "string" &&
        DECLARED.id.length > 0,
      "the created row must carry an id"
    );

    assertEqual(
      JSON.stringify(
        Object.keys(DECLARED).sort()
      ),
      JSON.stringify(
        [...EXPECTED_COLUMNS].sort()
      ),
      "create response keys"
    );

    assertEqual(
      DECLARED.status,
      "active",
      "a new declaration starts active"
    );
    assertEqual(
      DECLARED.channel,
      "web_only",
      "channel round trip"
    );
    assertEqual(
      DECLARED.entitlement,
      "paid",
      "entitlement round trip"
    );
    assertEqual(
      DECLARED.pricing_state,
      "unknown",
      "pricing_state round trip"
    );
  }
);

await check(
  "3. capability facts stay three-state: 1, 0 and null are stored as given",
  () => {
    assertEqual(
      DECLARED.supports_tools,
      1,
      "stated yes"
    );
    assertEqual(
      DECLARED.supports_vision,
      0,
      "stated no"
    );
    assertEqual(
      DECLARED.supports_reasoning,
      null,
      "not stated stays null"
    );
  }
);

await check(
  "4. token counts round trip, and null means not stated rather than 0",
  () => {
    assertEqual(
      DECLARED.context_window_tokens,
      200000,
      "context window"
    );
    assertEqual(
      DECLARED.max_output_tokens,
      null,
      "max output not stated"
    );
  }
);

await check(
  "5. an omitted field takes its documented default and never a guess",
  () => {
    expectOk(MINIMAL, 201, "minimal create");

    assertEqual(
      PLAIN.channel,
      "unknown",
      "channel default"
    );
    assertEqual(
      PLAIN.entitlement,
      "unknown",
      "entitlement default"
    );
    assertEqual(
      PLAIN.pricing_state,
      "unknown",
      "pricing_state default"
    );
    assertEqual(
      PLAIN.supports_tools,
      null,
      "unstated capability stays null"
    );
    assertEqual(
      PLAIN.provider_name,
      null,
      "provider not stated"
    );
    assertEqual(
      PLAIN.status,
      "active",
      "status default"
    );
  }
);

/* ---------------------------------------------------------------- */
/* B. Service validation                                             */
/* ---------------------------------------------------------------- */

await check(
  "6. a missing name is refused with 400 MISSING_FIELD",
  async () => {
    const res = await post(
      declarationsRoute.POST,
      "/api/planner/declarations",
      { providerName: "no name given" }
    );

    expectError(res, 400, "MISSING_FIELD", "create without name");
  }
);

await check(
  "7. a credential-shaped body key is refused with 400 UNKNOWN_FIELD",
  async () => {
    const res = await post(
      declarationsRoute.POST,
      "/api/planner/declarations",
      {
        name: "Gateway I pay for",
        apiKey: "sk-should-never-be-stored",
      }
    );

    expectError(res, 400, "UNKNOWN_FIELD", "apiKey rejected");

    assert(
      !JSON.stringify(res.body).includes("sk-should-never-be-stored"),
      "the refused secret must not be echoed back"
    );
  }
);

await check(
  "8. a price-shaped body key is refused with 400 UNKNOWN_FIELD",
  async () => {
    const res = await post(
      declarationsRoute.POST,
      "/api/planner/declarations",
      {
        name: "Priced gateway",
        priceMicros: 1000,
        costCurrency: "USD",
      }
    );

    expectError(
      res,
      400,
      "UNKNOWN_FIELD",
      "price field rejected"
    );
  }
);

await check(
  "9. an unknown channel value is refused with 400 INVALID_ENUM",
  async () => {
    const res = await post(
      declarationsRoute.POST,
      "/api/planner/declarations",
      {
        name: "Bad channel",
        channel: "carrier_pigeon",
      }
    );

    expectError(res, 400, "INVALID_ENUM", "channel enum");
  }
);

await check(
  "10. a capability outside 1 / 0 / null is refused with 400 INVALID_CAPABILITY",
  async () => {
    const res = await post(
      declarationsRoute.POST,
      "/api/planner/declarations",
      {
        name: "Half capable",
        supportsTools: 5,
      }
    );

    expectError(
      res,
      400,
      "INVALID_CAPABILITY",
      "capability range"
    );
  }
);

await check(
  "11. a negative token count is refused with 400 INVALID_TOKEN_COUNT",
  async () => {
    const res = await post(
      declarationsRoute.POST,
      "/api/planner/declarations",
      {
        name: "Impossible window",
        contextWindowTokens: -5,
      }
    );

    expectError(
      res,
      400,
      "INVALID_TOKEN_COUNT",
      "token range"
    );
  }
);

await check(
  "12. an empty optional string is refused with 400 INVALID_TEXT instead of being stored",
  async () => {
    const res = await post(
      declarationsRoute.POST,
      "/api/planner/declarations",
      {
        name: "Empty notes",
        notes: "   ",
      }
    );

    expectError(res, 400, "INVALID_TEXT", "empty text");
  }
);

/* ---------------------------------------------------------------- */
/* C. API reads and status codes                                     */
/* ---------------------------------------------------------------- */

await check(
  "13. the default list is the active view and carries both fixtures",
  async () => {
    const res = await get(
      declarationsRoute.GET,
      "/api/planner/declarations"
    );

    expectOk(res, 200, "list default");

    const ids = res.body.items.map((item) => item.id);

    assert(
      ids.includes(DECLARED.id),
      "rich fixture missing from the active list"
    );
    assert(
      ids.includes(PLAIN.id),
      "minimal fixture missing from the active list"
    );
    assertEqual(
      ids.length,
      countRows("declared_ai_resources"),
      "the active list matches the row count while nothing is archived"
    );
  }
);

await check(
  "14. status=active behaves like the default view",
  async () => {
    const res = await get(
      declarationsRoute.GET,
      "/api/planner/declarations?status=active"
    );

    expectOk(res, 200, "list active");

    assertEqual(
      res.body.items.length,
      countRows("declared_ai_resources"),
      "active rows"
    );
  }
);

await check(
  "15. reading one declaration by id returns that declaration",
  async () => {
    const res = await get(
      declarationRoute.GET,
      `/api/planner/declarations/${DECLARED.id}`,
      { id: DECLARED.id }
    );

    expectOk(res, 200, "get one");

    assertEqual(
      res.body.declaration.name,
      DECLARED.name,
      "get returns the stored name"
    );
    assertEqual(
      res.body.declaration.notes,
      "shared seat; no key is stored",
      "notes round trip"
    );
  }
);

await check(
  "16. reading a declaration that does not exist is 404 DECLARED_RESOURCE_NOT_FOUND",
  async () => {
    const res = await get(
      declarationRoute.GET,
      "/api/planner/declarations/no-such-declaration",
      { id: "no-such-declaration" }
    );

    expectError(
      res,
      404,
      "DECLARED_RESOURCE_NOT_FOUND",
      "get missing"
    );
  }
);

await check(
  "17. an unknown query parameter value is 400 INVALID_QUERY",
  async () => {
    const res = await get(
      declarationsRoute.GET,
      "/api/planner/declarations?status=everything"
    );

    expectError(res, 400, "INVALID_QUERY", "bad status query");
  }
);

/* ---------------------------------------------------------------- */
/* D. Update, then the one-way archive                               */
/* ---------------------------------------------------------------- */

await check(
  "18. PATCH updates the fields sent and leaves the rest alone",
  async () => {
    const res = await patch(
      declarationRoute.PATCH,
      `/api/planner/declarations/${PLAIN.id}`,
      {
        name: "Local llama.cpp (renamed)",
        channel: "own_api",
        supportsVision: null,
      },
      { id: PLAIN.id }
    );

    expectOk(res, 200, "patch");

    assertEqual(
      res.body.declaration.name,
      "Local llama.cpp (renamed)",
      "name updated"
    );
    assertEqual(
      res.body.declaration.channel,
      "own_api",
      "channel updated"
    );
    assertEqual(
      res.body.declaration.supports_vision,
      null,
      "capability still not stated"
    );
    assertEqual(
      res.body.declaration.provider_name,
      null,
      "an untouched field keeps its value"
    );
    assertEqual(
      res.body.declaration.status,
      "active",
      "PATCH does not move status"
    );
  }
);

await check(
  "19. PATCH cannot write status, so archiving stays a one-way command",
  async () => {
    const res = await patch(
      declarationRoute.PATCH,
      `/api/planner/declarations/${DECLARED.id}`,
      { status: "archived" },
      { id: DECLARED.id }
    );

    expectError(res, 400, "UNKNOWN_FIELD", "status write");

    const reread = await get(
      declarationRoute.GET,
      `/api/planner/declarations/${DECLARED.id}`,
      { id: DECLARED.id }
    );

    expectOk(reread, 200, "reread after refused status write");

    assertEqual(
      reread.body.declaration.status,
      "active",
      "the row kept its status"
    );
  }
);

await check(
  "20. patching a declaration that does not exist is 404",
  async () => {
    const res = await patch(
      declarationRoute.PATCH,
      "/api/planner/declarations/no-such-declaration",
      { name: "ghost" },
      { id: "no-such-declaration" }
    );

    expectError(
      res,
      404,
      "DECLARED_RESOURCE_NOT_FOUND",
      "patch missing"
    );
  }
);

await check(
  "21. archive moves the row to archived and keeps it readable",
  async () => {
    const res = await post(
      archiveRoute.POST,
      `/api/planner/declarations/${DECLARED.id}/archive`,
      undefined,
      { id: DECLARED.id }
    );

    expectOk(res, 200, "archive");

    assertEqual(
      res.body.declaration.status,
      "archived",
      "status after archive"
    );
    assertEqual(
      countRows("declared_ai_resources"),
      2,
      "archiving must never delete the row"
    );

    const reread = await get(
      declarationRoute.GET,
      `/api/planner/declarations/${DECLARED.id}`,
      { id: DECLARED.id }
    );

    expectOk(reread, 200, "archived row still readable");
    assertEqual(
      reread.body.declaration.status,
      "archived",
      "archived status persists"
    );
  }
);

await check(
  "22. an archived declaration leaves the active view",
  async () => {
    const fallback = await get(
      declarationsRoute.GET,
      "/api/planner/declarations"
    );

    expectOk(fallback, 200, "default list after archive");

    const fallbackIds = fallback.body.items.map(
      (item) => item.id
    );

    assert(
      !fallbackIds.includes(DECLARED.id),
      "the archived row must not appear in the default list"
    );
    assert(
      fallbackIds.includes(PLAIN.id),
      "the active row must stay in the default list"
    );

    const active = await get(
      declarationsRoute.GET,
      "/api/planner/declarations?status=active"
    );

    expectOk(active, 200, "active list after archive");

    assertEqual(
      active.body.items.length,
      countRows("declared_ai_resources") - 1,
      "exactly the archived row left the active view"
    );
  }
);

await check(
  "23. an archived declaration still appears under status=archived and status=all",
  async () => {
    const archived = await get(
      declarationsRoute.GET,
      "/api/planner/declarations?status=archived"
    );

    expectOk(archived, 200, "archived list");
    assertEqual(
      JSON.stringify(
        archived.body.items.map((item) => item.id)
      ),
      JSON.stringify([DECLARED.id]),
      "the archived view holds exactly the archived row"
    );

    const all = await get(
      declarationsRoute.GET,
      "/api/planner/declarations?status=all"
    );

    expectOk(all, 200, "all list");
    assertEqual(
      all.body.items.length,
      2,
      "status=all keeps both rows"
    );
  }
);

await check(
  "24. archiving again is idempotent",
  async () => {
    const res = await post(
      archiveRoute.POST,
      `/api/planner/declarations/${DECLARED.id}/archive`,
      undefined,
      { id: DECLARED.id }
    );

    expectOk(res, 200, "second archive");
    assertEqual(
      res.body.declaration.status,
      "archived",
      "still archived"
    );
    assertEqual(
      countRows("declared_ai_resources"),
      2,
      "still no delete"
    );
  }
);

await check(
  "25. archiving a declaration that does not exist is 404",
  async () => {
    const res = await post(
      archiveRoute.POST,
      "/api/planner/declarations/no-such-declaration/archive",
      undefined,
      { id: "no-such-declaration" }
    );

    expectError(
      res,
      404,
      "DECLARED_RESOURCE_NOT_FOUND",
      "archive missing"
    );
  }
);

/* ---------------------------------------------------------------- */
/* Isolation                                                         */
/* ---------------------------------------------------------------- */

await check(
  "26. this run used an isolated temp database",
  () => {
    assert(
      path
        .normalize(dbPath)
        .startsWith(path.normalize(TEMP_DIR)),
      `dbPath ${dbPath} is not under the temp dir`
    );

    assert(
      countRows("declared_ai_resources") === 2,
      "the temp database really holds the fixture rows"
    );
  }
);

await check(
  "27. no real database file was touched",
  () => {
    assertEqual(
      JSON.stringify(snapshotRealDatabases()),
      JSON.stringify(productionFileSnapshot),
      "no real database file changed size or mtime"
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
