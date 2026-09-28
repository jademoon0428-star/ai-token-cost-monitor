import { randomUUID } from "node:crypto";

import { getDb } from "@/lib/db";
import {
  createProject as createProjectInDb,
  createProjectPlan as createProjectPlanInDb,
  createProjectTask as createProjectTaskInDb,
  createProjectTaskAiOption as createProjectTaskAiOptionInDb,
  getProject,
  getProjectPlan,
  getProjectTask,
  getProjectTaskAiOption,
  linkProjectTaskToExecutionTask as linkInDb,
  listProjectTaskAiOptions,
  nextProjectPlanVersion,
  nextProjectTaskSequence,
  replaceProjectTaskAiOptions,
  selectProjectTaskAiOption as selectInDb,
  updateProject as updateProjectInDb,
  updateProjectStatus as updateProjectStatusInDb,
  updateProjectTask as updateProjectTaskInDb,
  updateProjectTaskStatus as updateProjectTaskStatusInDb,
} from "@/lib/repositories/planner-repository";
import type {
  FitStatus,
  ProjectPreference,
  ProjectStatus,
  ProjectTaskAiOptionRow,
  ProjectTaskCategory,
  ProjectTaskComplexity,
  ProjectTaskRow,
  ProjectTaskStatus,
} from "@/lib/repositories/planner-repository";
import {
  listAiRegistry,
  resolveRegistryPricing,
} from "@/lib/registry/ai-registry-repository";
import { generatePlannerCandidates } from "@/lib/planner/candidate-generator";
import { resolveRegisteredPricing } from "@/lib/planner/registered-pricing";
import {
  listAiResources,
  type AiResourceRow,
} from "@/lib/repositories/ai-resource-repository";

/*
 * v1.4-C AI Project Planner service.
 *
 * This service does exactly three things:
 *
 * 1. Validates input and refuses obviously invalid data.
 * 2. Enforces the small set of legal status transitions.
 * 3. Calls the repository.
 *
 * What it deliberately does NOT do:
 *
 * - It does not estimate anything. It never computes a cost, a
 *   duration or a token count; those arrive as explicit user or
 *   upstream values.
 * - It does not score, rank, rate or compare models. There is no
 *   score / rank / tier / weight / confidence / quality concept here.
 * - It does not pick a model. selectAiOption records a choice the
 *   user already made.
 * - It does not convert currency. A CNY option stays CNY and a USD
 *   option stays USD; they are never summed.
 * - It never calls an LLM and never touches usage_records or
 *   cost_records. Planner data is planned data, not measurement.
 */

export class PlannerServiceError extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string
  ) {
    super(message);
    this.code = code;
  }
}

export const PROJECT_PREFERENCES: ProjectPreference[] = [
  "cost_first",
  "time_first",
  "balanced",
];

export const PROJECT_STATUSES: ProjectStatus[] = [
  "planning",
  "active",
  "completed",
  "abandoned",
];

export const PROJECT_TASK_CATEGORIES: ProjectTaskCategory[] = [
  "planning",
  "architecture",
  "research",
  "ui_design",
  "coding",
  "debugging",
  "testing",
  "documentation",
  "review",
  "deployment",
];

export const PROJECT_TASK_COMPLEXITIES: ProjectTaskComplexity[] = [
  "low",
  "medium",
  "high",
];

export const PROJECT_TASK_STATUSES: ProjectTaskStatus[] = [
  "planned",
  "in_progress",
  "done",
  "skipped",
];

/*
 * Capability fit against the planned step's own requirements
 * (required_capabilities / complexity). 'below_minimum' means a
 * required capability is missing. This is never a budget, price or
 * deadline verdict, and it is never a score: the service validates
 * the value and stores it, nothing more.
 */
export const FIT_STATUSES: FitStatus[] = [
  "meets",
  "below_minimum",
  "unknown",
];

/*
 * Terminal states cannot be left. Everything else may move to any
 * other state, which keeps the rule small while still refusing the
 * obvious nonsense of un-completing a finished project.
 */
