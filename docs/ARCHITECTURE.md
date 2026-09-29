# Architecture

Reference for the code as it exists today. Documentation only — no code was changed to produce this file.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16.3.4, App Router, `output: "standalone"` |
| UI | React 19.2.8, Tailwind CSS 4, no component library |
| Database | SQLite via the built-in `node:sqlite` `DatabaseSync`. No ORM, no migrations framework. |
| Language | TypeScript, `strict`, path alias `@/*` → repository root |
| Distribution | Windows x64 desktop: portable Node runtime + standalone build + CAB installer |
| Lint | ESLint 9 with `eslint-config-next` |

There is no runtime dependency beyond Next and React. `playwright` is declared but the current verification story is Node smoke scripts, not a browser test suite.

## Layering

```
app/            route segments and API routes; HTTP boundary, validation, shaping only
components/     three shared React components; everything else is inline in app/
  ↓
lib/services/   domain rules, validation, legal state transitions
  ↓
lib/repositories/  SQL. Owns tables, normalizes values, clamps limits
  ↓
lib/schema.ts   DDL + idempotent migrations, executed on every repository call
  ↓
lib/db.ts       SQLite handle and path resolution
```

`lib/parser`, `lib/planner`, `lib/registry`, `lib/import`, `lib/providers`, `lib/detection` are side modules that feed this chain. The Planner estimators are pure functions with no database, clock, or network access.

Two rules hold throughout:

- **Services never write SQL.** Repositories never validate domain rules.
- **`initDb()` runs on every public repository call.** Schema creation and migrations are idempotent and self-guarded, so there is no separate migration step to forget.

## The two data layers

This distinction is the core of the system and is enforced at the API boundary.

**Money Layer** — `usage_records` and `cost_records`. Only source-reported cost enters it, tagged `source ∈ {official_export, official_api}` and `accuracy ∈ {verified, exact}`. All totals, budgets, efficiency, and savings are computed from this layer only.

**Activity Layer** — local Cline/Codex evidence and the AI process/connection scan. Non-monetary by definition. It is surfaced on Usage, Dashboard, and AI Activity, and is **never** mixed into a cost or token measurement. `/api/efficiency` explicitly rejects requests that ask for it.

`cost-service.getUnifiedCostData` is the only place the two layers meet, and it merges them for display while keeping verified totals derived exclusively from Money Layer rows.

## Database

### Path resolution

`lib/db.ts` selects the file from the environment:

- `NODE_ENV=development` → `<cwd>/data/ai-token-cost-monitor.db`
- otherwise → `%APPDATA%/AI-Cost-Management/data/ai-token-cost-monitor.db`, with `XDG_DATA_HOME` and the home directory as fallbacks

The handle is a lazy singleton, opened with `foreign_keys = ON` and `journal_mode = WAL`.

On first production open, `lib/migration/dev-db-migrate.ts` copies an existing development database to the user-data path. It refuses to copy if the target already holds data, if the target is already migrated (`user_version = 1`), or if the source has a `-wal` or `-shm` sidecar, which would mean the source is live. It never throws and never overwrites.

### Schema and migrations

`lib/schema.ts` exports `initDb()` only. It runs one idempotent `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` block, then eight self-guarded migrations. There is no version ledger:

- **Additive changes** check `PRAGMA table_info` and add the column only if absent.
- **Constraint changes** rebuild the table inside `BEGIN`/`COMMIT` with `ROLLBACK` in `catch`, preserving rows by id.

Migration order: budgets table rebuild (retaining only `monthly`), cost provenance, usage `import_id`, cost `import_id`, plan pricing-basis timestamp, plan strategy enum, resource owner/channel, resource pricing basis.

### Tables

| Group | Tables |
| --- | --- |
| Identity | `providers`, `models` |
| Money Layer | `usage_records`, `pricing_versions`, `cost_records` |
| Provenance | `import_logs` |
| Budget | `budgets` |
| Tasks | `tasks`, `task_sessions`, `task_usage_records` |
| Registry | `ai_model_capabilities`, `user_ai_tools` |
| Resources | `ai_resources` |
| Planner | `projects`, `project_plans`, `project_tasks`, `project_task_ai_options`, `plan_resource_assignments` |

### Schema conventions

These are load-bearing, not style preferences.

