import { getDb } from "@/lib/db";
import { initDb } from "@/lib/schema";

/*
 * R3.1 AI Resource repository.
 *
 * Plain data access only. No pricing, no cost, no capacity, no model
 * capability judgement, no recommendation and no selection happen
 * here: this module stores and returns exactly what it is given.
 *
 * A resource is the "what the user owns" record: one way the user can
 * access one model, either directly (tool_id NULL) or through one
 * user_ai_tool. Rows are archived, never deleted, so a historical
 * reference stays resolvable; archive is a dedicated operation, not a
 * patch field.
 */

export type AiResourceAccessMethod =
  | "free_tier"
  | "subscription"
  | "pay_as_you_go"
  | "unknown";

export type AiResourceStatus =
  | "active"
  | "archived";

export type AiResourceRow = {
  id: string;
  name: string;
  tool_id: string | null;
  model_id: string;
  access_method: AiResourceAccessMethod;
  entitlement_name: string | null;
  entitlement_source_url: string | null;
  entitlement_checked_at: string | null;
  status: AiResourceStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateAiResourceInput = {
  id: string;
  name: string;
  toolId?: string | null;
  modelId: string;
  accessMethod: AiResourceAccessMethod;
  entitlementName?: string | null;
  entitlementSourceUrl?: string | null;
  entitlementCheckedAt?: string | null;
  notes?: string | null;
  createdAt: string;
};

export type UpdateAiResourceInput = {
  name?: string;
  toolId?: string | null;
  modelId?: string;
  accessMethod?: AiResourceAccessMethod;
  entitlementName?: string | null;
  entitlementSourceUrl?: string | null;
  entitlementCheckedAt?: string | null;
  notes?: string | null;
  updatedAt: string;
};

const AI_RESOURCE_COLUMNS = `
  id,
  name,
  tool_id,
  model_id,
  access_method,
  entitlement_name,
  entitlement_source_url,
  entitlement_checked_at,
  status,
  notes,
  created_at,
  updated_at
`;

const INSERT_PARAMS =
  "?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?";

function insertAiResource(
  input: CreateAiResourceInput
): void {
  getDb()
    .prepare(
      `INSERT INTO ai_resources
       (
         id,
         name,
         tool_id,
         model_id,
         access_method,
         entitlement_name,
         entitlement_source_url,
         entitlement_checked_at,
         status,
         notes,
         created_at,
         updated_at
       )
       VALUES (${INSERT_PARAMS})`
    )
    .run(
      input.id,
      input.name,
      input.toolId ?? null,
      input.modelId,
      input.accessMethod,
      input.entitlementName ?? null,
      input.entitlementSourceUrl ?? null,
      input.entitlementCheckedAt ?? null,
      "active",
      input.notes ?? null,
      input.createdAt,
      input.createdAt
    );
}

export function createAiResource(
  input: CreateAiResourceInput
): void {
  initDb();

  insertAiResource(input);
}

export function getAiResource(
  id: string
): AiResourceRow | undefined {
  initDb();

  return getDb()
    .prepare(
      `SELECT ${AI_RESOURCE_COLUMNS}
       FROM ai_resources
       WHERE id = ?`
    )
    .get(id) as AiResourceRow | undefined;
}

export function listAiResources(
  query: {
    status?:
      | AiResourceStatus
      | "all";
  } = {}
): AiResourceRow[] {
  initDb();

  if (
    query.status === "active" ||
    query.status === "archived"
  ) {
    return getDb()
      .prepare(
        `SELECT ${AI_RESOURCE_COLUMNS}
         FROM ai_resources
         WHERE status = ?
         ORDER BY created_at ASC, id ASC`
      )
      .all(query.status) as AiResourceRow[];
  }

  return getDb()
    .prepare(
      `SELECT ${AI_RESOURCE_COLUMNS}
       FROM ai_resources
       ORDER BY created_at ASC, id ASC`
    )
    .all() as AiResourceRow[];
}

export function updateAiResource(
  id: string,
  input: UpdateAiResourceInput
): AiResourceRow | undefined {
  initDb();

  const assignments: string[] = [];
  const params: Array<unknown> = [];

  if (input.name !== undefined) {
    assignments.push("name = ?");
    params.push(input.name);
  }

  if (input.toolId !== undefined) {
    assignments.push("tool_id = ?");
    params.push(input.toolId);
  }

  if (input.modelId !== undefined) {
    assignments.push("model_id = ?");
    params.push(input.modelId);
  }

  if (input.accessMethod !== undefined) {
    assignments.push("access_method = ?");
    params.push(input.accessMethod);
  }

  if (input.entitlementName !== undefined) {
    assignments.push(
      "entitlement_name = ?"
    );
    params.push(input.entitlementName);
  }

  if (
    input.entitlementSourceUrl !== undefined
  ) {
    assignments.push(
      "entitlement_source_url = ?"
    );
    params.push(input.entitlementSourceUrl);
  }

  if (
    input.entitlementCheckedAt !== undefined
  ) {
    assignments.push(
      "entitlement_checked_at = ?"
    );
    params.push(input.entitlementCheckedAt);
  }

  if (input.notes !== undefined) {
    assignments.push("notes = ?");
    params.push(input.notes);
  }

  if (assignments.length === 0) {
    return getAiResource(id);
  }

  assignments.push("updated_at = ?");
  params.push(input.updatedAt);

  getDb()
    .prepare(
      `UPDATE ai_resources
       SET ${assignments.join(", ")}
       WHERE id = ?`
    )
    .run(...params, id);

  return getAiResource(id);
}

/*
 * The dedicated status change. No client can set status through the
 * generic update path; archiving is this one operation, and it never
 * deletes the row.
 */
export function archiveAiResource(
  id: string,
  updatedAt: string
): void {
  initDb();

  getDb()
    .prepare(
      `UPDATE ai_resources
       SET
         status = 'archived',
         updated_at = ?
       WHERE id = ?`
    )
    .run(updatedAt, id);
}