const TERMINAL_PROJECT_STATUSES: ProjectStatus[] = [
  "completed",
  "abandoned",
];

const TERMINAL_PROJECT_TASK_STATUSES: ProjectTaskStatus[] = [
  "done",
  "skipped",
];

function fail(
  code: string,
  message: string
): never {
  throw new PlannerServiceError(code, message);
}

function assertOneOf<T extends string>(
  value: string,
  allowed: T[],
  code: string,
  label: string
): T {
  if (!allowed.includes(value as T)) {
    fail(
      code,
      `${label} must be one of ${allowed.join(", ")}, got "${value}"`
    );
  }

  return value as T;
}

function optionalText(
  value: string | null | undefined,
  label: string
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    fail(
      "INVALID_TEXT",
      `${label} must not be an empty string; use null instead`
    );
  }

  return trimmed;
}

function requiredText(
  value: string,
  label: string
): string {
  if (typeof value !== "string" || !value.trim()) {
    fail(
      "INVALID_TEXT",
      `${label} is required`
    );
  }

  return value.trim();
}

/*
 * NULL means unknown. A negative amount is never a legitimate
 * estimate, so it is refused rather than clamped.
 */
function optionalNonNegative(
  value: number | null | undefined,
  label: string
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isInteger(value)) {
    fail(
      "INVALID_NUMBER",
      `${label} must be a whole number of micro-units, got ${value}`
    );
  }

  if (value < 0) {
    fail(
      "NEGATIVE_VALUE",
      `${label} must not be negative, got ${value}`
    );
  }

  return value;
}

function assertRange(
  min: number | null,
  max: number | null,
  code: string,
  label: string
): void {
  if (min !== null && max !== null && min > max) {
    fail(
      code,
      `${label} minimum (${min}) must not be greater than maximum (${max})`
    );
  }
}

/*
 * Hard rule: a cost is either fully known or fully unknown.
 *
 * All three of cost_min_micros, cost_max_micros and cost_currency
 * are NULL together, or all three are present. There is no way to
 * express "unknown price" as 0 / 0 / USD, and no way to express an
 * amount in a currency that is not stated.
 */
function assertCostShape(
  min: number | null,
  max: number | null,
  currency: string | null
): void {
  const values = [min, max, currency];
  const present = values.filter(
    (value) => value !== null
  ).length;

  if (present === 0) {
    return;
  }

  if (present !== values.length) {
    fail(
      "INCOMPLETE_COST",
      "cost_min_micros, cost_max_micros and cost_currency must all be set, or all be null; an unknown price is null, never 0 and never an assumed currency"
    );
  }
}

/*
 * required_capabilities is stored as a JSON string in a TEXT column.
 * This validates that it really is a JSON array of strings so the
 * repository can round-trip it without a JSON extension.
 */
function requiredCapabilitiesJson(
  value: string | null | undefined
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed);
  } catch {
    fail(
      "INVALID_JSON",
      `required_capabilities must be a JSON array string, got "${trimmed}"`
    );
  }

  if (
    !Array.isArray(parsed) ||
    parsed.some(
      (entry) => typeof entry !== "string"
    )
  ) {
    fail(
      "INVALID_JSON",
      "required_capabilities must be a JSON array of strings"
    );
  }

  return trimmed;
}

function requireProject(id: string) {
  const project = getProject(id);

  if (!project) {
    fail(
      "PROJECT_NOT_FOUND",
      `project "${id}" does not exist`
    );
  }

  return project;
}

function requirePlan(id: string) {
  const plan = getProjectPlan(id);

  if (!plan) {
    fail(
      "PLAN_NOT_FOUND",
      `project plan "${id}" does not exist`
    );
  }

  return plan;
}

function requireProjectTask(id: string): ProjectTaskRow {
  const projectTask = getProjectTask(id);

  if (!projectTask) {
    fail(
      "PROJECT_TASK_NOT_FOUND",
      `project task "${id}" does not exist`
    );
  }

  return projectTask;
}

