import { randomUUID } from "node:crypto";

import { getDb } from "@/lib/db";
import { initDb } from "@/lib/schema";
import type {
  AiResourceAccessMethod,
  AiResourceChannel,
  AiResourcePricingBasisKind,
  AiResourceRow,
  UpdateAiResourceInput,
} from "@/lib/repositories/ai-resource-repository";
import {
  archiveAiResource as archiveAiResourceInDb,
  createAiResource as createAiResourceInDb,
  getAiResource,
  updateAiResource as updateAiResourceInDb,
} from "@/lib/repositories/ai-resource-repository";

/*
 * R3.1 AI Resource service.
 *
 * This service does exactly three things:
 *
 * 1. Validates input and refuses obviously invalid data.
 * 2. Keeps status as a dedicated operation, not a patch field.
 * 3. Calls the repository.
 *
 * What it deliberately does NOT do:
 *
 * - It does not compute a price, a cost, a currency figure or a
 *   budget. A resource names how a user accesses a model; it is not
 *   a price and it never carries planned or actual spend. The
 *   R3.4-B1 pricing-basis columns are stored as facts (kind, an
 *   optional pinned pricing_versions row, a checked-at stamp) and
 *   are never turned into a rate or a cost estimate here.
 * - It does not judge model capabilities, fit or quality. There is
 *   no score / rank / tier / weight / confidence / role / selected /
 *   recommended concept here.
 * - It does not recommend, auto-select, auto-run or switch anything,
 *   and it does not infer a provider from a model.
 * - It never persists a credential, api key, token, password,
 *   balance, quota or OAuth secret.
 * - It never deletes a resource: archiving is the only way a row
 *   leaves the active view, so historical references stay resolvable.
 */

export class AiResourceServiceError extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string
  ) {
    super(message);
    this.code = code;
  }
}

export const ACCESS_METHODS: AiResourceAccessMethod[] = [
  "free_tier",
  "subscription",
  "pay_as_you_go",
  "unknown",
];

/*
 * channel records how a resource is reached or measured. It is a
 * stored fact only: nothing here stores a key, opens a connection or
 * triggers a provider call.
 */
export const CHANNELS: AiResourceChannel[] = [
  "own_api",
  "gateway",
  "web_only",
  "unknown",
];

/*
 * The pricing basis a client may record, fixed by contract. 'none'
 * means no pricing basis has been recorded (the default); 'registry'
 * means the resource is priced against the registry rate card. The
 * service records the fact and refuses bad values; it never turns a
 * basis into a price or a cost estimate. A 'verified_usage' basis is
 * deliberately not accepted here.
 */
export const PRICING_BASIS_KINDS: AiResourcePricingBasisKind[] = [
  "registry",
  "none",
];

function fail(
  code: string,
  message: string
): never {
  throw new AiResourceServiceError(
    code,
    message
  );
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
      `${label} must be one of ${allowed.join(
        ", "
      )}, got "${value}"`
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
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    fail(
      "INVALID_TEXT",
      `${label} is required`
    );
  }

  return value.trim();
}

/*
 * Basic URL shape check for an optional entitlement source. Anything
 * that does not parse as an absolute http(s) URL is refused; the
 * service does not fetch it, verify its content or store a secret.
 */
