import { getDb } from "./db";

export function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(provider_id, name),
      FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS usage_records (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cached_tokens INTEGER NOT NULL DEFAULT 0,
      reasoning_tokens INTEGER NOT NULL DEFAULT 0,
      application TEXT,
      project TEXT,
      import_id TEXT,
      source TEXT NOT NULL CHECK(
        source IN (
          'official_api',
          'official_export',
          'application',
          'sdk',
          'gateway',
          'local_estimate'
        )
      ),
      accuracy TEXT NOT NULL CHECK(
        accuracy IN (
          'verified',
          'estimated'
        )
      ),
      created_at TEXT NOT NULL,
      FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE CASCADE,
      FOREIGN KEY(model_id) REFERENCES models(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pricing_versions (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      model TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      input_per_million REAL NOT NULL DEFAULT 0,
      output_per_million REAL NOT NULL DEFAULT 0,
      cached_per_million REAL NOT NULL DEFAULT 0,
      reasoning_per_million REAL NOT NULL DEFAULT 0,
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cost_records (
      id TEXT PRIMARY KEY,
      usage_record_id TEXT NOT NULL UNIQUE,
      import_id TEXT,
      input_cost_micros INTEGER NOT NULL DEFAULT 0,
      output_cost_micros INTEGER NOT NULL DEFAULT 0,
      cached_cost_micros INTEGER NOT NULL DEFAULT 0,
      reasoning_cost_micros INTEGER NOT NULL DEFAULT 0,
      total_cost_micros INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      pricing_version TEXT NOT NULL,
      provenance TEXT NOT NULL DEFAULT 'unknown',
      created_at TEXT NOT NULL,
      FOREIGN KEY(usage_record_id) REFERENCES usage_records(id) ON DELETE CASCADE
    );

    /*
     * Import journal for one official DeepSeek ZIP batch.
     *
     * record_count / total_cost_micros are a batch-level source
     * declaration: they describe what the official ZIP reports, not
     * how many rows were actually merged on a given run (re-imports
     * of the same ZIP stay idempotent).
     */
    CREATE TABLE IF NOT EXISTS import_logs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      zip_sha256 TEXT NOT NULL,
      record_count INTEGER NOT NULL DEFAULT 0,
      min_timestamp TEXT,
      max_timestamp TEXT,
      currency TEXT NOT NULL DEFAULT 'CNY',
      total_cost_micros INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      period TEXT NOT NULL CHECK(
        period IN (
          'daily',
          'weekly',
          'monthly'
        )
      ),
      amount_micros INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_usage_timestamp
      ON usage_records(timestamp);

    CREATE INDEX IF NOT EXISTS idx_usage_provider
      ON usage_records(provider_id);

    CREATE INDEX IF NOT EXISTS idx_usage_model
      ON usage_records(model_id);

    CREATE INDEX IF NOT EXISTS idx_cost_created
      ON cost_records(created_at);

    CREATE INDEX IF NOT EXISTS idx_budgets_period
      ON budgets(period);
  `);

  migrateBudgetsTable(db);
  migrateCostRecordsProvenance(db);
  migrateUsageImportId(db);
  migrateCostImportId(db);
}

function migrateBudgetsTable(db: ReturnType<typeof getDb>) {
  const existingSql = db
    .prepare(
      `SELECT sql
       FROM sqlite_master
       WHERE type = 'table'
         AND name = 'budgets'`
    )
    .get() as { sql?: string } | undefined;

  const tableSql = existingSql?.sql ?? "";

  const alreadySupportsDailyWeekly =
    tableSql.includes("'daily'") &&
    tableSql.includes("'weekly'");

  if (alreadySupportsDailyWeekly) {
    return;
  }

  const transaction = () => {
    db.exec(`BEGIN`);

    try {
      db.exec(`
        ALTER TABLE budgets RENAME TO budgets_legacy;

        CREATE TABLE budgets (
          id TEXT PRIMARY KEY,
          period TEXT NOT NULL CHECK(
            period IN (
              'daily',
              'weekly',
              'monthly'
            )
          ),
          amount_micros INTEGER NOT NULL,
          currency TEXT NOT NULL DEFAULT 'USD',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT INTO budgets (
          id,
          period,
          amount_micros,
          currency,
          created_at,
          updated_at
        )
        SELECT
          id,
          period,
          amount_micros,
          currency,
          created_at,
          updated_at
        FROM budgets_legacy
        WHERE period = 'monthly';

        DROP TABLE budgets_legacy;

        CREATE INDEX IF NOT EXISTS idx_budgets_period
          ON budgets(period);
      `);

      db.exec(`COMMIT`);
    } catch (error) {
      try {
        db.exec(`ROLLBACK`);
      } catch {
        // Ignore rollback errors so the original migration error is preserved.
      }

      throw error;
    }
  };

  transaction();
}

function migrateCostRecordsProvenance(db: ReturnType<typeof getDb>) {
  const columns = db
    .prepare(
      `PRAGMA table_info(cost_records)`
    )
    .all() as { name: string }[];

  const alreadyHasProvenance =
    columns.some(
      (column) =>
        column.name === "provenance"
    );

  if (alreadyHasProvenance) {
    return;
  }

  const transaction = () => {
    db.exec(`BEGIN`);

    try {
      db.exec(`
        ALTER TABLE cost_records
          ADD COLUMN provenance TEXT NOT NULL DEFAULT 'unknown';

        UPDATE cost_records
        SET provenance = (
          SELECT CASE
            WHEN u.source IN (
              'official_api',
              'official_export'
            ) THEN 'source_reported'

            WHEN u.accuracy = 'estimated'
              THEN 'estimated'

            WHEN u.source = 'local_estimate'
              THEN 'estimated'

            ELSE 'unknown'
          END
          FROM usage_records u
          WHERE u.id = cost_records.usage_record_id
        )
        WHERE EXISTS (
          SELECT 1
          FROM usage_records u
          WHERE u.id = cost_records.usage_record_id
        );
      `);

      db.exec(`COMMIT`);
    } catch (error) {
      try {
        db.exec(`ROLLBACK`);
      } catch {
        // Ignore rollback errors so the original migration error is preserved.
      }

      throw error;
    }
  };

  transaction();
}

function migrateUsageImportId(db: ReturnType<typeof getDb>) {
  const columns = db
    .prepare(
      `PRAGMA table_info(usage_records)`
    )
    .all() as { name: string }[];

  const alreadyHasImportId =
    columns.some(
      (column) =>
        column.name === "import_id"
    );

  if (alreadyHasImportId) {
    return;
  }

  db.exec(
    `ALTER TABLE usage_records
      ADD COLUMN import_id TEXT;`
  );
}

function migrateCostImportId(db: ReturnType<typeof getDb>) {
  const columns = db
    .prepare(
      `PRAGMA table_info(cost_records)`
    )
    .all() as { name: string }[];

  const alreadyHasImportId =
    columns.some(
      (column) =>
        column.name === "import_id"
    );

  if (alreadyHasImportId) {
    return;
  }

  db.exec(
    `ALTER TABLE cost_records
      ADD COLUMN import_id TEXT;`
  );
}