function requireOption(
  id: string
): ProjectTaskAiOptionRow {
  const option = getProjectTaskAiOption(id);

  if (!option) {
    fail(
      "AI_OPTION_NOT_FOUND",
      `project task ai option "${id}" does not exist`
    );
  }

  return option;
}

function assertTaskExists(
  taskId: string | null | undefined
): string | null {
  if (taskId === null || taskId === undefined) {
    return null;
  }

  const id = requiredText(taskId, "task_id");

  if (!taskExists(id)) {
    fail(
      "TASK_NOT_FOUND",
      `execution task "${id}" does not exist`
    );
  }

  return id;
}

/*
 * The Planner only ever needs to know whether an existing tasks row
 * is there. It reads tasks and nothing else from the Task Session
 * layer, and it never writes to tasks, task_sessions or
 * task_usage_records.
 */
function taskExists(taskId: string): boolean {
  const row = getDb()
    .prepare(
      `SELECT id FROM tasks WHERE id = ?`
    )
    .get(taskId);

  return row !== undefined;
}

function assertModelExists(
  modelId: string
): string {
  const id = requiredText(modelId, "model_id");

  const row = getDb()
    .prepare(
      `SELECT id FROM models WHERE id = ?`
    )
    .get(id);

  if (row === undefined) {
    fail(
      "MODEL_NOT_FOUND",
      `model "${id}" does not exist`
    );
  }

  return id;
}

function assertToolExists(
  toolId: string | null | undefined
): string | null {
  if (toolId === null || toolId === undefined) {
    return null;
  }

  const id = requiredText(toolId, "tool_id");

  const row = getDb()
    .prepare(
      `SELECT id FROM user_ai_tools WHERE id = ?`
    )
    .get(id);

  if (row === undefined) {
    fail(
      "TOOL_NOT_FOUND",
      `user ai tool "${id}" does not exist`
    );
  }

  return id;
}

export function createProject(input: {
  name: string;
  goal?: string | null;
  description?: string | null;
  preference?: ProjectPreference;
  budgetMinMicros?: number | null;
  budgetMaxMicros?: number | null;
  budgetCurrency?: string | null;
  deadlineDays?: number | null;
}): ReturnType<typeof getProject> {
  const name = requiredText(input.name, "project name");

  const preference =
    input.preference === undefined
      ? "balanced"
      : assertOneOf(
          input.preference,
          PROJECT_PREFERENCES,
          "INVALID_PREFERENCE",
          "preference"
        );

  const budgetMin = optionalNonNegative(
    input.budgetMinMicros,
    "budget_min_micros"
  );
  const budgetMax = optionalNonNegative(
    input.budgetMaxMicros,
    "budget_max_micros"
  );
  const budgetCurrency = optionalText(
    input.budgetCurrency,
    "budget_currency"
  );

  assertCostShape(
    budgetMin,
    budgetMax,
    budgetCurrency
  );
  assertRange(
    budgetMin,
    budgetMax,
    "INVALID_BUDGET_RANGE",
    "budget"
  );

  const deadlineDays =
    optionalNonNegative(
      input.deadlineDays,
      "deadline_days"
    );

  const now = new Date().toISOString();
  const id = randomUUID();

  createProjectInDb({
    id,
    name,
    goal: optionalText(input.goal, "goal"),
    description: optionalText(
      input.description,
      "description"
    ),
    preference,
    budgetMinMicros: budgetMin,
    budgetMaxMicros: budgetMax,
    budgetCurrency,
    deadlineDays,
    createdAt: now,
  });

  return getProject(id);
}

