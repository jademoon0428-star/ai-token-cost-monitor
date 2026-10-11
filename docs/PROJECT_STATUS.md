# Project Status

Snapshot of the repository at commit `def18c2` (2026-10-10), prepared for the v1.5.5 release. Documentation only — no code was changed to produce this file. v1.5.5 is prepared on `master` but is **not yet released**: the full smoke gate passed 17/17 on 2026-10-10, while desktop packaging, installer SHA256, and tag are still pending.

## Stage

**MVP / local-first.** Single machine, single user, Windows desktop distribution. A local SQLite database is the only system of record. There is no server, no account, no sync, and no multi-tenant story.

Operating principles, in priority order:

1. **Simple** — no speculative abstraction. If a table, column, or endpoint does not serve a shipped feature, it does not exist.
2. **Stable** — released data and released artifacts are not rewritten. Plan versions are append-only, resources archive instead of delete, installed user data is preserved across reinstall and uninstall.
3. **Evidence-based** — cost figures come from the source. A number is stored as `verified` only when an official API or official export reported it. Everything else stays unknown rather than estimated.
4. **Local-first** — nothing leaves the machine. No telemetry, no remote calls except the provider connectors the user explicitly configures.

## Version state

| Field | Value |
| --- | --- |
| `package.json` version | `1.5.5` (prepared, not yet tagged or packaged) |
| Last released | v1.5.4 (`bc47a9a`, 2026-10-07) |
| Branch | `master` (10 commits ahead of `origin/master`, not yet pushed) |

v1.5.4 is the current release (Planner project stages, Productivity Report, Plan Detail display-name fix). v1.5.5 is prepared on `master` and covers the commits after the v1.5.4 tag; it has not been tagged, packaged, or pushed.

## What is released and stable

| Version | Scope |
| --- | --- |
| v1.0.0 | Windows x64 desktop distribution: portable Node runtime, standalone Next build, CAB installer, uninstall. Frozen. |
| v1.1.0 | DeepSeek official usage export ZIP import. Preview is read-only; confirm writes usage, cost, and an import journal in one transaction. |
| v1.2.0 | Per-model and per-day Efficiency views. |
| v1.3.0 | Dashboard verified-record semantics corrected; cost-concentration and efficiency evidence added to Saving. |
| v1.4.0 | v1.4-A/B: tasks, task sessions, usage-to-session attribution, `/api/tasks`, Dashboard Task Session UI. |
| v1.4.1 | Core module navigation. No database, API, Dashboard, or installer change. |
| v1.5.1 | AI Registry v1, AI Project Planner, Planner resources and combination plans, Planner AI-option generation UI, and the production standalone static-assets fix. |
| v1.5.2 | Budget page query fix and official-cost integrity hardening. No schema change. |
| v1.5.3 | Task Sessions connected to usage attribution. |
| v1.5.4 | Planner project stages, Planner Productivity Report (read-only), Plan Detail resource display-name fix. New `project_stages` table, created automatically. |

## What shipped in v1.5.1

Three additive layers shipped in v1.5.1 (released 2026-09-30).

**AI Registry v1** — a vendor-facts layer. Providers, models, capabilities, and official rate cards, seeded from vendor documentation with a `source_url` and `source_checked_at`. It never rates, ranks, or scores a model, and it never records a capability as unsupported unless the vendor documents that. Seeded with 4 providers and 10 models. `npm run seed:registry` remains available for manual re-seeding. (Correction, v1.5.5 batch: `instrumentation.ts` now also seeds this baseline automatically at startup — idempotent and never blocking; the earlier "the app never seeds at runtime" statement no longer holds.)

**AI Project Planner** — project intent, immutable plan versions, planned steps with token buckets, and candidate AI options per step. Options are facts, not recommendations: generation never filters, never ranks by score, and never selects. Selection is a separate, explicit user action.

**Planner resources and combination plans** — what the user actually owns (access method, channel, entitlement, pricing basis) and whole-project combination evaluation across five strategies, persisted alongside the plan. Combination results return facts and never a pick.

## Known limitations

These are deliberate scope boundaries, not defects. They are listed here so they are not rediscovered as bugs.

**Money**

- No currency conversion anywhere. Costs are summed only within a single currency, and a budget whose currency differs from the detected verified currency is rejected.
- Verified totals only count records whose source is `official_export` or `official_api` **and** whose accuracy is `verified` or `exact`. A provider that does not report cost yields unknown, not an estimate.
- Saving can show where verified spending is concentrated. It cannot prove how much a model or workflow change would save.

**Data coverage**

- The official rate-card schema can only express a date range. Time-of-day bands, long-context tiers, cache-write pricing, batch and regional SKUs are therefore not seeded. DeepSeek has **no** seeded rate rows at all, because all of its rates are time-banded.
- The DeepSeek CLI importer, the ZIP parser, and the AI process/connection detection path shell out to `powershell.exe`. Those paths are Windows-only.

**Planner**

