import { getDb } from "@/lib/db";
import { initDb } from "@/lib/schema";

/*
 * R3.1 AI Resource repository.
 *
 * Plain data access only. No pricing, no cost, no capacity, no model
 * capability judgement, no recommendation and no selection happen
 * here: this module stores and returns exactly what it is given. The
 * R3.4-B1 pricing-basis columns are stored as facts only — kind,
 * an optional pinned pricing_versions row and a checked-at stamp —
 * and never turned into a price or a cost estimate here.
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

/*
 * channel is the reachability axis, orthogonal to access_method:
 * own_api means the user's own API key path, gateway a third-party
 * gateway, web_only a subscription-web resource with no measurable
 * API, unknown a path not yet recorded.
 */
export type AiResourceChannel =
  | "own_api"
  | "gateway"
  | "web_only"
  | "unknown";

export type AiResourceOwner = "user" | "system";

export type AiResourceStatus =
  | "active"
  | "archived";

/*
 * pricing_basis_kind records the pricing basis this resource carries:
 * 'none' means no pricing basis has been recorded, 'registry' means it
 * is priced against the registry rate card. It is a fact-carrier
 * only; no price is derived here. A measured/verified-usage basis is
 * deliberately not a value in this step.
 */
export type AiResourcePricingBasisKind =
  | "registry"
  | "none";

export type AiResourceRow = {
  id: string;
  name: string;
  tool_id: string | null;
  model_id: string;
  access_method: AiResourceAccessMethod;
  channel: AiResourceChannel;
  entitlement_name: string | null;
  entitlement_source_url: string | null;
  entitlement_checked_at: string | null;
  status: AiResourceStatus;
  owner: AiResourceOwner;
  notes: string | null;
  created_at: string;
  updated_at: string;
  pricing_basis_kind: AiResourcePricingBasisKind;
  pricing_version_id: string | null;
  pricing_basis_checked_at: string | null;
};

export type CreateAiResourceInput = {
  id: string;
  name: string;
  toolId?: string | null;
  modelId: string;
  accessMethod: AiResourceAccessMethod;
  channel: AiResourceChannel;
  entitlementName?: string | null;
  entitlementSourceUrl?: string | null;
  entitlementCheckedAt?: string | null;
  notes?: string | null;
  pricingBasisKind?: AiResourcePricingBasisKind;
  pricingVersionId?: string | null;
  pricingBasisCheckedAt?: string | null;
  createdAt: string;
};

export type UpdateAiResourceInput = {
  name?: string;
  toolId?: string | null;
  modelId?: string;
  accessMethod?: AiResourceAccessMethod;
  channel?: AiResourceChannel;
  entitlementName?: string | null;
  entitlementSourceUrl?: string | null;
  entitlementCheckedAt?: string | null;
  notes?: string | null;
  pricingBasisKind?: AiResourcePricingBasisKind;
  pricingVersionId?: string | null;
  pricingBasisCheckedAt?: string | null;
  updatedAt: string;
};

const AI_RESOURCE_COLUMNS = `
  id,
  name,
  tool_id,
  model_id,
  access_method,
  channel,
  entitlement_name,
  entitlement_source_url,
  entitlement_checked_at,
  status,
  owner,
  notes,
  created_at,
  updated_at,
  pricing_basis_kind,
  pricing_version_id,
  pricing_basis_checked_at
`;

const INSERT_PARAMS =
  "?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?";

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
         channel,
         entitlement_name,
         entitlement_source_url,
         entitlement_checked_at,
         status,
         owner,
         notes,
         created_at,
         updated_at,
         pricing_basis_kind,
         pricing_version_id,
         pricing_basis_checked_at
       )
       VALUES (${INSERT_PARAMS})`
    )
    .run(
      input.id,
      input.name,
      input.toolId ?? null,
      input.modelId,
      input.accessMethod,
      input.channel ?? "unknown",
      input.entitlementName ?? null,
      input.entitlementSourceUrl ?? null,
      input.entitlementCheckedAt ?? null,
      "active",
      "user",
      input.notes ?? null,
      input.createdAt,
      input.createdAt,
      input.pricingBasisKind ?? "none",
      input.pricingVersionId ?? null,
      input.pricingBasisCheckedAt ?? null
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

  if (input.channel !== undefined) {
    assignments.push("channel = ?");
    params.push(input.channel);
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

  if (input.pricingBasisKind !== undefined) {
    assignments.push(
      "pricing_basis_kind = ?"
    );
    params.push(input.pricingBasisKind);
  }

  if (input.pricingVersionId !== undefined) {
    assignments.push(
      "pricing_version_id = ?"
    );
    params.push(input.pricingVersionId);
  }

  if (input.pricingBasisCheckedAt !== undefined) {
    assignments.push(
      "pricing_basis_checked_at = ?"
    );
    params.push(input.pricingBasisCheckedAt);
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