# Project Status

Snapshot of the repository after the v1.5.5 release (2026-10-11). Documentation only — no code was changed to produce this file. v1.5.5 is **released**: commit `40a0996` (`release: prepare AI Cost Management v1.5.5`), tag `v1.5.5`, pushed to GitHub master, GitHub Release created. The full smoke gate passed 17/17 on 2026-10-10; official packaging, installer SHA256, install validation, and manual testing all completed on 2026-10-11.

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
| `package.json` version | `1.5.5` (released; tag `v1.5.5` → `40a0996`) |
| Last released | v1.5.5 (`40a0996`, tag `v1.5.5`, GitHub Release created, 2026-10-11) |
| Branch | `master` (pushed to GitHub master; in sync with origin) |

v1.5.5 is the current release (Declared AI resources inventory, AI Registry startup baseline, Planner AI-option state, Planner M1 comparison view, Commercial lifecycle + Planner Advanced gate and lock UI, empty/error state fixes; commits `af020f0`…`40a0996`). v1.5.4 (`bc47a9a`, 2026-10-07) remains available in git history.

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
| v1.5.5 | Declared AI resources inventory, AI Registry startup baseline, Planner AI-option state, Planner M1 comparison view, Commercial lifecycle + Planner Advanced gate (90-day full access) and lock UI, empty/error state and cost/import error messaging fixes. New `declared_ai_resources` and `commercial_state` tables, created automatically. |

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
- The DDF generator (`scripts/generate-package-ddf.mjs`, committed in `40a0996`) supports deterministic generation and a read-only `--check`; isolated tests 15/15 PASS. `desktop/installer/package.ddf` holds 1817 entries; a temporary CAB trial matched the archive bidirectionally with zero forbidden files. (Correction, v1.5.5 release: the official DDF was regenerated against the release-day package and `--check` passed; the earlier trial is superseded by the official CAB.)
- Read-only pre-release work completed: a risk review (no P0; three P1 process risks: package-before-DDF ordering, manual Setup/README/SHA256SUMS steps, cautious failure cleanup) and a precondition check (tool paths, v1.5.4 naming, `release\AI-Cost-Management-v1.5.5\` absent).
- The user stopped here for the day. The official release chain (fresh `package:desktop`, official DDF/CAB/Setup/README/SHA256SUMS, SHA256 backfill, install validation, commit, tag, push) was **not** authorized or executed at that time (superseded by the Release completion section below). The 13 temp directories left by other smoke scripts (repo convention) are not cleaned and must not be cleaned without authorization.

## Release completion (2026-10-11)

- The full clean release chain S1–S9 was executed under step-by-step authorization: fresh `package:desktop` (Package verified; no `data/` in the package; BUILD_ID `lnVtZ1FuHRMtX-YGjTnWQ`), official DDF regenerated (1817 entries) with `--check` passing against the release-day package, official makecab, Setup compiled with csc, `README.txt`, `SHA256SUMS.txt`, installer SHA256 backfilled into `RELEASE_NOTES.md`, and `makecablog.txt`/`setup.inf` removed.
- Official artifacts: `release\AI-Cost-Management-v1.5.5\` containing `AI-Cost-Management-Setup.exe`, `AI-Cost-Management-Payload.cab`, `README.txt`, `SHA256SUMS.txt`. Setup.exe SHA256: `C8403A4D9276D2636D3EF1844865D5404F8DFB3B3DA24AE2102FA705C5F128EF`.
- Committed `40a0996` (`release: prepare AI Cost Management v1.5.5`), tagged `v1.5.5`, pushed to GitHub master, GitHub Release created.
- Install validation: Setup installed to `%LOCALAPPDATA%\AI-Cost-Management\App`; installed version `1.5.5`, BUILD_ID `lnVtZ1FuHRMtX-YGjTnWQ`; launcher started; Dashboard / Usage / Planner / Budget / AI Activity all returned HTTP 200 with no startup errors; SQLite data directory (`%APPDATA%\AI-Cost-Management\data`) created/active. The installation was kept (not uninstalled).
- Released-build manual testing: completed, all PASS.

## Next phase: post-release operations (2026-10-11)

The product has entered the **post-release operations preparation phase**. Next priorities:

1. Build the product website. (Done — MVP committed to `master` as `4418e48` on 2026-10-13 and deployed to GitHub Pages; see "Website launch (2026-10-13)" below. Search indexing and promotion remain open.)
2. Create a product introduction page.
3. Prepare user acquisition channels.
4. Collect feedback from real users.

Long-term directions recorded, **not scheduled and not part of v1.5.5**:

- **Personalized AI plan optimization engine** — optimize model-combination suggestions, free/paid model substitution advice, and AI usage-efficiency analysis from local usage history, model choices, token consumption, task types, cost trends, and time efficiency. Deferred until launch and real-user validation are done; must respect the no-ranking/no-score/no-fake-precision red lines when it is eventually built.
- **Subscription Cost Model** — manual entry of subscriptions (ChatGPT Plus, Claude Pro, Gemini Advanced, GitHub Copilot, and other monthly/annual plans), monthly fixed AI cost, merged with API cost, total AI investment. Today the product covers API token cost, model call cost, and local detection/analysis only. Not entering the v1.5.5 wrap-up.
- **Marketing channels** — a GitHub Release is a technical distribution channel only; growth requires the website, introduction articles, AI communities, developer communities, software-directory submissions, and content marketing. Large AI models will not discover the product on their own; search indexing, reviews, external articles, and community exposure are needed.

Explicitly deferred: optimization engine development, Subscription Cost Model development, and large-scale feature expansion.

## Post-release website work (2026-10-12)

- An English-language static one-page website MVP now exists locally in `website/` (`index.html` + `styles.css`). It is standalone static content — not a product feature, not a version release, and not part of v1.5.5. No npm dependencies, scripts, external fonts/CDN, analytics, or third-party images were added; the main content does not depend on JavaScript. The hero visual is a clearly labelled UI schematic, not a product screenshot and not real user spend data.
- Links point to the verified GitHub repository, the v1.5.5 Release, and the installer: `https://github.com/jademoon0428-star/ai-token-cost-monitor/releases/download/v1.5.5/AI-Cost-Management-Setup.exe` — Setup.exe SHA256 `C8403A4D9276D2636D3EF1844865D5404F8DFB3B3DA24AE2102FA705C5F128EF`.
- Integrity checks (this session's output): exactly one `meta name="description"`, one `meta property="og:description"`, and one `h1`; the six superseded copy strings are all absent; no old/new copy pairs are retained together; HTML tags are balanced; 12 ids are unique.
- Playwright: 24/24 PASS at 360px and 1280px — empty external-request list for the page, no page errors, no horizontal overflow, single h1, stylesheet loads, 8 FAQ items, keyboard operable, download URL and SHA-256 displayed correctly. The empty external-request list describes this page only and must not be read as the product being fully offline (AI Activity may perform reverse DNS lookups; the optional provider connectivity test contacts that provider's API when the user triggers it). No browser-to-GitHub end-to-end download test was run, so the download flow is not claimed as end-to-end verified.
- Product source, database, and release assets were **not** modified by this website work. The website is not deployed and not committed. The workspace is **not** clean: the pre-existing uncommitted modifications to the five tracked management documents and the untracked management/design documents remain in place, plus the new untracked `website/` directory.
  (Update, 2026-10-13: superseded — the website is now committed to `master` (`4418e48`) and deployed; see the launch section below.)

## Website launch (2026-10-13)

- The static website is **live on GitHub Pages**: https://jademoon0428-star.github.io/ai-token-cost-monitor/
- Deployment: the `gh-pages` branch holds `index.html` + `styles.css` at the repository root (Pages source: `gh-pages` / root). `master` was not modified by the deployment; the canonical source remains `website/` on `master`. Website content updates require syncing both branches (`website/` on `master` → root of `gh-pages`).
- Git: `4418e48` `docs: add official website static page` (master, exactly `website/index.html` + `website/styles.css`); gh-pages publish commits `f00057a` and `c196f97`, both pushed (`origin/gh-pages` in sync).
- Acceptance verification (read-only, 2026-10-13): **PASS** — home page HTTP 200; `styles.css` HTTP 200 (`text/css`, relative path, content matches local, zero 404 resources, zero external assets, no `src` elements); download link resolves to the v1.5.5 Release asset (HEAD 200) and the release page returns 200; single `h1`, 8 FAQ items, privacy and product-intro sections render correctly; promotional-boundary scan clean (no real-time-monitoring, auto-block, unimplemented-platform, or auto-recommendation claims — the only "real-time monitor" match is the FAQ question whose answer is "No.").
- Not claimed: a browser end-to-end download → SHA256 re-check was not run during this verification, matching the page's own disclosure.
- Forward notes: website animation/demo additions are **post-v1.5.5 website enhancements** and are not part of the current version; SaaS, account-system, and enterprise-feature scope expansion remains out of scope.
- Git state after launch (2026-10-13): `master` = `5a5c4ad` `docs: close out v1.5.5 website launch`, in sync with `origin/master` (the website page itself was committed as `4418e48` `docs: add official website static page`); `gh-pages` = `c196f97`, in sync with `origin/gh-pages` (publish commits `f00057a` and `c196f97`). Deployment: `gh-pages` branch root (`index.html` + `styles.css`); canonical source is `website/` on `master`; dual-branch sync rule: `master website/` → `gh-pages` root.
- Release phase closed (2026-10-13): Release, installer package, GitHub Release, website launch, website acceptance, and documentation closeout are all complete for v1.5.5.
- Next phase (confirmed 2026-10-13): user validation first; website animation demos are a post-v1.5.5 website enhancement; no SaaS / account-system / enterprise scope expansion; the Personalized AI Optimization Engine stays deferred until real user feedback exists.

## Definition of done for the next release

- v1.5.4 shipped on 2026-10-07 (tag → `bc47a9a`), with release notes that match `docs/CHANGELOG.md`.
- v1.5.5 shipped on 2026-10-11: commit `40a0996`, tag `v1.5.5`, pushed to GitHub master, GitHub Release created, release notes matching `docs/CHANGELOG.md`; desktop packaging verified, installer SHA256 recorded, install validation and released-build manual testing all PASS.
- Every new table and endpoint still satisfies the evidence rule: a fact column is nullable and means unknown, never zero.
- No rate, score, rank, weight, or confidence column is introduced into the Registry or Planner.
- No currency conversion is introduced.
- The desktop package still ships with no `data/`, no `*.db`, and no source files.