export function updateProject(
  id: string,
  input: {
    name?: string;
    goal?: string | null;
    description?: string | null;
    preference?: ProjectPreference;
    budgetMinMicros?: number | null;
    budgetMaxMicros?: number | null;
    budgetCurrency?: string | null;
    deadlineDays?: number | null;
  }
): ReturnType<typeof getProject> {
  requireProject(id);

  const update: Parameters<typeof updateProjectInDb>[1] = {
    updatedAt: new Date().toISOString(),
  };

  if (input.name !== undefined) {
    update.name = requiredText(input.name, "project name");
  }

  if (input.goal !== undefined) {
    update.goal = optionalText(input.goal, "goal");
  }

  if (input.description !== undefined) {
    update.description = optionalText(
      input.description,
      "description"
    );
  }

  if (input.preference !== undefined) {
    update.preference = assertOneOf(
      input.preference,
      PROJECT_PREFERENCES,
      "INVALID_PREFERENCE",
      "preference"
    );
  }

  if (input.deadlineDays !== undefined) {
    update.deadlineDays = optionalNonNegative(
      input.deadlineDays,
      "deadline_days"
    );
  }

  const touchesBudget =
    input.budgetMinMicros !== undefined ||
    input.budgetMaxMicros !== undefined ||
    input.budgetCurrency !== undefined;

  if (touchesBudget) {
    const current = requireProject(id);

    const budgetMin =
      input.budgetMinMicros === undefined
        ? current.budget_min_micros
        : optionalNonNegative(
            input.budgetMinMicros,
            "budget_min_micros"
          );

    const budgetMax =
      input.budgetMaxMicros === undefined
        ? current.budget_max_micros
        : optionalNonNegative(
            input.budgetMaxMicros,
            "budget_max_micros"
          );

    const budgetCurrency =
      input.budgetCurrency === undefined
        ? current.budget_currency
        : optionalText(
            input.budgetCurrency,
            "budget_currency"
          );

    assertCostShape(
      budgetMin,
      budgetMax,
      budgetCurrency
    );
    assertRange(
      budgetMin,
      budgetMax,
      "INVALID_BUDGET_RANGE",
      "budget"
    );

    update.budgetMinMicros = budgetMin;
    update.budgetMaxMicros = budgetMax;
    update.budgetCurrency = budgetCurrency;
  }

  updateProjectInDb(id, update);

  return getProject(id);
}

export function updateProjectStatus(
  id: string,
  status: ProjectStatus
): ReturnType<typeof getProject> {
  const project = requireProject(id);
  const next = assertOneOf(
    status,
    PROJECT_STATUSES,
    "INVALID_PROJECT_STATUS",
    "project status"
  );

  if (
    TERMINAL_PROJECT_STATUSES.includes(
      project.status as ProjectStatus
    )
  ) {
    fail(
      "INVALID_STATUS_TRANSITION",
      `project "${id}" is ${project.status} and cannot change status`
    );
  }

  updateProjectStatusInDb(
    id,
    next,
    new Date().toISOString()
  );

  return getProject(id);
}

/*
 * Creates the next plan version for a project.
 *
 * The version is decided here, never by the caller: it is one more
 * than the highest version the project already has, which is what
 * keeps UNIQUE(project_id, version) satisfied. A caller that passes a
 * version anyway has it ignored.
 *
 * Plans are immutable. There is deliberately no update or delete.
 */
export function createProjectPlan(input: {
  projectId: string;
  strategy: ProjectPreference;
  summary?: string | null;
}): ReturnType<typeof getProjectPlan> {
  requireProject(input.projectId);

  const strategy = assertOneOf(
    input.strategy,
    PROJECT_PREFERENCES,
    "INVALID_STRATEGY",
    "strategy"
  );

  const version = nextProjectPlanVersion(
    input.projectId
  );

  const id = randomUUID();

  createProjectPlanInDb({
    id,
    projectId: input.projectId,
    version,
    strategy,
    summary: optionalText(input.summary, "summary"),
    createdAt: new Date().toISOString(),
  });

  return getProjectPlan(id);
}

/*
 * Creates the next planned step of a plan.
 *
 * The sequence is decided here, never by the caller: it is one more
 * than the highest sequence the plan already has, which is what
 * keeps UNIQUE(plan_id, sequence) satisfied. A caller that passes a
 * sequence anyway has it ignored.
 */
