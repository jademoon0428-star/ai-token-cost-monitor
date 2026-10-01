import { randomUUID } from "node:crypto";

import { isOfficialVerifiedRecord } from "@/lib/cost-policy";
import {
  associateUsageRecord as associateUsageRecordInDb,
  createTask as createTaskInDb,
  createTaskSession,
  endTaskSession as endTaskSessionInDb,
  findTaskSessionIdByUsageRecord,
  getActiveSession,
  getSession,
  getTask,
  getTaskUsageBundles,
} from "@/lib/repositories/task-repository";
import type {
  TaskRow,
  TaskSessionRow,
  TaskUsageBundle,
} from "@/lib/repositories/task-repository";

export type TaskStatus = "open" | "closed";

export type TaskSessionStatus =
  | "active"
  | "completed"
  | "abandoned";

export type AttributionStatus =
  | "manual"
  | "auto"
  | "unattributable";

/*
 * Task cost is never persisted. When every usage record attached to
 * the task carries a reliable, single-currency official cost, the
 * verified total is returned. Every other state (missing cost,
 * unreliable attribution, mixed currencies) is unavailable and is
 * reported as null so upstream consumers can display "unavailable"
 * instead of an estimate.
 */
export type TaskVerifiedCost = {
  amountMicros: number;
  currency: string;
} | null;

export class TaskServiceError extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string
  ) {
    super(message);
    this.code = code;
  }
}

function requireTask(taskId: string): TaskRow {
  const task = getTask(taskId);

  if (!task) {
    throw new TaskServiceError(
      "TASK_NOT_FOUND",
      `task "${taskId}" does not exist`
    );
  }

  return task;
}

function requireSession(
  sessionId: string
): TaskSessionRow {
  const session = getSession(sessionId);

  if (!session) {
    throw new TaskServiceError(
      "SESSION_NOT_FOUND",
      `task session "${sessionId}" does not exist`
    );
  }

  return session;
}

function isSqliteConstraint(
  error: unknown,
  pattern: RegExp
): boolean {
  return (
    error instanceof Error &&
    pattern.test(error.message)
  );
}

export function createTask(input: {
  name: string;
  id?: string;
  status?: TaskStatus;
}): TaskRow {
  const name = input.name.trim();

  if (!name) {
    throw new TaskServiceError(
      "INVALID_TASK_NAME",
      "task name is required"
    );
  }

  const now = new Date().toISOString();
  const id = input.id ?? randomUUID();

  createTaskInDb({
    id,
    name,
    status: input.status ?? "open",
    createdAt: now,
    updatedAt: now,
  });

  return requireTask(id);
}

/*
 * Starts a new active session for the task.
 *
 * Global invariant: only one task session may be active at a time.
 * The partial unique index on task_sessions(status) WHERE status =
 * 'active' enforces this in the database; the pre-check here turns
 * that into a proper service error.
 */
export function startTaskSession(input: {
  taskId: string;
  sessionId?: string;
}): TaskSessionRow {
  requireTask(input.taskId);

  const active = getActiveSession();

  if (active) {
    throw new TaskServiceError(
      "ACTIVE_SESSION_EXISTS",
      `task session "${active.id}" is already active`
    );
  }

  const now = new Date().toISOString();
  const sessionId = input.sessionId ?? randomUUID();

  try {
    createTaskSession({
      id: sessionId,
      taskId: input.taskId,
      startedAt: now,
      status: "active",
    });
  } catch (error) {
    if (
      isSqliteConstraint(
        error,
        /UNIQUE constraint failed: task_sessions\.status/i
      )
    ) {
      throw new TaskServiceError(
        "ACTIVE_SESSION_EXISTS",
        "another task session is already active"
      );
    }

    throw error;
  }

  return requireSession(sessionId);
}

function endActiveSession(
  sessionId: string,
  status: "completed" | "abandoned"
): TaskSessionRow {
  const session = requireSession(sessionId);

  if (session.status !== "active") {
    throw new TaskServiceError(
      "SESSION_NOT_ACTIVE",
      `task session "${sessionId}" is ${session.status}, not active`
    );
  }

  endTaskSessionInDb(sessionId, {
    endedAt: new Date().toISOString(),
    status,
  });

  return requireSession(sessionId);
}

export function completeTaskSession(input: {
  sessionId: string;
}): TaskSessionRow {
  return endActiveSession(
    input.sessionId,
    "completed"
  );
}

export function abandonTaskSession(input: {
  sessionId: string;
}): TaskSessionRow {
  return endActiveSession(
    input.sessionId,
    "abandoned"
  );
}

