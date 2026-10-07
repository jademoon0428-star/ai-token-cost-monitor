import { getDb } from "@/lib/db";
import { initDb } from "@/lib/schema";

/*
 * Declared AI resource repository.
 *
 * Plain data access only. No pricing, no cost, no capability
 * judgement, no recommendation and no selection happen here: this
 * module stores and returns exactly what it is given.
 *
 * A declaration describes a way of reaching an AI model that lives
 * outside this app's own inventory: a web subscription, a gateway, a
 * borrowed account. It is deliberately its own table, so a declaration
 * never becomes a models row (which would put it in front of
 * listAiRegistry() and the R3.3-B combination pool) and never becomes
 * an ai_resources row (which would present it as a verified,
 * user-owned resource keyed by a real registry model id).
 *
 * Nothing here stores a credential: there is no api key, token,
 * password, balance or quota column, and channel is a recorded fact,
 * not a live link.
 *
 * Rows are archived, never deleted, so a stored candidate that points
 * at one keeps resolving.
 */

export type DeclaredResourceChannel =
  | "own_api"
  | "gateway"
  | "web_only"
  | "unknown";

/*
 * entitlement is the user's own statement about what they pay. 'free'
 * and 'paid' are claims the app records, not facts it verified, and
 * 'unknown' stays unknown rather than being guessed either way.
 */
export type DeclaredResourceEntitlement =
  | "free"
  | "paid"
  | "unknown";

/*
 * pricing_state records only whether the user states that a price is
 * known. It is not a rate: no number, no currency and no cost is
 * derived from it anywhere in this repository.
 */
export type DeclaredResourcePricingState =
  | "known"
  | "unknown";

export type DeclaredResourceStatus =
  | "active"
  | "archived";

