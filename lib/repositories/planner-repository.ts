import { getDb } from "@/lib/db";
import { initDb } from "@/lib/schema";

/*
 * v1.4-C AI Project Planner repository.
 *
 * Plain data access only. No estimation, no pricing, no currency
 * conversion, no model selection and no scoring happen here: this
 * module stores and returns exactly what it is given.
 *
 * Planned data never becomes measurement. Nothing in this file
 * writes to usage_records or cost_records.
 */

export type ProjectPreference =
  | "cost_first"
  | "time_first"
  | "balanced";

export type ProjectStatus =
  | "planning"
  | "active"
  | "completed"
  | "abandoned";

export type ProjectRow = {
  id: string;
  name: string;
  goal: string | null;
  description: string | null;
  preference: string;
  budget_min_micros: number | null;
  budget_max_micros: number | null;
  budget_currency: string | null;
  deadline_days: number | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ProjectPlanRow = {
  id: string;
  project_id: string;
  version: number;
  strategy: string;
  summary: string | null;
  created_at: string;
};

export type ProjectTaskRow = {
  id: string;
  plan_id: string;
  task_id: string | null;
  sequence: number;
  name: string;
  category: string;
  complexity: string;
  description: string | null;
  required_capabilities: string | null;
  estimated_input_tokens_min: number | null;
  estimated_input_tokens_max: number | null;
  estimated_output_tokens_min: number | null;
  estimated_output_tokens_max: number | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ProjectTaskAiOptionRow = {
  id: string;
  project_task_id: string;
  model_id: string;
  tool_id: string | null;
  is_selected: number;
  cost_min_micros: number | null;
  cost_max_micros: number | null;
  cost_currency: string | null;
  time_min_minutes: number | null;
  time_max_minutes: number | null;
  fit_status: string;
  excluded_reason: string | null;
  pricing_basis: string | null;
  rationale: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateProjectInput = {
  id: string;
  name: string;
  goal?: string | null;
  description?: string | null;
  preference?: ProjectPreference;
  budgetMinMicros?: number | null;
  budgetMaxMicros?: number | null;
  budgetCurrency?: string | null;
  deadlineDays?: number | null;
  status?: ProjectStatus;
  createdAt: string;
};

export type UpdateProjectInput = {
  name?: string;
  goal?: string | null;
  description?: string | null;
  preference?: ProjectPreference;
  budgetMinMicros?: number | null;
  budgetMaxMicros?: number | null;
  budgetCurrency?: string | null;
  deadlineDays?: number | null;
  updatedAt: string;
};

export type CreateProjectPlanInput = {
  id: string;
  projectId: string;
  version?: number;
  strategy: ProjectPreference;
  summary?: string | null;
  createdAt: string;
};

export type ProjectTaskCategory =
  | "planning"
  | "architecture"
  | "research"
  | "ui_design"
  | "coding"
  | "debugging"
  | "testing"
  | "documentation"
  | "review"
  | "deployment";

export type ProjectTaskComplexity =
  | "low"
  | "medium"
  | "high";

export type ProjectTaskStatus =
  | "planned"
  | "in_progress"
  | "done"
  | "skipped";

export type CreateProjectTaskInput = {
  id: string;
  planId: string;
  taskId?: string | null;
  sequence: number;
  name: string;
  category: ProjectTaskCategory;
  complexity: ProjectTaskComplexity;
  description?: string | null;
  requiredCapabilities?: string | null;
  estimatedInputTokensMin?: number | null;
  estimatedInputTokensMax?: number | null;
  estimatedOutputTokensMin?: number | null;
  estimatedOutputTokensMax?: number | null;
  status?: ProjectTaskStatus;
  createdAt: string;
};

export type UpdateProjectTaskInput = {
  name?: string;
  category?: ProjectTaskCategory;
  complexity?: ProjectTaskComplexity;
  description?: string | null;
  requiredCapabilities?: string | null;
  estimatedInputTokensMin?: number | null;
  estimatedInputTokensMax?: number | null;
  estimatedOutputTokensMin?: number | null;
  estimatedOutputTokensMax?: number | null;
  updatedAt: string;
};

/*
 * Capability fit of a model/tool pair against the planned step's
 * own requirements (required_capabilities / complexity):
 *
 * - 'meets'          the pair can run the step
 * - 'below_minimum'  the pair is missing at least one required capability
 * - 'unknown'        not determined
 *
 * This is a task-requirement fact, never a budget or price verdict,
 * and never a score.
 */
export type FitStatus =
  | "meets"
  | "below_minimum"
  | "unknown";

export type CreateProjectTaskAiOptionInput = {
  id: string;
  projectTaskId: string;
  modelId: string;
  toolId?: string | null;
  isSelected?: 0 | 1;
  costMinMicros?: number | null;
  costMaxMicros?: number | null;
  costCurrency?: string | null;
  timeMinMinutes?: number | null;
  timeMaxMinutes?: number | null;
  fitStatus?: FitStatus;
  excludedReason?: string | null;
  pricingBasis?: string | null;
  rationale?: string | null;
  createdAt: string;
};

const PROJECT_COLUMNS = `
  id,
  name,
  goal,
  description,
  preference,
  budget_min_micros,
  budget_max_micros,
  budget_currency,
  deadline_days,
  status,
  created_at,
  updated_at
`;

const PLAN_COLUMNS = `
  id,
  project_id,
  version,
  strategy,
  summary,
  created_at
`;

const PROJECT_TASK_COLUMNS = `
  id,
  plan_id,
  task_id,
  sequence,
  name,
  category,
  complexity,
  description,
  required_capabilities,
  estimated_input_tokens_min,
  estimated_input_tokens_max,
  estimated_output_tokens_min,
  estimated_output_tokens_max,
  status,
  created_at,
  updated_at
`;

const AI_OPTION_COLUMNS = `
  id,
  project_task_id,
  model_id,
  tool_id,
  is_selected,
  cost_min_micros,
  cost_max_micros,
  cost_currency,
  time_min_minutes,
  time_max_minutes,
  fit_status,
  excluded_reason,
  pricing_basis,
  rationale,
  created_at,
  updated_at
`;

export function createProject(
  input: CreateProjectInput
): void {
  initDb();

  getDb()
    .prepare(
      `
        INSERT INTO projects
        (
          id,
          name,
          goal,
          description,
          preference,
          budget_min_micros,
          budget_max_micros,
          budget_currency,
          deadline_days,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      input.id,
      input.name,
      input.goal ?? null,
      input.description ?? null,
      input.preference ?? "balanced",
      input.budgetMinMicros ?? null,
      input.budgetMaxMicros ?? null,
      input.budgetCurrency ?? null,
      input.deadlineDays ?? null,
      input.status ?? "planning",
      input.createdAt,
      input.createdAt
    );
}

export function getProject(
  id: string
): ProjectRow | undefined {
  initDb();

  return getDb()
    .prepare(
      `
        SELECT ${PROJECT_COLUMNS}
        FROM projects
        WHERE id = ?
      `
    )
    .get(id) as ProjectRow | undefined;
}

export function listProjects(
  query: {
    status?: string;
  } = {}
): ProjectRow[] {
  initDb();

  if (query.status !== undefined) {
    return getDb()
      .prepare(
        `
          SELECT ${PROJECT_COLUMNS}
          FROM projects
          WHERE status = ?
          ORDER BY created_at DESC
        `
      )
      .all(query.status) as ProjectRow[];
  }

  return getDb()
    .prepare(
      `
        SELECT ${PROJECT_COLUMNS}
        FROM projects
        ORDER BY created_at DESC
      `
    )
    .all() as ProjectRow[];
}

export function updateProject(
  id: string,
  input: UpdateProjectInput
): ProjectRow | undefined {
  initDb();

  const assignments: string[] = [];
  const params: Array<string | number | null> = [];

  if (input.name !== undefined) {
    assignments.push("name = ?");
    params.push(input.name);
  }

  if (input.goal !== undefined) {
    assignments.push("goal = ?");
    params.push(input.goal);
  }

  if (input.description !== undefined) {
    assignments.push("description = ?");
    params.push(input.description);
  }

  if (input.preference !== undefined) {
    assignments.push("preference = ?");
    params.push(input.preference);
  }

  if (input.budgetMinMicros !== undefined) {
    assignments.push("budget_min_micros = ?");
    params.push(input.budgetMinMicros);
  }

  if (input.budgetMaxMicros !== undefined) {
    assignments.push("budget_max_micros = ?");
    params.push(input.budgetMaxMicros);
  }

  if (input.budgetCurrency !== undefined) {
    assignments.push("budget_currency = ?");
    params.push(input.budgetCurrency);
  }

  if (input.deadlineDays !== undefined) {
    assignments.push("deadline_days = ?");
    params.push(input.deadlineDays);
  }

  if (assignments.length === 0) {
    return getProject(id);
  }

  assignments.push("updated_at = ?");
  params.push(input.updatedAt);

  getDb()
    .prepare(
      `
        UPDATE projects
        SET ${assignments.join(", ")}
        WHERE id = ?
      `
    )
    .run(...params, id);

  return getProject(id);
}

export function updateProjectStatus(
  id: string,
  status: ProjectStatus,
  updatedAt: string
): void {
  initDb();

  getDb()
    .prepare(
      `
        UPDATE projects
        SET
          status = ?,
          updated_at = ?
        WHERE id = ?
      `
    )
    .run(status, updatedAt, id);
}

export function createProjectPlan(
  input: CreateProjectPlanInput
): void {
  initDb();

  getDb()
    .prepare(
      `
        INSERT INTO project_plans
        (
          id,
          project_id,
          version,
          strategy,
          summary,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      input.id,
      input.projectId,
      input.version ?? 1,
      input.strategy,
      input.summary ?? null,
      input.createdAt
    );
}

export function getProjectPlan(
  id: string
): ProjectPlanRow | undefined {
  initDb();

  return getDb()
    .prepare(
      `
        SELECT ${PLAN_COLUMNS}
        FROM project_plans
        WHERE id = ?
      `
    )
    .get(id) as ProjectPlanRow | undefined;
}

export function listProjectPlans(
  projectId: string
): ProjectPlanRow[] {
  initDb();

  return getDb()
    .prepare(
      `
        SELECT ${PLAN_COLUMNS}
        FROM project_plans
        WHERE project_id = ?
        ORDER BY version ASC
      `
    )
    .all(projectId) as ProjectPlanRow[];
}

/*
 * The version the next plan for this project will get.
 *
 * A project with versions 1, 2, 3 returns 4; a project with no plans
 * returns 1. The caller inserts this value, which is what keeps
 * UNIQUE(project_id, version) satisfied without the client ever
 * choosing a version. No new column is involved.
 */
export function nextProjectPlanVersion(
  projectId: string
): number {
  initDb();

  const row = getDb()
    .prepare(
      `
        SELECT MAX(version) AS highest
        FROM project_plans
        WHERE project_id = ?
      `
    )
    .get(projectId) as
    | { highest: number | null }
    | undefined;

  return (row?.highest ?? 0) + 1;
}

export function createProjectTask(
  input: CreateProjectTaskInput
): void {
  initDb();

  getDb()
    .prepare(
      `
        INSERT INTO project_tasks
        (
          id,
          plan_id,
          task_id,
          sequence,
          name,
          category,
          complexity,
          description,
          required_capabilities,
          estimated_input_tokens_min,
          estimated_input_tokens_max,
          estimated_output_tokens_min,
          estimated_output_tokens_max,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      input.id,
      input.planId,
      input.taskId ?? null,
      input.sequence,
      input.name,
      input.category,
      input.complexity,
      input.description ?? null,
      input.requiredCapabilities ?? null,
      input.estimatedInputTokensMin ?? null,
      input.estimatedInputTokensMax ?? null,
      input.estimatedOutputTokensMin ?? null,
      input.estimatedOutputTokensMax ?? null,
      input.status ?? "planned",
      input.createdAt,
      input.createdAt
    );
}

export function getProjectTask(
  id: string
): ProjectTaskRow | undefined {
  initDb();

  return getDb()
    .prepare(
      `
        SELECT ${PROJECT_TASK_COLUMNS}
        FROM project_tasks
        WHERE id = ?
      `
    )
    .get(id) as ProjectTaskRow | undefined;
}

export function listProjectTasks(
  planId: string
): ProjectTaskRow[] {
  initDb();

  return getDb()
    .prepare(
      `
        SELECT ${PROJECT_TASK_COLUMNS}
        FROM project_tasks
        WHERE plan_id = ?
        ORDER BY sequence ASC
      `
    )
    .all(planId) as ProjectTaskRow[];
}

/*
 * The sequence the next planned step of this plan will get.
 *
 * Steps 1, 2, 3 return 4; a plan with no steps returns 1. This is
 * what keeps UNIQUE(plan_id, sequence) satisfied without the client
 * choosing a sequence. No new column is involved.
 */
export function nextProjectTaskSequence(
  planId: string
): number {
  initDb();

  const row = getDb()
    .prepare(
      `
        SELECT MAX(sequence) AS highest
        FROM project_tasks
        WHERE plan_id = ?
      `
    )
    .get(planId) as
    | { highest: number | null }
    | undefined;

  return (row?.highest ?? 0) + 1;
}

/*
 * Lists the planned steps that are linked to an execution task, in
 * either direction. Used to answer "which planned step does this
 * execution task belong to" without touching the Task Session layer.
 */
export function listProjectTasksByExecutionTask(
  taskId: string
): ProjectTaskRow[] {
  initDb();

  return getDb()
    .prepare(
      `
        SELECT ${PROJECT_TASK_COLUMNS}
        FROM project_tasks
        WHERE task_id = ?
        ORDER BY sequence ASC
      `
    )
    .all(taskId) as ProjectTaskRow[];
}

export function updateProjectTask(
  id: string,
  input: UpdateProjectTaskInput
): ProjectTaskRow | undefined {
  initDb();

  const assignments: string[] = [];
  const params: Array<string | number | null> = [];

  if (input.name !== undefined) {
    assignments.push("name = ?");
    params.push(input.name);
  }

  if (input.category !== undefined) {
    assignments.push("category = ?");
    params.push(input.category);
  }

  if (input.complexity !== undefined) {
    assignments.push("complexity = ?");
    params.push(input.complexity);
  }

  if (input.description !== undefined) {
    assignments.push("description = ?");
    params.push(input.description);
  }

  if (input.requiredCapabilities !== undefined) {
    assignments.push("required_capabilities = ?");
    params.push(input.requiredCapabilities);
  }

  if (input.estimatedInputTokensMin !== undefined) {
    assignments.push("estimated_input_tokens_min = ?");
    params.push(input.estimatedInputTokensMin);
  }

  if (input.estimatedInputTokensMax !== undefined) {
    assignments.push("estimated_input_tokens_max = ?");
    params.push(input.estimatedInputTokensMax);
  }

  if (input.estimatedOutputTokensMin !== undefined) {
    assignments.push("estimated_output_tokens_min = ?");
    params.push(input.estimatedOutputTokensMin);
  }

  if (input.estimatedOutputTokensMax !== undefined) {
    assignments.push("estimated_output_tokens_max = ?");
    params.push(input.estimatedOutputTokensMax);
  }

  if (assignments.length === 0) {
    return getProjectTask(id);
  }

  assignments.push("updated_at = ?");
  params.push(input.updatedAt);

  getDb()
    .prepare(
      `
        UPDATE project_tasks
        SET ${assignments.join(", ")}
        WHERE id = ?
      `
    )
    .run(...params, id);

  return getProjectTask(id);
}

export function updateProjectTaskStatus(
  id: string,
  status: ProjectTaskStatus,
  updatedAt: string
): void {
  initDb();

  getDb()
    .prepare(
      `
        UPDATE project_tasks
        SET
          status = ?,
          updated_at = ?
        WHERE id = ?
      `
    )
    .run(status, updatedAt, id);
}

/*
 * Links a planned step to an existing execution task.
 *
 * This is the entire Planner / Task Session connection: one nullable
 * column pointing at tasks(id). It does not create sessions, does not
 * read or write task_sessions, and passes null to unlink.
 */
export function linkProjectTaskToExecutionTask(
  id: string,
  taskId: string | null,
  updatedAt: string
): ProjectTaskRow | undefined {
  initDb();

  getDb()
    .prepare(
      `
        UPDATE project_tasks
        SET
          task_id = ?,
          updated_at = ?
        WHERE id = ?
      `
    )
    .run(taskId, updatedAt, id);

  return getProjectTask(id);
}

export function createProjectTaskAiOption(
  input: CreateProjectTaskAiOptionInput
): void {
  initDb();

  getDb()
    .prepare(
      `
        INSERT INTO project_task_ai_options
        (
          id,
          project_task_id,
          model_id,
          tool_id,
          is_selected,
          cost_min_micros,
          cost_max_micros,
          cost_currency,
          time_min_minutes,
          time_max_minutes,
          fit_status,
          excluded_reason,
          pricing_basis,
          rationale,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      input.id,
      input.projectTaskId,
      input.modelId,
      input.toolId ?? null,
      input.isSelected ?? 0,
      input.costMinMicros ?? null,
      input.costMaxMicros ?? null,
      input.costCurrency ?? null,
      input.timeMinMinutes ?? null,
      input.timeMaxMinutes ?? null,
      input.fitStatus ?? "unknown",
      input.excludedReason ?? null,
      input.pricingBasis ?? null,
      input.rationale ?? null,
      input.createdAt,
      input.createdAt
    );
}

export function getProjectTaskAiOption(
  id: string
): ProjectTaskAiOptionRow | undefined {
  initDb();

  return getDb()
    .prepare(
      `
        SELECT ${AI_OPTION_COLUMNS}
        FROM project_task_ai_options
        WHERE id = ?
      `
    )
    .get(id) as ProjectTaskAiOptionRow | undefined;
}

export function listProjectTaskAiOptions(
  projectTaskId: string
): ProjectTaskAiOptionRow[] {
  initDb();

  return getDb()
    .prepare(
      `
        SELECT ${AI_OPTION_COLUMNS}
        FROM project_task_ai_options
        WHERE project_task_id = ?
        ORDER BY created_at ASC, id ASC
      `
    )
    .all(projectTaskId) as ProjectTaskAiOptionRow[];
}

/*
 * Records an explicit user selection.
 *
 * This is a user decision recorder, not a recommender. It never looks
 * at cost, time or fit_status to decide anything: the chosen option
 * becomes the selected one and every other option for the same
 * planned step is cleared, nothing more.
 */
export function selectProjectTaskAiOption(
  id: string,
  updatedAt: string
): void {
  initDb();

  const db = getDb();
  const option = getProjectTaskAiOption(id);

  if (!option) {
    throw new Error(
      `project task ai option "${id}" does not exist`
    );
  }

  db.exec("BEGIN");

  try {
    db.prepare(
      `
        UPDATE project_task_ai_options
        SET
          is_selected = 0,
          updated_at = ?
        WHERE project_task_id = ?
          AND id <> ?
      `
    )
      .run(
        updatedAt,
        option.project_task_id,
        id
      );

    db.prepare(
      `
        UPDATE project_task_ai_options
        SET
          is_selected = 1,
          updated_at = ?
        WHERE id = ?
      `
    )
      .run(updatedAt, id);

    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Ignore rollback errors so the original error is preserved.
    }

    throw error;
  }
}