export function associateUsageRecord(input: {
  taskId: string;
  usageRecordId: string;
  sessionId?: string;
  attributionStatus?: AttributionStatus;
  associationId?: string;
}): { inserted: boolean } {
  const sessionId =
    input.sessionId ?? activeSessionIdForTask(input.taskId);

  const session = requireSession(sessionId);

  if (session.task_id !== input.taskId) {
    throw new TaskServiceError(
      "SESSION_TASK_MISMATCH",
      `task session "${sessionId}" belongs to task "${session.task_id}", not "${input.taskId}"`
    );
  }

  if (session.status !== "active") {
    throw new TaskServiceError(
      "SESSION_NOT_ACTIVE",
      `task session "${sessionId}" is ${session.status}, not active`
    );
  }

  /*
   * A usage record is attributed to at most one session.
   *
   * UNIQUE(task_session_id, usage_record_id) only dedupes within a
   * single session, so without this guard the same usage record could
   * be attached to a second session and its cost would be counted
   * twice for that task. Re-attaching to the session that already
   * holds it stays idempotent and is handled by the insert below.
   */
  const attributedSessionId =
    findTaskSessionIdByUsageRecord(
      input.usageRecordId
    );

  if (
    attributedSessionId !== undefined &&
    attributedSessionId !== sessionId
  ) {
    throw new TaskServiceError(
      "USAGE_ALREADY_ATTRIBUTED",
      `usage record "${input.usageRecordId}" is already attributed to task session "${attributedSessionId}"`
    );
  }

  try {
    const inserted = associateUsageRecordInDb({
      id: input.associationId ?? randomUUID(),
      taskSessionId: sessionId,
      usageRecordId: input.usageRecordId,
      attributionStatus:
        input.attributionStatus ?? "manual",
    });

    return { inserted };
  } catch (error) {
    if (
      isSqliteConstraint(
        error,
        /FOREIGN KEY constraint failed/i
      )
    ) {
      throw new TaskServiceError(
        "USAGE_NOT_FOUND",
        `usage record "${input.usageRecordId}" does not exist`
      );
    }

    throw error;
  }
}

/*
 * Attaches a newly recorded usage record to the one active task
 * session, without the caller having to know which session that is.
 *
 * This is the automatic counterpart to the manual usage/attach API
 * action: a usage record produced while a task session is running
 * belongs to it. Attribution is an additional concern layered on top
 * of storing the usage record, so every expected outcome is reported
 * in the result instead of thrown, and the caller is expected to
 * ignore it:
 *
 *   "skipped"  no active session, nothing to attribute to
 *   "inserted" the record now belongs to the active session
 *   "existing" the record was already attributed to that session
 *   "conflict" the record already belongs to a different session
 *
 * "conflict" is expected rather than exceptional, so it must not make
 * the caller's own work fail. The single active session is read here
 * exactly as elsewhere, so the uniqueness guarantee is unchanged.
 */
export type AutoAttributionResult =
  | "skipped"
  | "inserted"
  | "existing"
  | "conflict";

export function autoAttributeUsageRecord(input: {
  usageRecordId: string;
}): AutoAttributionResult {
  const active = getActiveSession();

  if (!active) {
    return "skipped";
  }

  try {
    const { inserted } = associateUsageRecord({
      taskId: active.task_id,
      sessionId: active.id,
      usageRecordId: input.usageRecordId,
      attributionStatus: "auto",
    });

    return inserted ? "inserted" : "existing";
  } catch (error) {
    if (
      error instanceof TaskServiceError &&
      (error.code === "USAGE_ALREADY_ATTRIBUTED" ||
        error.code === "SESSION_NOT_ACTIVE" ||
        error.code === "SESSION_TASK_MISMATCH")
    ) {
      return "conflict";
    }

    throw error;
  }
}

function activeSessionIdForTask(
  taskId: string
): string {
  const active = getActiveSession();

  if (!active) {
    throw new TaskServiceError(
      "NO_ACTIVE_SESSION",
      `no active session for task "${taskId}"`
    );
  }

  return active.id;
}

/*
 * Recomputes the task's verified cost from the Money Layer.
 *
 * All-or-nothing: the task cost is verified only when EVERY usage
 * record associated with the task is reliably attributable to the
 * Money Layer. A usage record is reliable when it has a cost record
 * with a non-null total, a non-null currency, an official source
 * (official_export / official_api) and verified/exact accuracy.
 *
 * If any associated record misses one of those predicates, or the
 * reliable records span more than one currency, the task result is
 * unavailable (null). The reliable subset is never summed and mixed
 * currencies are never converted.
 */
export function getTaskVerifiedCost(
  taskId: string
): TaskVerifiedCost {
  return verifiedCostFromBundles(
    getTaskUsageBundles(taskId)
  );
}

/*
 * The same verified-cost rule applied to one session's own bundles.
 *
 * getTaskVerifiedCost spans every session of a task, which is the
 * right answer for a task total. While a session is still active that
 * would mix in what earlier sessions of the same task already spent,
 * so the active-session figure is scoped to that session instead.
 */
export function getTaskSessionVerifiedCost(
  sessionId: string
): TaskVerifiedCost {
  const session = getSession(sessionId);

  if (!session) {
    return null;
  }

  return verifiedCostFromBundles(
    getTaskUsageBundles(session.task_id).filter(
      (bundle) =>
        bundle.task_session_id === sessionId
    )
  );
}

function verifiedCostFromBundles(
  bundles: TaskUsageBundle[]
): TaskVerifiedCost {
  const reliable = bundles.filter(
    (bundle) =>
      bundle.cost_record_id !== null &&
      bundle.total_cost_micros !== null &&
      bundle.currency !== null &&
      isOfficialVerifiedRecord(
        bundle.source,
        bundle.accuracy
      )
  );

  if (reliable.length !== bundles.length) {
    return null;
  }

  if (reliable.length === 0) {
    return null;
  }

  const currencies = new Set<string>();

  for (const bundle of reliable) {
    if (bundle.currency !== null) {
      currencies.add(bundle.currency);
    }
  }

  if (currencies.size !== 1) {
    return null;
  }

  const [currency] = currencies;

  if (!currency) {
    return null;
  }

  const amountMicros = reliable.reduce(
    (sum, bundle) =>
      sum + Number(bundle.total_cost_micros),
    0
  );

  return {
    amountMicros,
    currency,
  };
}