- The Registry has no per-model latency or throughput column, so time estimates are identical for every model. Time figures are coarse category-by-complexity bands, not measurements.
- Planner cost math has no cached or reasoning term, because `project_tasks` carries no such estimate and the output estimate already includes reasoning.
- Pricing scope ceilings (OpenAI's 272K short-context boundary) are hardcoded in the cost estimator because `pricing_versions` has no scope column. This is a deliberate but real two-sources-of-truth risk.
- The available-AI-tools list is not rendered. The Planner API has no endpoint that lists `user_ai_tools`.
- Planner Advanced gate (v1.5.5 batch): 90 days after first use, combination-plan generation and per-task AI-options generation refuse with `PLANNER_ADVANCED_LOCKED` (HTTP 402) until the state is marked paid. There is no in-app payment or unlock flow; free features and all historical reads remain available.

**Platform**

- The installer is unsigned; SmartScreen warnings are expected on first install.
- There is no Apps & Features uninstall entry. `uninstall.cmd` is the validated mechanism.
- The MSIX manifest is scaffolding on a test publisher and is not a release channel.
- AI Activity cache and history are in-process only and are lost on restart. Neither is persisted.
- OpenRouter usage sync is a stub: the connector validates the key and reports zero records. It deliberately refuses to derive cost from model pricing.

## Verification baseline

Smoke suites run against an isolated temp database by setting `NODE_ENV=development` and changing directory before the lib modules load, so a production database is never opened. The DeepSeek DB smoke isolates differently (correction, v1.5.5 batch): it defaults to a fresh `mkdtemp` temp database, deletes it on success, keeps it for diagnosis on failure (printing its absolute path), and refuses malformed arguments instead of ever falling back to the development database.

```bash
npm run lint
npm run smoke:tasks
npm run smoke:registry
npm run smoke:ai-resources
npm run smoke:planner
npm run smoke:planner-api
npm run smoke:planner-candidates
npm run smoke:planner-persistence
npm run smoke:planner-combinations
npm run smoke:planner-combination-persistence
npm run smoke:planner-estimator
npm run smoke:planner-evidence
npm run smoke:planner-c1
npm run smoke:planner-productivity
npm run smoke:deepseek
```

The v1.5.5 batch adds three smoke scripts that are **not yet wired to npm scripts** and are run directly with `node --experimental-strip-types`: `scripts/smoke-planner-declarations.mjs`, `scripts/smoke-registry-baseline.mjs`, and `scripts/smoke-commercial-lifecycle.mjs`. The full 17-item release gate (14 npm-registered plus these three direct runs) was executed on 2026-10-10 and passed 17/17. (Correction, v1.5.5 batch: the earlier statement that the release gate had not been executed is superseded.)

Additional validation and maintenance scripts (`validate-*.mjs`, `test-local-parsers.mjs`, `repair-deepseek-duplicate-import.mjs`, and the two small `*-smoke-test.mjs` files) are run manually and are not wired to npm scripts. `repair-deepseek-duplicate-import.mjs` is a one-time fix for a single known database state and is not general maintenance.

## Release preparation status (2026-10-10, end of day)

- The DeepSeek DB smoke was fixed and now isolates by default: no-argument runs use a fresh `mkdtemp` temp database (cleaned on success, kept with its absolute path printed on failure); `--db <path>` is the only way to target a specific database, and malformed arguments fail loudly instead of touching the development database. Isolation suite 22/22 PASS; `npm run smoke:deepseek` PASS; the development database (db/wal/shm hash, size, mtime; integrity ok; providers 4, DeepSeek models 5, official_export usage/cost 25/25, fixture 0/0) was unchanged. Test tooling only — no product or business data was modified.
- The DDF generator (`scripts/generate-package-ddf.mjs`, currently untracked) supports deterministic generation and a read-only `--check`; isolated tests 15/15 PASS. `desktop/installer/package.ddf` holds 1817 entries; a temporary CAB trial matched the archive bidirectionally with zero forbidden files. The trial is **not** an official v1.5.5 artifact.
- Read-only pre-release work completed: a risk review (no P0; three P1 process risks: package-before-DDF ordering, manual Setup/README/SHA256SUMS steps, cautious failure cleanup) and a precondition check (tool paths, v1.5.4 naming, `release\AI-Cost-Management-v1.5.5\` absent).
- The user stopped here for the day. The official release chain (fresh `package:desktop`, official DDF/CAB/Setup/README/SHA256SUMS, SHA256 backfill, install validation, commit, tag, push) has **not** been authorized or executed. The 13 temp directories left by other smoke scripts (repo convention) are not cleaned and must not be cleaned without authorization.

## Definition of done for the next release

- v1.5.4 shipped on 2026-10-07 (tag → `bc47a9a`), with release notes that match `docs/CHANGELOG.md`.
- v1.5.5 (commits `af020f0`…`def18c2`) is prepared on `master`: version files updated and the full smoke gate passed 17/17 on 2026-10-10, but desktop packaging check, installer SHA256, tag, and push are still pending and must not be described as done.
- Every new table and endpoint still satisfies the evidence rule: a fact column is nullable and means unknown, never zero.
- No rate, score, rank, weight, or confidence column is introduced into the Registry or Planner.
- No currency conversion is introduced.
- The desktop package still ships with no `data/`, no `*.db`, and no source files.