export type DeclaredResourceRow = {
  id: string;
  name: string;
  provider_name: string | null;
  model_name: string | null;
  channel: DeclaredResourceChannel;
  entitlement: DeclaredResourceEntitlement;
  pricing_state: DeclaredResourcePricingState;
  supports_tools: number | null;
  supports_vision: number | null;
  supports_reasoning: number | null;
  context_window_tokens: number | null;
  max_output_tokens: number | null;
  status: DeclaredResourceStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateDeclaredResourceInput = {
  id: string;
  name: string;
  providerName?: string | null;
  modelName?: string | null;
  channel: DeclaredResourceChannel;
  entitlement: DeclaredResourceEntitlement;
  pricingState: DeclaredResourcePricingState;
  supportsTools?: number | null;
  supportsVision?: number | null;
  supportsReasoning?: number | null;
  contextWindowTokens?: number | null;
  maxOutputTokens?: number | null;
  notes?: string | null;
  createdAt: string;
};

export type UpdateDeclaredResourceInput = {
  name?: string;
  providerName?: string | null;
  modelName?: string | null;
  channel?: DeclaredResourceChannel;
  entitlement?: DeclaredResourceEntitlement;
  pricingState?: DeclaredResourcePricingState;
  supportsTools?: number | null;
  supportsVision?: number | null;
  supportsReasoning?: number | null;
  contextWindowTokens?: number | null;
  maxOutputTokens?: number | null;
  notes?: string | null;
  updatedAt: string;
};

const DECLARED_RESOURCE_COLUMNS = `
  id,
  name,
  provider_name,
  model_name,
  channel,
  entitlement,
  pricing_state,
  supports_tools,
  supports_vision,
  supports_reasoning,
  context_window_tokens,
  max_output_tokens,
  status,
  notes,
  created_at,
  updated_at
`;

function insertDeclaredResource(
  input: CreateDeclaredResourceInput
): void {
  getDb()
    .prepare(
      `
        INSERT INTO declared_ai_resources
        (
          id,
          name,
          provider_name,
          model_name,
          channel,
          entitlement,
          pricing_state,
          supports_tools,
          supports_vision,
          supports_reasoning,
          context_window_tokens,
          max_output_tokens,
          status,
          notes,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
      `
    )
    .run(
      input.id,
      input.name,
      input.providerName ?? null,
      input.modelName ?? null,
      input.channel,
      input.entitlement,
      input.pricingState,
      input.supportsTools ?? null,
      input.supportsVision ?? null,
      input.supportsReasoning ?? null,
      input.contextWindowTokens ?? null,
      input.maxOutputTokens ?? null,
      input.notes ?? null,
      input.createdAt,
      input.createdAt
    );
}

export function createDeclaredResource(
  input: CreateDeclaredResourceInput
): void {
  initDb();

  insertDeclaredResource(input);
}

export function getDeclaredResource(
  id: string
): DeclaredResourceRow | undefined {
  initDb();

  return getDb()
    .prepare(
      `
        SELECT ${DECLARED_RESOURCE_COLUMNS}
        FROM declared_ai_resources
        WHERE id = ?
      `
    )
    .get(id) as DeclaredResourceRow | undefined;
}

export function listDeclaredResources(
  query: {
    status?: DeclaredResourceStatus | "all";
  } = {}
): DeclaredResourceRow[] {
  initDb();

  if (
    query.status === "active" ||
    query.status === "archived"
  ) {
    return getDb()
      .prepare(
        `
          SELECT ${DECLARED_RESOURCE_COLUMNS}
          FROM declared_ai_resources
          WHERE status = ?
          ORDER BY created_at ASC, id ASC
        `
      )
      .all(query.status) as DeclaredResourceRow[];
  }

  return getDb()
    .prepare(
      `
        SELECT ${DECLARED_RESOURCE_COLUMNS}
        FROM declared_ai_resources
        ORDER BY created_at ASC, id ASC
      `
    )
    .all() as DeclaredResourceRow[];
}

export function updateDeclaredResource(
  id: string,
  input: UpdateDeclaredResourceInput
): DeclaredResourceRow | undefined {
  initDb();

  const assignments: string[] = [];
  const params: Array<unknown> = [];

  if (input.name !== undefined) {
    assignments.push("name = ?");
    params.push(input.name);
  }

  if (input.providerName !== undefined) {
    assignments.push("provider_name = ?");
    params.push(input.providerName);
  }

  if (input.modelName !== undefined) {
    assignments.push("model_name = ?");
    params.push(input.modelName);
  }

  if (input.channel !== undefined) {
    assignments.push("channel = ?");
    params.push(input.channel);
  }

  if (input.entitlement !== undefined) {
    assignments.push("entitlement = ?");
    params.push(input.entitlement);
  }

  if (input.pricingState !== undefined) {
    assignments.push("pricing_state = ?");
    params.push(input.pricingState);
  }

  if (input.supportsTools !== undefined) {
    assignments.push("supports_tools = ?");
    params.push(input.supportsTools);
  }

  if (input.supportsVision !== undefined) {
    assignments.push("supports_vision = ?");
    params.push(input.supportsVision);
  }

  if (input.supportsReasoning !== undefined) {
    assignments.push("supports_reasoning = ?");
    params.push(input.supportsReasoning);
  }

  if (input.contextWindowTokens !== undefined) {
    assignments.push("context_window_tokens = ?");
    params.push(input.contextWindowTokens);
  }

  if (input.maxOutputTokens !== undefined) {
    assignments.push("max_output_tokens = ?");
    params.push(input.maxOutputTokens);
  }

  if (input.notes !== undefined) {
    assignments.push("notes = ?");
    params.push(input.notes);
  }

  if (assignments.length === 0) {
    return getDeclaredResource(id);
  }

  assignments.push("updated_at = ?");
  params.push(input.updatedAt);

  getDb()
    .prepare(
      `
        UPDATE declared_ai_resources
        SET ${assignments.join(", ")}
        WHERE id = ?
      `
    )
    .run(...params, id);

  return getDeclaredResource(id);
}

/*
 * The dedicated status change. No client can set status through the
 * generic update path; archiving is this one operation, and it never
 * deletes the row, so a stored candidate that points at one keeps
 * resolving.
 */
export function archiveDeclaredResource(
  id: string,
  updatedAt: string
): void {
  initDb();

  getDb()
    .prepare(
      `
        UPDATE declared_ai_resources
        SET
          status = 'archived',
          updated_at = ?
        WHERE id = ?
      `
    )
    .run(updatedAt, id);
}