function optionalUrl(
  value: string | null | undefined,
  label: string
): string | null {
  const text = optionalText(value, label);

  if (text === null) {
    return null;
  }

  try {
    const parsed = new URL(text);

    if (
      parsed.protocol !== "http:" &&
      parsed.protocol !== "https:"
    ) {
      fail(
        "INVALID_URL",
        `${label} must be an absolute http(s) URL`
      );
    }
  } catch {
    fail(
      "INVALID_URL",
      `${label} must be a valid absolute URL`
    );
  }

  return text;
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
  toolId: string | null
): string | null {
  if (toolId === null) {
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

/*
 * The unique key is (tool, model, access method), with a NULL tool
 * meaning direct API. COALESCE collapses the NULL to '' exactly like
 * the schema's expression index, so this check and the index can
 * never disagree about what "the same resource" means.
 */
function resourceKeyExists(
  modelId: string,
  toolId: string | null,
  accessMethod: string,
  excludeId?: string
): boolean {
  const row = getDb()
    .prepare(
      `SELECT id
       FROM ai_resources
       WHERE model_id = ?
         AND access_method = ?
         AND COALESCE(tool_id, '') = ?
         AND (? IS NULL OR id <> ?)`
    )
    .get(
      modelId,
      accessMethod,
      toolId ?? "",
      excludeId ?? null,
      excludeId ?? null
    );

  return row !== undefined;
}

function assertNoDuplicate(
  modelId: string,
  toolId: string | null,
  accessMethod: AiResourceAccessMethod,
  excludeId?: string
): void {
  if (
    resourceKeyExists(
      modelId,
      toolId,
      accessMethod,
      excludeId
    )
  ) {
    fail(
      "DUPLICATE_AI_RESOURCE",
      `an ai resource for model "${modelId}", tool "${
        toolId ?? "(direct)"
      }" and access method "${accessMethod}" already exists`
    );
  }
}

/*
 * A pricingVersionId must name a real registry pricing_versions row.
 * It pins one rate card; it is a reference, not a price. A missing
 * row is a 404, matching how a missing model or tool is reported.
 */
function assertPricingVersionExists(
  pricingVersionId: string
): string {
  const id = requiredText(
    pricingVersionId,
    "pricing_version_id"
  );

  const row = getDb()
    .prepare(
      `SELECT id FROM pricing_versions WHERE id = ?`
    )
    .get(id);

  if (row === undefined) {
    fail(
      "PRICING_VERSION_NOT_FOUND",
      `pricing version "${id}" does not exist`
    );
  }

  return id;
}

function requireResource(
  id: string
): AiResourceRow {
  const resource = getAiResource(id);

  if (resource === undefined) {
    fail(
      "AI_RESOURCE_NOT_FOUND",
      `ai resource "${id}" does not exist`
    );
  }

  return resource;
}

export function createAiResource(input: {
  name: string;
  modelId: string;
  toolId?: string | null;
  accessMethod: AiResourceAccessMethod;
  channel?: AiResourceChannel;
  entitlementName?: string | null;
  entitlementSourceUrl?: string | null;
  entitlementCheckedAt?: string | null;
  notes?: string | null;
  pricingBasisKind?: AiResourcePricingBasisKind | null;
  pricingVersionId?: string | null;
  pricingBasisCheckedAt?: string | null;
}): ReturnType<typeof getAiResource> {
  initDb();

  const name = requiredText(
    input.name,
    "resource name"
  );
  const modelId = assertModelExists(
    input.modelId
  );
  const toolId = assertToolExists(
    input.toolId ?? null
  );
  const accessMethod = assertOneOf(
    input.accessMethod,
    ACCESS_METHODS,
    "INVALID_ACCESS_METHOD",
    "access_method"
  );
  const channel =
    input.channel === undefined
      ? "unknown"
      : assertOneOf(
          input.channel,
          CHANNELS,
          "INVALID_CHANNEL",
          "channel"
        );
  const entitlementName = optionalText(
    input.entitlementName,
    "entitlement_name"
  );
  const entitlementSourceUrl = optionalUrl(
    input.entitlementSourceUrl,
    "entitlement_source_url"
  );
  const entitlementCheckedAt = optionalText(
    input.entitlementCheckedAt,
    "entitlement_checked_at"
  );
  const notes = optionalText(input.notes, "notes");
  const pricingBasisKind =
    input.pricingBasisKind === undefined ||
    input.pricingBasisKind === null
      ? "none"
      : assertOneOf(
          input.pricingBasisKind,
          PRICING_BASIS_KINDS,
          "INVALID_PRICING_BASIS",
          "pricing_basis_kind"
        );
  const pricingVersionId =
    input.pricingVersionId === undefined ||
    input.pricingVersionId === null
      ? null
      : assertPricingVersionExists(
          input.pricingVersionId
        );
  const pricingBasisCheckedAt = optionalText(
    input.pricingBasisCheckedAt,
    "pricing_basis_checked_at"
  );

  /*
   * A resource with no pricing basis cannot carry a pinned rate card:
   * the fact and its reference must agree.
   */
  if (
    pricingVersionId !== null &&
    pricingBasisKind === "none"
  ) {
    fail(
      "INVALID_PRICING_BASIS",
      "pricing_version_id cannot be set when pricing_basis_kind is none"
    );
  }

  assertNoDuplicate(
    modelId,
    toolId,
    accessMethod
  );

  const id = randomUUID();
  const now = new Date().toISOString();

  createAiResourceInDb({
    id,
    name,
    toolId,
    modelId,
    accessMethod,
    channel,
    entitlementName,
    entitlementSourceUrl,
    entitlementCheckedAt,
    notes,
    pricingBasisKind,
    pricingVersionId,
    pricingBasisCheckedAt,
    createdAt: now,
  });

  return getAiResource(id);
}

/*
 * Partial update. Only the business fields a caller sends are
 * changed; status is not among them, so it can never be modified
 * through the generic update path. An explicit null clears an
 * optional value; a missing key leaves the column alone.
 */
export function updateAiResource(
  id: string,
  input: {
    name?: string;
    toolId?: string | null;
    modelId?: string;
    accessMethod?: AiResourceAccessMethod;
    channel?: AiResourceChannel;
    entitlementName?: string | null;
    entitlementSourceUrl?: string | null;
    entitlementCheckedAt?: string | null;
    notes?: string | null;
    pricingBasisKind?: AiResourcePricingBasisKind | null;
    pricingVersionId?: string | null;
    pricingBasisCheckedAt?: string | null;
  }
): ReturnType<typeof getAiResource> {
  initDb();

  const resourceId = requiredText(id, "resource id");
  const existing = requireResource(resourceId);

  const toolId =
    input.toolId === undefined
      ? existing.tool_id
      : assertToolExists(input.toolId);
  const modelId =
    input.modelId === undefined
      ? existing.model_id
      : assertModelExists(input.modelId);
  const accessMethod =
    input.accessMethod === undefined
      ? existing.access_method
      : assertOneOf(
          input.accessMethod,
          ACCESS_METHODS,
          "INVALID_ACCESS_METHOD",
          "access_method"
        );
  const channel =
    input.channel === undefined
      ? existing.channel
      : assertOneOf(
          input.channel,
          CHANNELS,
          "INVALID_CHANNEL",
          "channel"
        );
  const pricingBasisKind =
    input.pricingBasisKind === undefined
      ? existing.pricing_basis_kind
      : input.pricingBasisKind === null
        ? "none"
        : assertOneOf(
            input.pricingBasisKind,
            PRICING_BASIS_KINDS,
            "INVALID_PRICING_BASIS",
            "pricing_basis_kind"
          );
  const pricingVersionId =
    input.pricingVersionId === undefined
      ? existing.pricing_version_id
      : input.pricingVersionId === null
        ? null
        : assertPricingVersionExists(
            input.pricingVersionId
          );
  const pricingBasisCheckedAt =
    input.pricingBasisCheckedAt === undefined
      ? existing.pricing_basis_checked_at
      : optionalText(
          input.pricingBasisCheckedAt,
          "pricing_basis_checked_at"
        );

  /*
   * The fact and its reference must agree after the update. Switching
   * a resource to 'none' while a pinned rate card survives is refused;
   * the caller clears pricingVersionId explicitly (null) at the same
   * time to record "no pricing basis".
   */
  if (
    pricingVersionId !== null &&
    pricingBasisKind === "none"
  ) {
    fail(
      "INVALID_PRICING_BASIS",
      "pricing_version_id cannot be set when pricing_basis_kind is none"
    );
  }

  if (
    toolId !== existing.tool_id ||
    modelId !== existing.model_id ||
    accessMethod !== existing.access_method
  ) {
    assertNoDuplicate(
      modelId,
      toolId,
      accessMethod,
      resourceId
    );
  }

  const patch: UpdateAiResourceInput = {
    updatedAt: new Date().toISOString(),
  };

  if (input.name !== undefined) {
    patch.name = requiredText(
      input.name,
      "resource name"
    );
  }

  if (input.toolId !== undefined) {
    patch.toolId = toolId;
  }

  if (input.modelId !== undefined) {
    patch.modelId = modelId;
  }

  if (input.accessMethod !== undefined) {
    patch.accessMethod = accessMethod;
  }

  if (input.channel !== undefined) {
    patch.channel = channel;
  }

  if (input.entitlementName !== undefined) {
    patch.entitlementName = optionalText(
      input.entitlementName,
      "entitlement_name"
    );
  }

  if (input.entitlementSourceUrl !== undefined) {
    patch.entitlementSourceUrl = optionalUrl(
      input.entitlementSourceUrl,
      "entitlement_source_url"
    );
  }

  if (input.entitlementCheckedAt !== undefined) {
    patch.entitlementCheckedAt = optionalText(
      input.entitlementCheckedAt,
      "entitlement_checked_at"
    );
  }

  if (input.notes !== undefined) {
    patch.notes = optionalText(
      input.notes,
      "notes"
    );
  }

  if (input.pricingBasisKind !== undefined) {
    patch.pricingBasisKind = pricingBasisKind;
  }

  if (input.pricingVersionId !== undefined) {
    patch.pricingVersionId = pricingVersionId;
  }

  if (input.pricingBasisCheckedAt !== undefined) {
    patch.pricingBasisCheckedAt = pricingBasisCheckedAt;
  }

  updateAiResourceInDb(resourceId, patch);

  return getAiResource(resourceId);
}

/*
 * The only status change in the system. It is idempotent: archiving
 * an already-archived resource is a no-op on the values.
 */
export function archiveAiResource(
  id: string
): ReturnType<typeof getAiResource> {
  initDb();

  const resourceId = requiredText(id, "resource id");

  requireResource(resourceId);

  archiveAiResourceInDb(
    resourceId,
    new Date().toISOString()
  );

  return getAiResource(resourceId);
}