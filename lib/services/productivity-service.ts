import { getTaskVerifiedCost } from "@/lib/services/task-service";
import type { TaskVerifiedCost } from "@/lib/services/task-service";
import {
  getProjectPlan,
  getProjectTask,
  listPlanResourceAssignments,
  listProjectTaskAiOptions,
  listProjectTasks,
} from "@/lib/repositories/planner-repository";
import {
  countUnattributedUsageRecords,
  getTaskUsageBundles,
  listTaskHistory,
} from "@/lib/repositories/task-repository";
import type {
  TaskSessionHistoryRow,
  TaskUsageBundle,
} from "@/lib/repositories/task-repository";

/*
 * R3.5-A: read-only AI Productivity report for one plan.
 *
 * This service orchestrates existing reads from both sides of the
 * planner/execution boundary and computes nothing but facts:
 * planned estimates, actual usage, coverage and range deltas.
 *
 * Rules this module obeys by construction:
 *   - It never writes. Every call below is a SELECT (or a count).
 *   - It never scores, ranks, recommends or selects anything. The
 *     output types carry no score-like field, and a user-selected
 *     option is read as the fact of that selection, never re-decided.
 *   - Verified cost is delegated to getTaskVerifiedCost unchanged:
 *     null means unavailable (unreliable attribution, missing cost
 *     records, mixed currencies) and stays null here. This module
 *     contains no copy of the verification rule.
 *   - Planned costs are USD/declared-currency estimates and actual
 *     verified cost carries its own currency. The two are never
 *     subtracted across currencies; cost deltas fall back to a range
 *     check and only after the currencies match.
 */

export class ProductivityServiceError extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string
  ) {
    super(message);
    this.code = code;
  }
}

export type RangeCheckResult =
  | "within"
  | "below"
  | "above"
  | "unknown";

export type TokenRange = {
  min: number | null;
  max: number | null;
};

export type PlannedAssignment = {
  plannedCostMicros: TokenRange;
  plannedCostCurrency: string | null;
  plannedTimeMinutes: TokenRange;
  role: string;
  roleSource: string;
  fitStatus: string;
  costBasis: string | null;
  resource: {
    resourceSource: string;
    aiResourceId: string | null;
    registryModelId: string | null;
  };
};

export type PlannedSelectedOption = {
  id: string;
  estimatedCostMicros: TokenRange;
  estimatedCostCurrency: string | null;
  estimatedTimeMinutes: TokenRange;
  fitStatus: string;
  modelId: string | null;
  declaredResourceId: string | null;
};

export type PlannedSide = {
  estimatedInputTokens: TokenRange;
  estimatedOutputTokens: TokenRange;
  assignment: PlannedAssignment | null;
  selectedOption: PlannedSelectedOption | null;
};

export type SessionMetrics = {
  count: number;
  completed: number;
  abandoned: number;
  active: number;
  totalMs: number;
  activeSessionMs: number | null;
};

export type TokenMetrics = {
  input: number;
  output: number;
  cached: number;
  reasoning: number;
};

export type ModelMixEntry = {
  provider: string;
  model: string;
  records: number;
  inputTokens: number;
  outputTokens: number;
};

export type AttributionCounts = {
  auto: number;
  manual: number;
  other: number;
  total: number;
};

export type ActualSide = {
  sessions: SessionMetrics;
  tokens: TokenMetrics;
  modelMix: ModelMixEntry[];
  attribution: AttributionCounts;
  verifiedCost: TaskVerifiedCost;
};

export type ProductivityCoverage = {
  linked: boolean;
  hasSessions: boolean;
  verifiedCostAvailable: boolean;
};

export type TaskDeltas = {
  inputTokens: RangeCheckResult;
  outputTokens: RangeCheckResult;
  sessionMinutesVsPlan: RangeCheckResult;
  cost: {
    currencyMatches: boolean;
    rangeCheck: RangeCheckResult;
  };
};

export type TaskProductivityRow = {
  projectTaskId: string;
  taskPlanId: string;
  sequence: number;
  stageId: string | null;
  name: string;
  executionTaskId: string | null;
  coverage: ProductivityCoverage;
  planned: PlannedSide;
  actual: ActualSide | null;
  deltas: TaskDeltas;
};

export type PlanProductivityReport = {
  plan: {
    id: string;
    projectId: string;
    version: number;
    strategy: string;
  };
  tasks: TaskProductivityRow[];
  summary: {
    taskCount: number;
    linkedCount: number;
    withSessionsCount: number;
    verifiedCostCount: number;
    totalTokens: TokenMetrics | null;
  };
  context: {
    unattributedUsageRecords: number;
  };
};

