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

    /*
     * v1.4-A Task domain.
     *
     * A task is a named unit of work. A task session is a bounded
     * active interval of that task. Usage records are attached to a
     * session; the task itself never persists a cost, it is always
     * recomputed from the Money Layer (cost_records) on demand.
     */
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_sessions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_usage_records (
      id TEXT PRIMARY KEY,
      task_session_id TEXT NOT NULL,
      usage_record_id TEXT NOT NULL,
      attribution_status TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL,
      UNIQUE(task_session_id, usage_record_id),
      FOREIGN KEY(task_session_id) REFERENCES task_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY(usage_record_id) REFERENCES usage_records(id) ON DELETE CASCADE
    );

    /*
     * v1.4-B AI Registry (infrastructure only).
     *
     * ai_model_capabilities holds one row per model with strictly
     * tri-state capability facts. NULL means Unknown: no official
     * vendor statement was found. 0 means the vendor documents the
     * capability as unsupported. 1 means the vendor documents it as
     * supported.
     *
     * There are deliberately no score, rank, tier, weight or
     * confidence columns. The registry records what a vendor says
     * about its own model; it never rates or ranks models.
     *
     * source_url / source_checked_at keep every fact traceable back
     * to the vendor page it was read from.
     */
    CREATE TABLE IF NOT EXISTS ai_model_capabilities (
      model_id TEXT PRIMARY KEY,
      supports_tools INTEGER CHECK(
        supports_tools IN (0, 1)
      ),
      supports_vision INTEGER CHECK(
        supports_vision IN (0, 1)
      ),
      supports_reasoning INTEGER CHECK(
        supports_reasoning IN (0, 1)
      ),
      context_window_tokens INTEGER,
      max_output_tokens INTEGER,
      source_url TEXT NOT NULL,
      source_checked_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(model_id) REFERENCES models(id) ON DELETE CASCADE
    );

    /*
     * v1.4-B user_ai_tools.
     *
     * A user-declared inventory of the AI tools the user runs
     * (for example a CLI agent or an IDE extension), so usage can
     * later be attributed to a tool.
     *
     * This table intentionally stores NO api_key / token /
     * credential / secret column. Credentials are never persisted
     * in this database.
     */
    CREATE TABLE IF NOT EXISTS user_ai_tools (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(
        status IN ('active', 'archived')
      ),
      notes TEXT,
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

    CREATE INDEX IF NOT EXISTS idx_task_sessions_task
      ON task_sessions(task_id);

    CREATE INDEX IF NOT EXISTS idx_task_usage_session
      ON task_usage_records(task_session_id);

    CREATE INDEX IF NOT EXISTS idx_task_usage_usage
      ON task_usage_records(usage_record_id);

    CREATE INDEX IF NOT EXISTS idx_user_ai_tools_status
      ON user_ai_tools(status);

    CREATE INDEX IF NOT EXISTS idx_user_ai_tools_category
      ON user_ai_tools(category);

    CREATE INDEX IF NOT EXISTS idx_pricing_provider_model
      ON pricing_versions(provider_id, model);

    /*
     * Global invariant: at most one task session may be active at
     * any time. Enforced in the database itself.
     */
    CREATE UNIQUE INDEX IF NOT EXISTS idx_task_sessions_one_active
      ON task_sessions(status)
      WHERE status = 'active';
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