export function createProjectTask(input: {
  planId: string;
  taskId?: string | null;
  name: string;
  category: ProjectTaskCategory;
  complexity: ProjectTaskComplexity;
  description?: string | null;
  requiredCapabilities?: string | null;
  estimatedInputTokensMin?: number | null;
  estimatedInputTokensMax?: number | null;
  estimatedOutputTokensMin?: number | null;
  estimatedOutputTokensMax?: number | null;
}): ReturnType<typeof getProjectTask> {
  requirePlan(input.planId);

  const name = requiredText(input.name, "project task name");

  const inputMin = optionalNonNegative(
    input.estimatedInputTokensMin,
    "estimated_input_tokens_min"
  );
  const inputMax = optionalNonNegative(
    input.estimatedInputTokensMax,
    "estimated_input_tokens_max"
  );
  const outputMin = optionalNonNegative(
    input.estimatedOutputTokensMin,
    "estimated_output_tokens_min"
  );
  const outputMax = optionalNonNegative(
    input.estimatedOutputTokensMax,
    "estimated_output_tokens_max"
  );

  assertRange(
    inputMin,
    inputMax,
    "INVALID_TOKEN_RANGE",
    "estimated input tokens"
  );
  assertRange(
    outputMin,
    outputMax,
    "INVALID_TOKEN_RANGE",
    "estimated output tokens"
  );

  const id = randomUUID();

  const sequence = nextProjectTaskSequence(
    input.planId
  );

  createProjectTaskInDb({
    id,
    planId: input.planId,
    taskId: assertTaskExists(input.taskId),
    sequence,
    name,
    category: assertOneOf(
      input.category,
      PROJECT_TASK_CATEGORIES,
      "INVALID_CATEGORY",
      "category"
    ),
    complexity: assertOneOf(
      input.complexity,
      PROJECT_TASK_COMPLEXITIES,
      "INVALID_COMPLEXITY",
      "complexity"
    ),
    description: optionalText(
      input.description,
      "description"
    ),
    requiredCapabilities:
      requiredCapabilitiesJson(
        input.requiredCapabilities
      ),
    estimatedInputTokensMin: inputMin,
    estimatedInputTokensMax: inputMax,
    estimatedOutputTokensMin: outputMin,
    estimatedOutputTokensMax: outputMax,
    createdAt: new Date().toISOString(),
  });

  return getProjectTask(id);
}

export function updateProjectTask(
  id: string,
  input: {
    name?: string;
    category?: ProjectTaskCategory;
    complexity?: ProjectTaskComplexity;
    description?: string | null;
    requiredCapabilities?: string | null;
    estimatedInputTokensMin?: number | null;
    estimatedInputTokensMax?: number | null;
    estimatedOutputTokensMin?: number | null;
    estimatedOutputTokensMax?: number | null;
  }
): ReturnType<typeof getProjectTask> {
  requireProjectTask(id);

  const update: Parameters<typeof updateProjectTaskInDb>[1] = {
    updatedAt: new Date().toISOString(),
  };

  if (input.name !== undefined) {
    update.name = requiredText(input.name, "project task name");
  }

  if (input.category !== undefined) {
    update.category = assertOneOf(
      input.category,
      PROJECT_TASK_CATEGORIES,
      "INVALID_CATEGORY",
      "category"
    );
  }

  if (input.complexity !== undefined) {
    update.complexity = assertOneOf(
      input.complexity,
      PROJECT_TASK_COMPLEXITIES,
      "INVALID_COMPLEXITY",
      "complexity"
    );
  }

  if (input.description !== undefined) {
    update.description = optionalText(
      input.description,
      "description"
    );
  }

  if (input.requiredCapabilities !== undefined) {
    update.requiredCapabilities =
      requiredCapabilitiesJson(
        input.requiredCapabilities
      );
  }

  const tokenFields = [
    [
      "estimatedInputTokensMin",
      "estimated_input_tokens_min",
    ],
    [
      "estimatedInputTokensMax",
      "estimated_input_tokens_max",
    ],
    [
      "estimatedOutputTokensMin",
      "estimated_output_tokens_min",
    ],
    [
      "estimatedOutputTokensMax",
      "estimated_output_tokens_max",
    ],
  ] as const;

  let touchesTokens = false;

  for (const [field, label] of tokenFields) {
    if (input[field] === undefined) {
      continue;
    }

    touchesTokens = true;
    update[field] = optionalNonNegative(
      input[field],
      label
    );
  }

  if (touchesTokens) {
    const current = requireProjectTask(id);

    const resolve = (
      field:
        | "estimatedInputTokensMin"
        | "estimatedInputTokensMax"
        | "estimatedOutputTokensMin"
        | "estimatedOutputTokensMax",
      column:
        | "estimated_input_tokens_min"
        | "estimated_input_tokens_max"
        | "estimated_output_tokens_min"
        | "estimated_output_tokens_max"
    ): number | null =>
      update[field] === undefined
        ? (current[column] as number | null)
        : (update[field] as number | null);

    assertRange(
      resolve(
        "estimatedInputTokensMin",
        "estimated_input_tokens_min"
      ),
      resolve(
        "estimatedInputTokensMax",
        "estimated_input_tokens_max"
      ),
      "INVALID_TOKEN_RANGE",
      "estimated input tokens"
    );
    assertRange(
      resolve(
        "estimatedOutputTokensMin",
        "estimated_output_tokens_min"
      ),
      resolve(
        "estimatedOutputTokensMax",
        "estimated_output_tokens_max"
      ),
      "INVALID_TOKEN_RANGE",
      "estimated output tokens"
    );
  }

  updateProjectTaskInDb(id, update);

  return getProjectTask(id);
}

