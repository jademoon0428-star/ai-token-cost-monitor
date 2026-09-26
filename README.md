# AI Cost Management

A local-first application for monitoring AI spending, tracking usage, and finding opportunities to reduce cost.

## What it does

- **AI spending monitoring** — costs are counted from source-reported data only.
- **Usage tracking** — inspect model usage records, tokens, and verified costs.
- **Saving insights** — see where AI spending can be reduced.
- **Budget monitoring** — set and control AI spending limits.
- **AI Activity detection** — detect AI-related processes and network activity using local evidence.
- **Verified cost data / official imported data** — the app labels costs as `verified` / `official_api` when they come from an official source, and never invents costs for services that do not report them.

## Core pages

- **Dashboard** — overview of today's and recent verified spending, cost breakdown by provider/model/day, and attention signals.
- **Usage** — model, provider, token, and cost usage records, with a full details view and a JSON import tool.
- **Saving** — where spending can be reduced and why.
- **Budget** — budget monitoring based on verified cost data.
- **AI Activity** — local AI process/connection detection and history.

## Data principles

- The application prioritizes **verified, source-reported cost data**.
- Data imported from official provider exports is labeled `official_export` / `verified` and stored as-is.
- The app does **not** attempt to calculate the "true" cost of every AI service; when a provider does not report a cost, the data is left as unknown rather than estimated.
- Savings and budget figures are based on the same verified cost data, so definitions stay consistent across pages.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## DeepSeek official export import

The official DeepSeek Usage export ZIP can be imported directly into the local SQLite database.

```bash
npm run import:deepseek -- "C:\path\to\usage_data_2026-09-05_2026-09-05.zip"
```

- The importer reads both `cost-*.csv` and `amount-*.csv` files.
- Imported data is stored as `official_export` / `verified`.
- Prices are preserved in CNY.
- The masked API key value present in the export is never imported.

## Connectors

Selected providers can be connected to verify API access and prepare usage synchronization. See the **Connect** page in the app.

## Current status

This project is currently in **MVP / local-first** stage. It runs against a local SQLite database and is intended for individual use on a single machine.