- **NULL means unknown. Never zero.** Planner money and token columns are all-NULL together when unknown. There is no implicit default currency.
- **No currency conversion, anywhere.**
- **No score, rank, tier, weight, or confidence column** in the Registry or Planner tables.
- **No credential, key, or token column** in `user_ai_tools` or `ai_resources`.
- **Capabilities are strictly tri-state.** `supports_tools` / `vision` / `reasoning` are `NULL` (unknown), `0` (documented unsupported), or `1` (supported). A capability is never guessed.
- **Plan versions are immutable.** A change produces a new version row; existing versions are never updated.
- **Resources archive, never delete.** Archiving flips a status stamp so historical references still resolve.
- **At most one active task session**, enforced by the partial unique index `idx_task_sessions_one_active`.
- Uniqueness across nullable columns uses an expression index with `COALESCE(col, '')` to defeat SQLite's NULL-distinct semantics.

## Cost computation

`lib/cost-policy.ts` defines the evidence predicates, shared by the cost, efficiency, task services and mirrored as SQL constants in the budget repository:

- `isOfficialSource` — `official_export` or `official_api`
- `isVerifiedAccuracy` — `verified` or `exact`
- `isOfficialVerifiedRecord` — both

`lib/cost-engine.ts` is a pure function: `costMicros(tokens, pricePerMillion) = round(tokens × perMillion)`, applied per token class and then summed. Billed input is `input − cached`; cached is priced at its own rate; reasoning at its own rate. All token counts clamp at zero. A missing cached or reasoning rate silently costs zero — this is a known sharp edge, not an intended default.

`lib/services/token-conventions.ts` is the canonical arithmetic: total is **always recomputed** as `input + output + reasoning` and a caller-supplied total is ignored; cached tokens live inside input.

Provenance vocabulary across the codebase:

| Field | Values |
| --- | --- |
| `cost_records.provenance` | `source_reported`, `calculated`, `estimated`, `unknown` |
| `usage_records.accuracy` | `verified`, `estimated` |
| `UnifiedRecord.accuracy` | `exact`, `calculated`, `estimated`, `unknown` |

## AI Registry

`lib/registry/` holds vendor facts only: what a vendor officially documents about its own models, plus a user-declared tool inventory. It never rates, ranks, or scores a model.

- `ai-registry-repository.ts` — reads and writes `providers`, `models`, `ai_model_capabilities`, `pricing_versions`, `user_ai_tools`. Upserts are idempotent (`INSERT OR IGNORE`, or `ON CONFLICT(model_id) DO UPDATE` for capabilities, which this manifest owns). The whole seed runs in one transaction. `resolveRegistryPricing` returns `null` for "price unknown" and never `0`.
- `ai-registry-seed.ts` — the manifest: 4 providers, 10 models, seeded as of `2026-09-27`. Only unconditional date-banded rates are seeded. Each model carries a `sourceNote` and an `omittedPricing` explanation of what was deliberately left out; the manifest-only fields are not persisted.

Seeding is a manual step (`npm run seed:registry`). The app never seeds at runtime.

## Planner

```
fit-estimator ────┐
cost-estimator ───┼──> candidate-generator ──> strategy-rules   (per-step options)
time-estimator ───┘

fit-estimator ────┐
cost-estimator ───┼──> combination-rules ──> combination-service ──> planner-repository
time-estimator ───┘   (whole-project, five strategies)
registered-pricing ──────> combination-service AND planner-service
```

The two branches compose the same three estimators separately. They do not call each other, and there is no shared ranking layer.

| Module | Responsibility |
| --- | --- |
| `fit-estimator` | Registry tri-state plus token gates → `meets` / `below_minimum` / `unknown`. Worst signal wins. |
| `cost-estimator` | Token bounds × an in-force rate card → `cost_min` / `cost_max`. Refuses to price rather than guessing. |
| `time-estimator` | Frozen category × complexity table, versioned `planner-time-v1`. Identical for every model. |
| `strategy-rules` | `cost_first` / `time_first` / `balanced` → a display order plus representatives. No score, no weights, no "best". |
| `candidate-generator` | Composes the three into one candidate per registry model. **Never filters** — an unpriced model keeps a null cost, an undocumented one keeps unknown fit. |
| `combination-rules` | Whole-project evaluation across five strategies, with role derivation and out-of-pocket accounting. |
| `combination-service` | The only writer of `project_plans` and `plan_resource_assignments`. Resolves one shared `pricing_basis_at` and persists atomically. |
| `registered-pricing` | The single authority for a registered resource's nominal pricing basis, shared by both planner paths. |

Planner invariants worth preserving:

- Generation returns facts, never a recommendation or a pick.
- A client cannot pass `now`, a version, or an assignment to steer a combination result.
- `is_selected` is not in the create whitelist; selection is a separate command.
- Path IDs are authoritative. `planId` never comes from the request body.
- Resource assignments are display context. They never become a price and never feed `planned_cost_*`, `cost_basis`, or `pricing_basis_kind`.
- A token estimate above a declared scope ceiling is refused.
- `below_minimum` resources are never assigned.