export function updateProjectTaskStatus(
  id: string,
  status: ProjectTaskStatus
): ReturnType<typeof getProjectTask> {
  const projectTask = requireProjectTask(id);
  const next = assertOneOf(
    status,
    PROJECT_TASK_STATUSES,
    "INVALID_PROJECT_TASK_STATUS",
    "project task status"
    );

  if (
    TERMINAL_PROJECT_TASK_STATUSES.includes(
      projectTask.status as ProjectTaskStatus
    )
  ) {
    fail(
      "INVALID_STATUS_TRANSITION",
      `project task "${id}" is ${projectTask.status} and cannot change status`
    );
  }

  updateProjectTaskStatusInDb(
    id,
    next,
    new Date().toISOString()
  );

  return getProjectTask(id);
}

/*
 * The whole Planner / Task Session connection.
 *
 * Links or unlinks a planned step to an existing execution task. It
 * creates no session, reads no session and writes nothing outside
 * project_tasks.
 */
export function linkProjectTaskToExecutionTask(
  id: string,
  taskId: string | null
): ReturnType<typeof getProjectTask> {
  requireProjectTask(id);

  return linkInDb(
    id,
    assertTaskExists(taskId),
    new Date().toISOString()
  );
}

/*
 * Validates one candidate's measurements and returns them in storage
 * shape.
 *
 * Shared by the manual create path and the R2 3.3-C2 generation path
 * so both inherit the same guarantees: a cost is either fully known
 * or fully null, a range never inverts, an empty string is never
 * stored, and a model or tool that does not exist is refused rather
 * than written.
 */
function normalizeAiOptionFields(input: {
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
}): {
  modelId: string;
  toolId: string | null;
  isSelected: 0 | 1;
  costMinMicros: number | null;
  costMaxMicros: number | null;
  costCurrency: string | null;
  timeMinMinutes: number | null;
  timeMaxMinutes: number | null;
  fitStatus: FitStatus;
  excludedReason: string | null;
  pricingBasis: string | null;
  rationale: string | null;
} {
  const costMin = optionalNonNegative(
    input.costMinMicros,
    "cost_min_micros"
  );
  const costMax = optionalNonNegative(
    input.costMaxMicros,
    "cost_max_micros"
  );
  const costCurrency = optionalText(
    input.costCurrency,
    "cost_currency"
  );

  assertCostShape(
    costMin,
    costMax,
    costCurrency
  );
  assertRange(
    costMin,
    costMax,
    "INVALID_COST_RANGE",
    "cost"
  );

  const timeMin = optionalNonNegative(
    input.timeMinMinutes,
    "time_min_minutes"
  );
  const timeMax = optionalNonNegative(
    input.timeMaxMinutes,
    "time_max_minutes"
  );

  assertRange(
    timeMin,
    timeMax,
    "INVALID_TIME_RANGE",
    "time"
  );

  return {
    modelId: assertModelExists(input.modelId),
    toolId: assertToolExists(input.toolId),
    isSelected: input.isSelected ?? 0,
    costMinMicros: costMin,
    costMaxMicros: costMax,
    costCurrency,
    timeMinMinutes: timeMin,
    timeMaxMinutes: timeMax,
    fitStatus:
      input.fitStatus === undefined
        ? "unknown"
        : assertOneOf(
            input.fitStatus,
            FIT_STATUSES,
            "INVALID_FIT_STATUS",
            "fit_status"
          ),
    excludedReason: optionalText(
      input.excludedReason,
      "excluded_reason"
    ),
    pricingBasis: optionalText(
      input.pricingBasis,
      "pricing_basis"
    ),
    rationale: optionalText(
      input.rationale,
      "rationale"
    ),
  };
}

