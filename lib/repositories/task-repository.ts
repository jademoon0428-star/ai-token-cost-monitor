import { getDb } from "@/lib/db";
import { initDb } from "@/lib/schema";

export type TaskRow = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type TaskSessionRow = {
  id: string;
  task_id: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  created_at: string;
};

export type TaskUsageAssociationRow = {
  id: string;
  task_session_id: string;
  usage_record_id: string;
  attribution_status: string;
  created_at: string;
};

export type TaskUsageBundle = {
  association_id: string;
  task_session_id: string;
  task_id: string;
  usage_record_id: string;
  provider: string;
  model: string;
  timestamp: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  reasoning_tokens: number;
  source: string;
  accuracy: string;
  cost_record_id: string | null;
  total_cost_micros: number | null;
  currency: string | null;
};

export type CreateTaskInput = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateTaskSessionInput = {
  id: string;
  taskId: string;
  startedAt: string;
  status: string;
  createdAt?: string;
};

export type AssociateUsageRecordInput = {
  id: string;
  taskSessionId: string;
  usageRecordId: string;
  attributionStatus?: string;
  createdAt?: string;
};

export function createTask(input: CreateTaskInput): void {
  initDb();

  getDb()
    .prepare(
      `
        INSERT INTO tasks
        (
          id,
          name,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?)
      `
    )
    .run(
      input.id,
      input.name,
      input.status,
      input.createdAt,
      input.updatedAt
    );
}

export function getTask(id: string): TaskRow | undefined {
  initDb();

  return getDb()
    .prepare(
      `
        SELECT
          id,
          name,
          status,
          created_at,
          updated_at
        FROM tasks
        WHERE id = ?
      `
    )
    .get(id) as TaskRow | undefined;
}

export function listTasks(): TaskRow[] {
  initDb();

  return getDb()
    .prepare(
      `
        SELECT
          id,
          name,
          status,
          created_at,
          updated_at
        FROM tasks
        ORDER BY created_at DESC
      `
    )
    .all() as TaskRow[];
}

export type UpdateTaskInput = {
  name?: string;
  status?: string;
  updatedAt: string;
};

export function updateTask(
  id: string,
  input: UpdateTaskInput
): TaskRow | undefined {
  initDb();

  const assignments: string[] = [];
  const params: Array<string> = [];

  if (input.name !== undefined) {
    assignments.push("name = ?");
    params.push(input.name);
  }

  if (input.status !== undefined) {
    assignments.push("status = ?");
    params.push(input.status);
  }

  if (assignments.length === 0) {
    return getTask(id);
  }

  assignments.push("updated_at = ?");
  params.push(input.updatedAt);

  getDb()
    .prepare(
      `
        UPDATE tasks
        SET ${assignments.join(", ")}
        WHERE id = ?
      `
    )
    .run(...params, id);

  return getTask(id);
}

export function createTaskSession(
  input: CreateTaskSessionInput
): void {
  initDb();

  const createdAt =
    input.createdAt ?? input.startedAt;

  getDb()
    .prepare(
      `
        INSERT INTO task_sessions
        (
          id,
          task_id,
          started_at,
          ended_at,
          status,
          created_at
        )
        VALUES (?, ?, ?, NULL, ?, ?)
      `
    )
    .run(
      input.id,
      input.taskId,
      input.startedAt,
      input.status,
      createdAt
    );
}

export function getSession(
  id: string
): TaskSessionRow | undefined {
  initDb();

  return getDb()
    .prepare(
      `
        SELECT
          id,
          task_id,
          started_at,
          ended_at,
          status,
          created_at
        FROM task_sessions
        WHERE id = ?
      `
    )
    .get(id) as TaskSessionRow | undefined;
}

export function getActiveSession():
  | TaskSessionRow
  | undefined {
  initDb();

  return getDb()
    .prepare(
      `
        SELECT
          id,
          task_id,
          started_at,
          ended_at,
          status,
          created_at
        FROM task_sessions
        WHERE status = 'active'
        ORDER BY started_at DESC
        LIMIT 1
      `
    )
    .get() as TaskSessionRow | undefined;
}

export function endTaskSession(
  id: string,
  input: {
    endedAt: string;
    status: "completed" | "abandoned";
  }
): void {
  initDb();

  getDb()
    .prepare(
      `
        UPDATE task_sessions
        SET
          status = ?,
          ended_at = ?
        WHERE id = ?
      `
    )
    .run(
      input.status,
      input.endedAt,
      id
    );
}

/*
 * Associates a usage record with a task session.
 *
 * Returns true when a new association row was inserted and false
 * when the (task_session_id, usage_record_id) pair already existed
 * (the insert is idempotent).
 */
export function associateUsageRecord(
  input: AssociateUsageRecordInput
): boolean {
  initDb();

  const createdAt =
    input.createdAt ??
    new Date().toISOString();

  const result = getDb()
    .prepare(
      `
        INSERT OR IGNORE INTO task_usage_records
        (
          id,
          task_session_id,
          usage_record_id,
          attribution_status,
          created_at
        )
        VALUES (?, ?, ?, ?, ?)
      `
    )
    .run(
      input.id,
      input.taskSessionId,
      input.usageRecordId,
      input.attributionStatus ?? "manual",
      createdAt
    );

  return Number(result.changes) > 0;
}

export function getTaskUsageBundles(
  taskId: string
): TaskUsageBundle[] {
  initDb();

  return getDb()
    .prepare(
      `
        SELECT
          tur.id AS association_id,
          tur.task_session_id,
          ts.task_id,
          u.id AS usage_record_id,
          p.name AS provider,
          m.name AS model,
          u.timestamp,
          u.input_tokens,
          u.output_tokens,
          u.cached_tokens,
          u.reasoning_tokens,
          u.source,
          u.accuracy,
          c.id AS cost_record_id,
          c.total_cost_micros,
          c.currency
        FROM task_usage_records tur
        JOIN task_sessions ts
          ON ts.id = tur.task_session_id
        JOIN usage_records u
          ON u.id = tur.usage_record_id
        JOIN providers p
          ON p.id = u.provider_id
        JOIN models m
          ON m.id = u.model_id
        LEFT JOIN cost_records c
          ON c.usage_record_id = u.id
        WHERE ts.task_id = ?
        ORDER BY u.timestamp ASC
      `
    )
    .all(taskId) as TaskUsageBundle[];
}

export type TaskSessionHistoryRow = {
  task_id: string;
  task_name: string;
  task_created_at: string;
  session_id: string | null;
  session_started_at: string | null;
  session_ended_at: string | null;
  session_status: string | null;
};

/*
 * Session-level task history: every task with its sessions, ordered
 * by session.started_at DESC. Tasks that have no session yet are
 * appended last with null session fields so they are still visible.
 */
export function listTaskHistory(): TaskSessionHistoryRow[] {
  initDb();

  return getDb()
    .prepare(
      `
        SELECT
          t.id AS task_id,
          t.name AS task_name,
          t.created_at AS task_created_at,
          s.id AS session_id,
          s.started_at AS session_started_at,
          s.ended_at AS session_ended_at,
          s.status AS session_status
        FROM tasks t
        LEFT JOIN task_sessions s
          ON s.task_id = t.id
        ORDER BY
          s.started_at IS NULL,
          s.started_at DESC,
          t.created_at DESC
      `
    )
    .all() as TaskSessionHistoryRow[];
}