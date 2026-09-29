# Project Status

Snapshot of the repository at commit `aedf89a` (2026-09-29). Documentation only — no code was changed to produce this file.

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
| `package.json` version | `1.4.1` |
| Last released | v1.4.1 (`278202f`, 2026-09-27) |
| Branch | `master`, 8 commits ahead of `origin/master` |
| Unreleased work | AI Registry v1 + AI Project Planner (7 commits after the v1.4.1 tag) |
| Next release | Not yet named |

The 8 local commits are **not** part of v1.4.1. v1.4.1 is frozen; the Registry and Planner work is additive and will ship in the next version.

## What is released and stable

| Version | Scope |
| --- | --- |
| v1.0.0 | Windows x64 desktop distribution: portable Node runtime, standalone Next build, CAB installer, uninstall. Frozen. |
| v1.1.0 | DeepSeek official usage export ZIP import. Preview is read-only; confirm writes usage, cost, and an import journal in one transaction. |
| v1.2.0 | Per-model and per-day Efficiency views. |
| v1.3.0 | Dashboard verified-record semantics corrected; cost-concentration and efficiency evidence added to Saving. |
| v1.4.0 | v1.4-A/B: tasks, task sessions, usage-to-session attribution, `/api/tasks`, Dashboard Task Session UI. |
| v1.4.1 | Core module navigation. No database, API, Dashboard, or installer change. |

## What is in progress (unreleased)

Three layers are landed on `master` and not yet released.

**AI Registry v1** — a vendor-facts layer. Providers, models, capabilities, and official rate cards, seeded from vendor documentation with a `source_url` and `source_checked_at`. It never rates, ranks, or scores a model, and it never records a capability as unsupported unless the vendor documents that. Seeded with 4 providers and 10 models. `npm run seed:registry` is a manual step; the app never seeds at runtime.

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

**Platform**

- The installer is unsigned; SmartScreen warnings are expected on first install.
- There is no Apps & Features uninstall entry. `uninstall.cmd` is the validated mechanism.
- The MSIX manifest is scaffolding on a test publisher and is not a release channel.
- AI Activity cache and history are in-process only and are lost on restart. Neither is persisted.
- OpenRouter usage sync is a stub: the connector validates the key and reports zero records. It deliberately refuses to derive cost from model pricing.

## Verification baseline

Smoke suites run against an isolated temp database by setting `NODE_ENV=development` and changing directory before the lib modules load, so a production database is never opened.

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
npm run smoke:deepseek
```

Additional validation and maintenance scripts (`validate-*.mjs`, `test-local-parsers.mjs`, `repair-deepseek-duplicate-import.mjs`, and the two small `*-smoke-test.mjs` files) are run manually and are not wired to npm scripts. `repair-deepseek-duplicate-import.mjs` is a one-time fix for a single known database state and is not general maintenance.

## Definition of done for the next release

- The Registry and Planner work is released as a version after v1.4.1, with release notes that match `docs/CHANGELOG.md`.
- Every new table and endpoint still satisfies the evidence rule: a fact column is nullable and means unknown, never zero.
- No rate, score, rank, weight, or confidence column is introduced into the Registry or Planner.
- No currency conversion is introduced.
- The desktop package still ships with no `data/`, no `*.db`, and no source files.