/*
 * Records one candidate way of running a planned step.
 *
 * There is no isSelected input here on purpose. A new option always
 * starts unselected, and the only way to select one is
 * selectProjectTaskAiOption, which is an explicit user decision. A
 * caller that passes isSelected anyway has it ignored.
 */
export function createProjectTaskAiOption(input: {
  projectTaskId: string;
  modelId: string;
  toolId?: string | null;
  costMinMicros?: number | null;
  costMaxMicros?: number | null;
  costCurrency?: string | null;
  timeMinMinutes?: number | null;
  timeMaxMinutes?: number | null;
  fitStatus?: FitStatus;
  excludedReason?: string | null;
  pricingBasis?: string | null;
  rationale?: string | null;
}): ProjectTaskAiOptionRow {
  requireProjectTask(input.projectTaskId);

  const fields = normalizeAiOptionFields(input);
  const id = randomUUID();

  createProjectTaskAiOptionInDb({
    id,
    projectTaskId: input.projectTaskId,
    createdAt: new Date().toISOString(),
    ...fields,
  });

  return requireOption(id);
}

/*
 * R2 Phase 3.3-C2: records the candidate set for one planned step.
 *
 * This is a persistence step, not an estimation step. Every number
 * written here is produced upstream by the R2 3.3-C1 candidate
 * generator and its estimators, and this function re-derives nothing:
 * no cost, no duration, no capability judgement, no ordering. If the
 * generator is wrong, the fix belongs there, not here.
 *
 * The plan is read, not the caller's word. strategy and created_at
 * come from project_plans, and the models come from the AI Registry,
 * so a caller cannot pass in a different strategy, a different
 * pricing instant or a hand-picked model list.
 *
 * plan.created_at is the frozen pricing basis for every candidate in
 * this batch. The current time is never used to price anything, which
 * is why re-running generation later against an unchanged plan
 * reproduces the same figures rather than today's card.
 *
 * The write is a replace, not an append, and it is atomic. See
 * replaceProjectTaskAiOptions.
 *
 * What this deliberately does not do:
 *
 * - It selects nothing. Every row is written with is_selected = 0,
 *   including a candidate the strategy marked as representative. A
 *   strategy representative is a presentation hint about where the
 *   cost and time trade-offs sit; a selection is a decision the user
 *   makes through the select endpoint. Conflating them would let the
 *   Planner pick for the user, which is exactly what this feature is
 *   built not to do.
 * - It does not restore a previous selection. Regenerating a step
 *   leaves it unselected.
 * - It does not write excluded_reason, because nothing in Phase 3.3
 *   produces one.
 * - It never touches usage_records, cost_records, task_sessions or
 *   task_usage_records. A planned estimate is not a measurement.
 */