/*
 * An absent bound is an open range, not a zero: a task with only a
 * minimum estimate can never come out "above", and a task with no
 * estimate at all is "unknown". Value and bounds are raw numbers;
 * this function judges nothing beyond containment.
 */
export function rangeCheck(
  value: number | null,
  min: number | null,
  max: number | null
): RangeCheckResult {
  if (value === null) {
    return "unknown";
  }

  if (min === null && max === null) {
    return "unknown";
  }

  if (min !== null && value < min) {
    return "below";
  }

  if (max !== null && value > max) {
    return "above";
  }

  return "within";
}

function sessionMetricsForTask(
  history: TaskSessionHistoryRow[],
  executionTaskId: string,
  nowMs: number
): SessionMetrics {
  const metrics: SessionMetrics = {
    count: 0,
    completed: 0,
    abandoned: 0,
    active: 0,
    totalMs: 0,
    activeSessionMs: null,
  };

  for (const row of history) {
    if (row.task_id !== executionTaskId) {
      continue;
    }

    if (row.session_id === null) {
      continue;
    }

    metrics.count += 1;

    const startedMs = Date.parse(row.session_started_at ?? "");
    const endedMs =
      row.session_ended_at === null
        ? null
        : Date.parse(row.session_ended_at);

    const endForDuration =
      endedMs !== null && !Number.isNaN(endedMs)
        ? endedMs
        : nowMs;

    if (
      startedMs !== null &&
      !Number.isNaN(startedMs) &&
      endForDuration >= startedMs
    ) {
      metrics.totalMs += endForDuration - startedMs;
    }

    if (row.session_status === "completed") {
      metrics.completed += 1;
    } else if (row.session_status === "abandoned") {
      metrics.abandoned += 1;
    } else if (row.session_status === "active") {
      metrics.active += 1;

      if (
        startedMs !== null &&
        !Number.isNaN(startedMs) &&
        nowMs >= startedMs
      ) {
        metrics.activeSessionMs = nowMs - startedMs;
      }
    }
  }

  return metrics;
}

function tokenMetricsFromBundles(
  bundles: TaskUsageBundle[]
): TokenMetrics {
  const tokens: TokenMetrics = {
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
  };

  for (const bundle of bundles) {
    tokens.input += Number(bundle.input_tokens);
    tokens.output += Number(bundle.output_tokens);
    tokens.cached += Number(bundle.cached_tokens);
    tokens.reasoning += Number(bundle.reasoning_tokens);
  }

  return tokens;
}

function modelMixFromBundles(
  bundles: TaskUsageBundle[]
): ModelMixEntry[] {
  const byModel = new Map<
    string,
    ModelMixEntry
  >();

  for (const bundle of bundles) {
    const key = `${bundle.provider}\u0000${bundle.model}`;
    const existing = byModel.get(key);

    if (existing) {
      existing.records += 1;
      existing.inputTokens += Number(
        bundle.input_tokens
      );
      existing.outputTokens += Number(
        bundle.output_tokens
      );
      continue;
    }

    byModel.set(key, {
      provider: bundle.provider,
      model: bundle.model,
      records: 1,
      inputTokens: Number(bundle.input_tokens),
      outputTokens: Number(bundle.output_tokens),
    });
  }

  return [...byModel.values()];
}

function attributionFromBundles(
  bundles: TaskUsageBundle[]
): AttributionCounts {
  const counts: AttributionCounts = {
    auto: 0,
    manual: 0,
    other: 0,
    total: bundles.length,
  };

  for (const bundle of bundles) {
    if (bundle.attribution_status === "auto") {
      counts.auto += 1;
    } else if (
      bundle.attribution_status === "manual"
    ) {
      counts.manual += 1;
    } else {
      counts.other += 1;
    }
  }

  return counts;
}

/*
 * Which planned range a delta is measured against, in one
 * deterministic order: the persisted combination assignment is the
 * plan-level commitment, the user-selected option is the per-step
 * decision, and a task with neither has no planned bound to compare
 * against.
 */
function plannedCostRange(
  assignment: PlannedAssignment | null,
  selectedOption: PlannedSelectedOption | null
): {
  min: number | null;
  max: number | null;
  currency: string | null;
} {
  if (assignment !== null) {
    return {
      min: assignment.plannedCostMicros.min,
      max: assignment.plannedCostMicros.max,
      currency: assignment.plannedCostCurrency,
    };
  }

  if (selectedOption !== null) {
    return {
      min: selectedOption.estimatedCostMicros.min,
      max: selectedOption.estimatedCostMicros.max,
      currency: selectedOption.estimatedCostCurrency,
    };
  }

  return { min: null, max: null, currency: null };
}

