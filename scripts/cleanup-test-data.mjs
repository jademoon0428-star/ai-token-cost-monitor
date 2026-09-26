import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const dbPath = join(process.cwd(), 'data', 'ai-token-cost-monitor.db');

if (!existsSync(dbPath)) {
  console.error('Database not found:', dbPath);
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');

const before = db.prepare(`
  SELECT COUNT(*) AS count,
         COALESCE(SUM(total_cost_micros), 0) AS micros
  FROM cost_records
`).get();

const testRows = db.prepare(`
  SELECT cr.id, cr.usage_record_id, cr.total_cost_micros, cr.currency,
         ur.source, ur.provider_id, ur.model_id, ur.timestamp
  FROM cost_records cr
  JOIN usage_records ur ON ur.id = cr.usage_record_id
  WHERE ur.source = 'official_api'
`).all();

if (testRows.length === 0) {
  console.log('No official_api test records found. Nothing to delete.');
  db.close();
  process.exit(0);
}

const deleteCost = db.prepare('DELETE FROM cost_records WHERE usage_record_id = ?');
const deleteUsage = db.prepare('DELETE FROM usage_records WHERE id = ?');

for (const row of testRows) {
  deleteCost.run(row.usage_record_id);
  deleteUsage.run(row.usage_record_id);
}

const after = db.prepare(`
  SELECT COUNT(*) AS count,
         COALESCE(SUM(total_cost_micros), 0) AS micros
  FROM cost_records
`).get();

console.log('Test data cleanup: PASS');
console.log(`Deleted usage records: ${testRows.length}`);
console.log(`Cost records before: ${before.count}`);
console.log(`Cost records after: ${after.count}`);
console.log(`Remaining recorded cost micros: ${after.micros}`);
console.log('Only records marked source=official_api were removed.');
console.log('Your official_export DeepSeek data was not removed.');

db.close();