## API boundary

`lib/planner-api-errors.ts` is the shared contract for all Planner routes:

- Success is `{ ok: true, ... }`; failure is `{ error, code }`.
- `NOT_FOUND_CODES` → 404, `CONFLICT_CODES` → 409, everything else → 400, unknown error → 500 with a generic body and a `console.error`.
- `pickFields` whitelists request keys. Unknown key → 400 `UNKNOWN_FIELD`; missing required → `MISSING_FIELD`; wrong type → `INVALID_FIELD_TYPE`; bad enum → `INVALID_ENUM`. This is how `id`, `status`, `version`, `sequence`, and `is_selected` are kept out of client hands.
- An explicit `null` clears an optional field; an absent key leaves the service default in place.

Other routes follow the same shape but validate locally.

## Providers

Two separate systems, easy to conflate:

| | `providers/` (root) | `lib/providers/` |
| --- | --- | --- |
| Role | DeepSeek response normalization and the shared usage contract | Generic per-vendor API connector registry for the Connect page |
| Contents | `types.ts`, `deepseek.ts` | `types.ts`, `registry.ts`, `openai.ts`, `anthropic.ts`, `openrouter.ts` |
| Consumers | cost engine, usage repository, DeepSeek import and export parsers | `/api/providers`, `/api/providers/test` |

Connectors return errors as `{ success: false, message }` and never throw. Anthropic returns a null total cost because its usage report does not carry one; stored pricing is used instead. OpenRouter's sync is a stub that validates the key and reports zero records, and deliberately refuses to derive cost from model pricing.

## Import

`lib/import/deepseek-finalize.ts` is the single atomic finalize, shared by the import API and the CLI. One transaction writes usage rows, cost rows, and the `import_logs` journal entry. Everything is `INSERT OR IGNORE` with deterministic IDs derived from the ZIP's SHA-256, so re-importing the same export is a safe no-op. A transaction that changes nothing is treated as an error and rolled back.

The CLI importer registers a module resolution hook so plain Node can follow Next's extensionless relative `.ts` imports. It runs the same finalize path as the API's confirm action, so both entry points produce identical IDs. The preview phase writes nothing.

`scripts/repair-deepseek-duplicate-import.mjs` re-implements slugging and normalization on purpose, so the repair produces IDs the repositories would also produce.

## Local detection

- `lib/parsers/cline.ts` and `lib/parsers/codex.ts` read local tool session files.
- `lib/detection/ai-consumer.ts` enumerates Windows processes and TCP connections via PowerShell, resolves remote addresses, and scores each connection against provider domains, API keywords, and tool keywords. Connections below threshold are dropped; `commandLine` is sanitized before being returned because it may contain secrets. The generic keyword `code` is deliberately excluded — ordinary VS Code is not AI evidence.
- `lib/cache/ai-activity-cache.ts` is a single-slot in-process cache with a 20s TTL; `lib/storage/ai-activity-history.ts` is a 100-entry in-process ring buffer. **Neither is persisted.**

## Desktop distribution

`npm run package:desktop` produces `.desktop-package/`:

1. Builds the standalone Next output.
2. Copies `.next/static` and `public/` into it.
3. **Deletes any `data/` directory** — a development database must never ship.
4. Assembles the executable, the portable Node runtime, the launcher, and the standalone server.
5. Compiles `desktop/launcher-exe.cs` to a PE executable.
6. Validates: a required-file list, a forbidden list (standalone `data/`, `runtime/npm`, `node_modules`), PE magic bytes on the executable, and a recursive scan for any `data/` directory or `*.db` / `*.db-wal` / `*.db-shm`. Any violation exits non-zero.

`desktop/launcher.mjs` picks a free ephemeral port, starts the standalone server with `NODE_ENV=production`, polls until it responds, opens the browser, and on shutdown kills the process tree. `next.config.ts` also excludes `./data/**` from output file tracing.

`desktop/installer/bootstrapper.cs` expands the CAB with the system `expand.exe`, and **refuses to run if the app is already running** rather than force-killing it. `uninstall.cmd` behaves the same way and deliberately preserves `%APPDATA%\AI-Cost-Management\data`. The MSIX manifest uses a test publisher and is scaffolding, not a release channel.

## Verification

Smoke suites run with `node --experimental-strip-types` and a shared `scripts/ts-smoke-loader.mjs` resolve hook that maps `@/` to the repository root, adds `.ts` and `index.ts` resolution, and redirects `next/server` to its real file (next@16 ships no `exports` map). If Next's packaging changes, that hook must be revisited.

Suites that need isolation set `NODE_ENV=development` and change directory to a temp location **before** importing any lib module, which is what guarantees a production database is never opened.
