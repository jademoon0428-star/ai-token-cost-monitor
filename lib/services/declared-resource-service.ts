import { randomUUID } from "node:crypto";

import {
  archiveDeclaredResource as archiveDeclaredResourceInDb,
  createDeclaredResource as createDeclaredResourceInDb,
  getDeclaredResource,
  listDeclaredResources as listDeclaredResourcesInDb,
  updateDeclaredResource as updateDeclaredResourceInDb,
} from "@/lib/repositories/declared-resource-repository";
import type {
  CreateDeclaredResourceInput,
  DeclaredResourceChannel,
  DeclaredResourceEntitlement,
  DeclaredResourcePricingState,
  DeclaredResourceRow,
  DeclaredResourceStatus,
  UpdateDeclaredResourceInput,
} from "@/lib/repositories/declared-resource-repository";

/*
 * Declared AI resource service.
 *
 * This service does exactly three things:
 *
 * 1. Validates input and refuses obviously invalid data.
 * 2. Keeps status as a dedicated operation, not a patch field.
 * 3. Calls the repository.
 *
 * What it deliberately does NOT do:
 *
 * - It does not compute a price, a cost or a currency figure. A
 *   declaration records only whether the user states a price is known,
 *   never a number, so there is nothing here to convert or to total.
 * - It does not judge capability, fit or quality. supports_* are
 *   stored as the same three-state facts the registry uses (0 / 1 /
 *   NULL), and an unstated capability stays unstated rather than
 *   becoming false or true.
 * - It does not recommend, auto-select, auto-run or switch anything,
 *   and it does not infer a provider from a model name.
 * - It never persists a credential, api key, token, password,
 *   balance, quota or OAuth secret.
 * - It never deletes a declaration: archiving is the only way a row
 *   leaves the active view, so a stored candidate that points at one
 *   still resolves.
 * - It never writes to models, providers, pricing_versions or
 *   ai_resources. A declaration is not a registry fact and not a
 *   verified owned resource, and presenting it as either would be a
 *   lie.
 */

export class DeclaredResourceServiceError extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string
  ) {
    super(message);
    this.code = code;
  }
}

export const DECLARED_CHANNELS: DeclaredResourceChannel[] = [
  "own_api",
  "gateway",
  "web_only",
  "unknown",
];

export const DECLARED_ENTITLEMENTS: DeclaredResourceEntitlement[] = [
  "free",
  "paid",
  "unknown",
];

export const DECLARED_PRICING_STATES: DeclaredResourcePricingState[] = [
  "known",
  "unknown",
];

function fail(
  code: string,
  message: string
): never {
  throw new DeclaredResourceServiceError(code, message);
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

function optionalText(
  value: string | null | undefined,
  label: string
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    fail(
      "INVALID_TEXT",
      `${label} must be a string or null`
    );
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

/*
 * A capability is stated, explicitly not-stated, or unknown. Only 0, 1
 * and null are accepted, so nothing can quietly turn "the user did not
 * say" into "the model cannot".
 */
function optionalCapability(
  value: number | boolean | null | undefined,
  label: string
): number | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (value === true || value === 1) {
    return 1;
  }

  if (value === false || value === 0) {
    return 0;
  }

  return fail(
    "INVALID_CAPABILITY",
    `${label} must be 1, 0 or null, got ${JSON.stringify(
      value
    )}`
  );
}

function optionalTokenCount(
  value: number | null | undefined,
  label: string
): number | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    return fail(
      "INVALID_TOKEN_COUNT",
      `${label} must be a non-negative integer or null`
    );
  }

  return value;
}

function requireDeclaredResource(
  id: string
): DeclaredResourceRow {
  const declaration = getDeclaredResource(id);

  if (declaration === undefined) {
    fail(
      "DECLARED_RESOURCE_NOT_FOUND",
      `declared resource "${id}" does not exist`
    );
  }

  return declaration;
}

export function listDeclaredResources(query: {
  status?: DeclaredResourceStatus | "all";
} = {}): DeclaredResourceRow[] {
  return listDeclaredResourcesInDb(query);
}

export function getDeclaredResourceById(
  id: string
): DeclaredResourceRow {
  return requireDeclaredResource(
    requiredText(id, "declared resource id")
  );
}