function plannedTimeRange(
  assignment: PlannedAssignment | null,
  selectedOption: PlannedSelectedOption | null
): TokenRange {
  if (assignment !== null) {
    return assignment.plannedTimeMinutes;
  }

  if (selectedOption !== null) {
    return selectedOption.estimatedTimeMinutes;
  }

  return { min: null, max: null };
}

function mapAssignment(
  row: ReturnType<
    typeof listPlanResourceAssignments
  >[number]
): PlannedAssignment {
  return {
    plannedCostMicros: {
      min: row.planned_cost_min_micros,
      max: row.planned_cost_max_micros,
    },
    plannedCostCurrency: row.planned_cost_currency,
    plannedTimeMinutes: {
      min: row.planned_time_min_minutes,
      max: row.planned_time_max_minutes,
    },
    role: row.role,
    roleSource: row.role_source,
    fitStatus: row.fit_status,
    costBasis: row.cost_basis,
    resource: {
      resourceSource: row.resource_source,
      aiResourceId: row.ai_resource_id,
      registryModelId: row.registry_model_id,
    },
  };
}

function mapSelectedOption(
  row: ReturnType<
    typeof listProjectTaskAiOptions
  >[number]
): PlannedSelectedOption {
  return {
    id: row.id,
    estimatedCostMicros: {
      min: row.cost_min_micros,
      max: row.cost_max_micros,
    },
    estimatedCostCurrency: row.cost_currency,
    estimatedTimeMinutes: {
      min: row.time_min_minutes,
      max: row.time_max_minutes,
    },
    fitStatus: row.fit_status,
    modelId: row.model_id,
    declaredResourceId: row.declared_resource_id,
  };
}

/*
 * The report covers a plan's own steps (listProjectTasks). A
 * combination plan owns no project_tasks rows - it persists
 * assignments that reference the source plan's steps - so for such a
 * plan the assignment-referenced steps are pulled in through
 * getProjectTask instead. The two shapes are mutually exclusive in
 * practice; the union keeps one row type for both.
 */
function loadReportTasks(planId: string) {
  const ownTasks = listProjectTasks(planId);
  const assignments = listPlanResourceAssignments(planId);

  const tasksById = new Map(
    ownTasks.map((task) => [task.id, task])
  );

  for (const assignment of assignments) {
    if (
      tasksById.has(assignment.project_task_id)
    ) {
      continue;
    }

    const referenced = getProjectTask(
      assignment.project_task_id
    );

    if (referenced) {
      tasksById.set(referenced.id, referenced);
    }
  }

  const rows = [...tasksById.values()].sort(
    (a, b) =>
      a.sequence - b.sequence ||
      a.id.localeCompare(b.id)
  );

  return { rows, assignments };
}