export function generateProjectTaskAiOptions(
  projectTaskId: string
): ProjectTaskAiOptionRow[] {
  const projectTask = requireProjectTask(projectTaskId);
  const plan = requirePlan(projectTask.plan_id);

  const strategy = assertOneOf(
    plan.strategy,
    PROJECT_PREFERENCES,
    "INVALID_STRATEGY",
    "strategy"
  );

  /*
   * The registry is the only source of candidate models. A model that
   * is registered but unpriced still becomes a candidate, with a null
   * cost, because "we do not know the price" is a fact worth showing
   * and not a reason to hide the model.
   */
  const models = listAiRegistry().flatMap(
    (provider) => provider.models
  );

  /*
   * R3.4-C1: the same pricing basis the combination plans apply
   * (R3.4-B3) must hold at this entry point too. A model the user owns
   * as an active registered resource is priced through that resource's
   * own recorded basis via registered-pricing.resolveRegisteredPricing
   * - the single authority shared with combination-service. A model
   * with no active registered resource keeps the plain registry
   * behaviour. Only active resources count; an archived resource
   * changes nothing.
   *
   * Candidate rows are per model, while a model may be owned by
   * several active resources. The first active resource for a model
   * (listAiResources order: created_at, then id) decides, so the whole
   * generation is deterministic.
   */
  const registeredByModelId = new Map<
    string,
    AiResourceRow
  >();

  for (const resource of listAiResources({
    status: "active",
  })) {
    if (!registeredByModelId.has(resource.model_id)) {
      registeredByModelId.set(
        resource.model_id,
        resource
      );
    }
  }

  const generated = generatePlannerCandidates({
    task: {
      category: projectTask.category,
      complexity: projectTask.complexity,
      required_capabilities:
        projectTask.required_capabilities,
      estimated_input_tokens_min:
        projectTask.estimated_input_tokens_min,
      estimated_input_tokens_max:
        projectTask.estimated_input_tokens_max,
      estimated_output_tokens_min:
        projectTask.estimated_output_tokens_min,
      estimated_output_tokens_max:
        projectTask.estimated_output_tokens_max,
    },
    planCreatedAt: plan.created_at,
    strategy,
    models,
    /*
     * Injected rather than reimplemented. The repository's resolver
     * is the single authority on which rate applies at an instant; a
     * registered resource routes through its own B3 basis first. This
     * function must never re-derive either one.
     */
    pricingResolver: (modelId, at) => {
      const registered = registeredByModelId.get(
        modelId
      );

      return registered === undefined
        ? resolveRegistryPricing(modelId, at)
        : resolveRegisteredPricing(registered, at);
    },
  });

  const createdAt = new Date().toISOString();

  const options = generated.candidates.map(
    (candidate) => ({
      id: randomUUID(),
      projectTaskId,
      createdAt,
      ...normalizeAiOptionFields({
        modelId: candidate.modelId,
        toolId: candidate.toolId,
        /*
         * Always unselected. Not the representative, not the fit
         * status, not the strategy. Only the user selects.
         */
        isSelected: 0,
        costMinMicros: candidate.costMinMicros,
        costMaxMicros: candidate.costMaxMicros,
        costCurrency: candidate.costCurrency,
        timeMinMinutes: candidate.timeMinMinutes,
        timeMaxMinutes: candidate.timeMaxMinutes,
        fitStatus: candidate.fitStatus,
        excludedReason: null,
        pricingBasis: candidate.pricingBasis,
        rationale: candidate.rationale,
      }),
    })
  );

  replaceProjectTaskAiOptions(
    projectTaskId,
    options
  );

  /*
   * Read back in the table's own order
   * (created_at, then id). That order is a storage detail and does
   * not reproduce the generator's strategy order, because every row
   * in a batch shares one timestamp and the tie-break is the option
   * id. Callers must treat the result as an unordered set.
   */
  return listProjectTaskAiOptions(projectTaskId);
}

/*
 * Records the user's explicit choice for one option of one planned
 * step and clears the flag on the others.
 *
 * It does not compare cost, time or fit_status, and it does not
 * choose anything: by the time this is called the decision already
 * exists.
 */
export function selectProjectTaskAiOption(
  id: string
): ProjectTaskAiOptionRow {
  requireOption(id);

  selectInDb(id, new Date().toISOString());

  return requireOption(id);
}