export function createDeclaredResource(input: {
  name: string;
  providerName?: string | null;
  modelName?: string | null;
  channel?: DeclaredResourceChannel;
  entitlement?: DeclaredResourceEntitlement;
  pricingState?: DeclaredResourcePricingState;
  supportsTools?: number | boolean | null;
  supportsVision?: number | boolean | null;
  supportsReasoning?: number | boolean | null;
  contextWindowTokens?: number | null;
  maxOutputTokens?: number | null;
  notes?: string | null;
}): DeclaredResourceRow {
  const name = requiredText(input.name, "resource name");
  const channel =
    input.channel === undefined
      ? "unknown"
      : assertOneOf(
          input.channel,
          DECLARED_CHANNELS,
          "INVALID_CHANNEL",
          "channel"
        );
  const entitlement =
    input.entitlement === undefined
      ? "unknown"
      : assertOneOf(
          input.entitlement,
          DECLARED_ENTITLEMENTS,
          "INVALID_ENTITLEMENT",
          "entitlement"
        );
  const pricingState =
    input.pricingState === undefined
      ? "unknown"
      : assertOneOf(
          input.pricingState,
          DECLARED_PRICING_STATES,
          "INVALID_PRICING_STATE",
          "pricing_state"
        );

  const row: CreateDeclaredResourceInput = {
    id: randomUUID(),
    name,
    providerName: optionalText(
      input.providerName,
      "provider_name"
    ),
    modelName: optionalText(
      input.modelName,
      "model_name"
    ),
    channel,
    entitlement,
    pricingState,
    supportsTools: optionalCapability(
      input.supportsTools,
      "supports_tools"
    ),
    supportsVision: optionalCapability(
      input.supportsVision,
      "supports_vision"
    ),
    supportsReasoning: optionalCapability(
      input.supportsReasoning,
      "supports_reasoning"
    ),
    contextWindowTokens: optionalTokenCount(
      input.contextWindowTokens,
      "context_window_tokens"
    ),
    maxOutputTokens: optionalTokenCount(
      input.maxOutputTokens,
      "max_output_tokens"
    ),
    notes: optionalText(input.notes, "notes"),
    createdAt: new Date().toISOString(),
  };

  createDeclaredResourceInDb(row);

  return requireDeclaredResource(row.id);
}

/*
 * Partial update. Only the business fields a caller sends are changed;
 * status is not among them, so it can never be modified through the
 * generic update path. An explicit null clears an optional value; a
 * missing key leaves the column alone.
 */
export function updateDeclaredResource(
  id: string,
  input: {
    name?: string;
    providerName?: string | null;
    modelName?: string | null;
    channel?: DeclaredResourceChannel;
    entitlement?: DeclaredResourceEntitlement;
    pricingState?: DeclaredResourcePricingState;
    supportsTools?: number | boolean | null;
    supportsVision?: number | boolean | null;
    supportsReasoning?: number | boolean | null;
    contextWindowTokens?: number | null;
    maxOutputTokens?: number | null;
    notes?: string | null;
  }
): DeclaredResourceRow {
  const declaredId = requiredText(
    id,
    "declared resource id"
  );

  requireDeclaredResource(declaredId);

  const patch: UpdateDeclaredResourceInput = {
    updatedAt: new Date().toISOString(),
  };

  if (input.name !== undefined) {
    patch.name = requiredText(input.name, "resource name");
  }

  if (input.providerName !== undefined) {
    patch.providerName = optionalText(
      input.providerName,
      "provider_name"
    );
  }

  if (input.modelName !== undefined) {
    patch.modelName = optionalText(
      input.modelName,
      "model_name"
    );
  }

  if (input.channel !== undefined) {
    patch.channel = assertOneOf(
      input.channel,
      DECLARED_CHANNELS,
      "INVALID_CHANNEL",
      "channel"
    );
  }

  if (input.entitlement !== undefined) {
    patch.entitlement = assertOneOf(
      input.entitlement,
      DECLARED_ENTITLEMENTS,
      "INVALID_ENTITLEMENT",
      "entitlement"
    );
  }

  if (input.pricingState !== undefined) {
    patch.pricingState = assertOneOf(
      input.pricingState,
      DECLARED_PRICING_STATES,
      "INVALID_PRICING_STATE",
      "pricing_state"
    );
  }

  if (input.supportsTools !== undefined) {
    patch.supportsTools = optionalCapability(
      input.supportsTools,
      "supports_tools"
    );
  }

  if (input.supportsVision !== undefined) {
    patch.supportsVision = optionalCapability(
      input.supportsVision,
      "supports_vision"
    );
  }

  if (input.supportsReasoning !== undefined) {
    patch.supportsReasoning = optionalCapability(
      input.supportsReasoning,
      "supports_reasoning"
    );
  }

  if (input.contextWindowTokens !== undefined) {
    patch.contextWindowTokens = optionalTokenCount(
      input.contextWindowTokens,
      "context_window_tokens"
    );
  }

  if (input.maxOutputTokens !== undefined) {
    patch.maxOutputTokens = optionalTokenCount(
      input.maxOutputTokens,
      "max_output_tokens"
    );
  }

  if (input.notes !== undefined) {
    patch.notes = optionalText(input.notes, "notes");
  }

  updateDeclaredResourceInDb(declaredId, patch);

  return requireDeclaredResource(declaredId);
}

/*
 * The only status change in the system. It is idempotent: archiving an
 * already-archived declaration is a no-op on the values.
 */
export function archiveDeclaredResource(
  id: string
): DeclaredResourceRow {
  const declaredId = requiredText(
    id,
    "declared resource id"
  );

  requireDeclaredResource(declaredId);

  archiveDeclaredResourceInDb(
    declaredId,
    new Date().toISOString()
  );

  return requireDeclaredResource(declaredId);
}