export function getPlanProductivity(
  planId: string
): PlanProductivityReport {
  const plan = getProjectPlan(planId);

  if (!plan) {
    throw new ProductivityServiceError(
      "PLAN_NOT_FOUND",
      `plan "${planId}" does not exist`
    );
  }

  const { rows, assignments } =
    loadReportTasks(planId);

  const assignmentsByTask = new Map(
    assignments.map((assignment) => [
      assignment.project_task_id,
      assignment,
    ])
  );

  const linkedExecutionIds = new Set(
    rows
      .map((task) => task.task_id)
      .filter(
        (taskId): taskId is string =>
          taskId !== null
      )
  );

  const nowMs = Date.now();
  const history =
    linkedExecutionIds.size > 0
      ? listTaskHistory()
      : [];

  /*
   * Per-task execution reads are only issued for linked steps, and
   * the verified-cost call is task-service's own: this module never
   * re-derives it from the bundles it loads for tokens and mix.
   */
  const bundlesByTask = new Map<
    string,
    TaskUsageBundle[]
  >();
  const verifiedCostByTask = new Map<
    string,
    TaskVerifiedCost
  >();

  for (const executionTaskId of linkedExecutionIds) {
    bundlesByTask.set(
      executionTaskId,
      getTaskUsageBundles(executionTaskId)
    );
    verifiedCostByTask.set(
      executionTaskId,
      getTaskVerifiedCost(executionTaskId)
    );
  }

  const taskRows: TaskProductivityRow[] = [];

  for (const task of rows) {
    const assignmentRow = assignmentsByTask.get(
      task.id
    );
    const assignment =
      assignmentRow === undefined
        ? null
        : mapAssignment(assignmentRow);

    const optionRows =
      listProjectTaskAiOptions(task.id);
    const selectedRow = optionRows.find(
      (option) => option.is_selected === 1
    );
    const selectedOption =
      selectedRow === undefined
        ? null
        : mapSelectedOption(selectedRow);

    const planned: PlannedSide = {
      estimatedInputTokens: {
        min: task.estimated_input_tokens_min,
        max: task.estimated_input_tokens_max,
      },
      estimatedOutputTokens: {
        min: task.estimated_output_tokens_min,
        max: task.estimated_output_tokens_max,
      },
      assignment,
      selectedOption,
    };

    const linked = task.task_id !== null;
    const executionTaskId = task.task_id;

    let actual: ActualSide | null = null;
    let sessions: SessionMetrics = {
      count: 0,
      completed: 0,
      abandoned: 0,
      active: 0,
      totalMs: 0,
      activeSessionMs: null,
    };

    if (
      linked &&
      executionTaskId !== null
    ) {
      const bundles =
        bundlesByTask.get(executionTaskId) ?? [];
      sessions = sessionMetricsForTask(
        history,
        executionTaskId,
        nowMs
      );

      actual = {
        sessions,
        tokens: tokenMetricsFromBundles(bundles),
        modelMix: modelMixFromBundles(bundles),
        attribution: attributionFromBundles(
          bundles
        ),
        verifiedCost:
          verifiedCostByTask.get(
            executionTaskId
          ) ?? null,
      };
    }

    const verifiedCost = actual?.verifiedCost ?? null;
    const costRange = plannedCostRange(
      assignment,
      selectedOption
    );
    const timeRange = plannedTimeRange(
      assignment,
      selectedOption
    );

    const costRangeCheck: RangeCheckResult =
      verifiedCost !== null &&
      costRange.currency !== null &&
      verifiedCost.currency ===
        costRange.currency
        ? rangeCheck(
            verifiedCost.amountMicros,
            costRange.min,
            costRange.max
          )
        : "unknown";

    const deltas: TaskDeltas = {
      inputTokens: rangeCheck(
        actual === null
          ? null
          : actual.tokens.input,
        planned.estimatedInputTokens.min,
        planned.estimatedInputTokens.max
      ),
      outputTokens: rangeCheck(
        actual === null
          ? null
          : actual.tokens.output,
        planned.estimatedOutputTokens.min,
        planned.estimatedOutputTokens.max
      ),
      sessionMinutesVsPlan:
        actual === null || sessions.count === 0
          ? "unknown"
          : rangeCheck(
              sessions.totalMs / 60000,
              timeRange.min,
              timeRange.max
            ),
      cost: {
        currencyMatches:
          verifiedCost !== null &&
          costRange.currency !== null &&
          verifiedCost.currency ===
            costRange.currency,
        rangeCheck: costRangeCheck,
      },
    };

    taskRows.push({
      projectTaskId: task.id,
      taskPlanId: task.plan_id,
      sequence: task.sequence,
      stageId: task.stage_id,
      name: task.name,
      executionTaskId,
      coverage: {
        linked,
        hasSessions:
          actual !== null && sessions.count > 0,
        verifiedCostAvailable:
          verifiedCost !== null,
      },
      planned,
      actual,
      deltas,
    });
  }

  let linkedCount = 0;
  let withSessionsCount = 0;
  let verifiedCostCount = 0;
  let totalTokens: TokenMetrics | null = null;

  for (const row of taskRows) {
    if (!row.coverage.linked) {
      continue;
    }

    linkedCount += 1;

    if (row.coverage.hasSessions) {
      withSessionsCount += 1;
    }

    if (row.coverage.verifiedCostAvailable) {
      verifiedCostCount += 1;
    }

    if (row.actual !== null) {
      totalTokens ??= {
        input: 0,
        output: 0,
        cached: 0,
        reasoning: 0,
      };
      totalTokens.input += row.actual.tokens.input;
      totalTokens.output +=
        row.actual.tokens.output;
      totalTokens.cached +=
        row.actual.tokens.cached;
      totalTokens.reasoning +=
        row.actual.tokens.reasoning;
    }
  }

  return {
    plan: {
      id: plan.id,
      projectId: plan.project_id,
      version: plan.version,
      strategy: plan.strategy,
    },
    tasks: taskRows,
    summary: {
      taskCount: taskRows.length,
      linkedCount,
      withSessionsCount,
      verifiedCostCount,
      totalTokens,
    },
    context: {
      unattributedUsageRecords:
        countUnattributedUsageRecords(),
    },
  };
}
