import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';

/*
 * Official DeepSeek export importer (CLI) — registered as
 * npm run import:deepseek.
 *
 * Unlike earlier versions, this script does NOT hardcode a database path,
 * does NOT maintain a private copy of the schema, and does NOT clean up
 * legacy test fixtures. It runs through the same code path as the import
 * API Confirm action:
 *
 *   1. parse the ZIP (lib/parsers/deepseek-export.ts) — produces the
 *      deterministic usage/cost IDs used everywhere,
 *   2. initDb() runs the standard migrations through lib/schema.ts
 *      (including provenance / import_id / import_logs), so it also works
 *      on a database that has not run the P1 migration yet,
 *   3. finalizeDeepSeekImport() commits usage + cost + import journal in
 *      one SQLite transaction.
 *
 * The database location follows lib/db.ts resolveDbPath():
 *   - NODE_ENV=development  -> <cwd>/data/ai-token-cost-monitor.db
 *   - otherwise (desktop)   -> %APPDATA%\AI-Cost-Management\data\...db
 *
 * The lib modules are TypeScript and use extensionless relative imports
 * (resolved by the Next.js bundler). Plain Node ESM requires explicit
 * extensions, so this script registers a tiny resolver hook that appends
 * ".ts" to extensionless relative imports before loading them. The hooks are
 * only installed in this process and only affect lib module loading here.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier.startsWith('./') ||
      specifier.startsWith('../')
    ) {
      try {
        return nextResolve(specifier, context);
      } catch {
        return nextResolve(`${specifier}.ts`, context);
      }
    }

    return nextResolve(specifier, context);
  },
});

const { dbPath } = await import('../lib/db.ts');
const { finalizeDeepSeekImport } = await import('../lib/import/deepseek-finalize.ts');
const { parseDeepSeekExportZip } = await import('../lib/parsers/deepseek-export.ts');

const zipPath = process.argv[2];
if (!zipPath) {
  console.error('Usage: npm run import:deepseek -- "C:\\path\\to\\usage_data_YYYY-MM-DD_YYYY-MM-DD.zip"');
  process.exit(1);
}
if (process.platform !== 'win32') {
  console.error('This importer currently targets Windows PowerShell.');
  process.exit(1);
}
const absoluteZip = path.resolve(zipPath);
if (!fs.existsSync(absoluteZip)) {
  console.error(`File not found: ${absoluteZip}`);
  process.exit(1);
}

const parsed = parseDeepSeekExportZip(absoluteZip);

const finalized = finalizeDeepSeekImport({
  records: parsed.records,
  summary: parsed.summary,
  zipSha256: parsed.summary.zipSha256,
});

console.log(`DeepSeek export import: PASS`);
console.log(`Imported usage records: ${finalized.imported}`);
console.log(`Cost records added: ${finalized.costed}`);
console.log(`Skipped (already present): ${finalized.skipped}`);
console.log(`Models: ${parsed.summary.models.join(', ')}`);
console.log(`Declared cost: ${parsed.summary.currency} ${(parsed.summary.totalCostMicros / 1_000_000).toFixed(6)}`);
console.log(`Batch: ${finalized.importId}`);
console.log(`Database: ${dbPath}`);