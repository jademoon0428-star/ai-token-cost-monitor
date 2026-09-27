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

    /*
     * v1.4-C AI Project Planner (data layer only).
     *
     * Everything in this block is PLANNED data: intent, estimates and
     * user decisions. It is never a measurement. No Planner table
     * writes to usage_records or cost_records, and actual spend is
     * still only ever read from the Money Layer.
     *
     * Two hard rules apply to every nullable money/token column
     * below:
     *
     * - NULL means "unknown / not estimated". It never means zero.
     *   A missing budget is three NULL columns, never 0, and never an
     *   implicit USD.
     * - No currency conversion happens anywhere in this schema. Two
     *   options priced in CNY and USD simply stay in their own
     *   currency and are never summed together.
     *
     * There are deliberately no score / rank / tier / weight /
     * confidence / quality columns anywhere in the Planner: the
     * Planner records what the user asked for and what each option
     * was estimated to cost, it never rates models.
     */

    /*
     * A project is one body of work the user wants to plan.
     */
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      goal TEXT,
      description TEXT,
      preference TEXT NOT NULL DEFAULT 'balanced' CHECK(
        preference IN (
          'cost_first',
          'time_first',
          'balanced'
        )
      ),
      budget_min_micros INTEGER,
      budget_max_micros INTEGER,
      budget_currency TEXT,
      deadline_days INTEGER,
      status TEXT NOT NULL DEFAULT 'planning' CHECK(
        status IN (
          'planning',
          'active',
          'completed',
          'abandoned'
        )
      ),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    /*
     * A plan is one version of the approach for a project. Versions
     * are immutable rows; a new version is a new row, never an
     * update of an old one.
     */
    CREATE TABLE IF NOT EXISTS project_plans (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      strategy TEXT NOT NULL CHECK(
        strategy IN (
          'cost_first',
          'time_first',
          'balanced'
        )
      ),
      summary TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(project_id, version),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    /*
     * A planned step of a plan.
     *
     * task_id is the ONLY link to the existing execution layer. It
     * points at an existing tasks row once the user actually starts
     * the step, and it is set to NULL if that task is later deleted.
     * There is deliberately no task_session_id here: one planned step
     * may produce many execution sessions over its life, and sessions
     * remain owned by the existing Task Session layer.
     *
     * estimated_*_tokens are the user's or the Planner's estimate of
     * the step, NOT a measurement, and NOT a cost. Cost and time live
     * in project_task_ai_options.
     *
     * required_capabilities is a JSON array stored as TEXT, e.g.
     * '["vision","tools"]'. It is plain text on purpose: no JSON
     * extension or third-party driver is required to read or write
     * it.
     */
    CREATE TABLE IF NOT EXISTS project_tasks (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      task_id TEXT,
      sequence INTEGER NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK(
        category IN (
          'planning',
          'architecture',
          'research',
          'ui_design',
          'coding',
          'debugging',
          'testing',
          'documentation',
          'review',
          'deployment'
        )
      ),
      complexity TEXT NOT NULL CHECK(
        complexity IN (
          'low',
          'medium',
          'high'
        )
      ),
      description TEXT,
      required_capabilities TEXT,
      estimated_input_tokens_min INTEGER,
      estimated_input_tokens_max INTEGER,
      estimated_output_tokens_min INTEGER,
      estimated_output_tokens_max INTEGER,
      status TEXT NOT NULL DEFAULT 'planned' CHECK(
        status IN (
          'planned',
          'in_progress',
          'done',
          'skipped'
        )
      ),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(plan_id, sequence),
      FOREIGN KEY(plan_id) REFERENCES project_plans(id) ON DELETE CASCADE,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL
    );

    /*
     * One candidate way of running a planned step: a model, an
     * optional user tool, and the estimated cost and time.
     *
     * The Planner never picks one of these. is_selected is set only
     * by an explicit user decision, and selecting one option clears
     * the others for the same planned step.
     *
     * fit_status is a plain three-state fact about whether this
     * model/tool pair can actually run the planned step, judged
     * against that step's own required_capabilities and complexity:
     * 'meets', 'below_minimum' (some required capability is missing)
     * or 'unknown' (not determined). It says nothing about budget,
     * price or deadline, and it is never a score: options are not
     * ordered by it and nothing is ranked or recommended from it.
     *
     * cost_min_micros / cost_max_micros / cost_currency are all NULL
     * together when the price is unknown. Unknown is never written
     * as 0 and never as an assumed USD.
     */
    CREATE TABLE IF NOT EXISTS project_task_ai_options (
      id TEXT PRIMARY KEY,
      project_task_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      tool_id TEXT,
      is_selected INTEGER NOT NULL DEFAULT 0 CHECK(
        is_selected IN (0, 1)
      ),
      cost_min_micros INTEGER,
      cost_max_micros INTEGER,
      cost_currency TEXT,
      time_min_minutes INTEGER,
      time_max_minutes INTEGER,
      fit_status TEXT NOT NULL DEFAULT 'unknown' CHECK(
        fit_status IN (
          'meets',
          'below_minimum',
          'unknown'
        )
      ),
      excluded_reason TEXT,
      pricing_basis TEXT,
      rationale TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_task_id) REFERENCES project_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY(model_id) REFERENCES models(id) ON DELETE CASCADE,
      FOREIGN KEY(tool_id) REFERENCES user_ai_tools(id) ON DELETE SET NULL
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

    CREATE INDEX IF NOT EXISTS idx_project_plans_project
      ON project_plans(project_id);

    CREATE INDEX IF NOT EXISTS idx_project_tasks_plan
      ON project_tasks(plan_id);

    CREATE INDEX IF NOT EXISTS idx_project_tasks_task
      ON project_tasks(task_id);

    CREATE INDEX IF NOT EXISTS idx_project_task_ai_options_task
      ON project_task_ai_options(project_task_id);

    CREATE INDEX IF NOT EXISTS idx_project_task_ai_options_model
      ON project_task_ai_options(model_id);

    CREATE INDEX IF NOT EXISTS idx_project_task_ai_options_tool
      ON project_task_ai_options(tool_id);

    /*
     * At most one option per (planned step, model, tool). This is an
     * expression index because SQLite treats NULLs as distinct in a
     * plain UNIQUE constraint, which would let the same model be
     * added twice for the same step with no tool. COALESCE maps NULL
     * to '' so "no tool" collapses to a single value and stays
     * distinct from any real tool_id.
     */
    CREATE UNIQUE INDEX IF NOT EXISTS idx_project_task_ai_options_unique
      ON project_task_ai_options(
        project_task_id,
        model_id,
        COALESCE(tool_id, '')
      );

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