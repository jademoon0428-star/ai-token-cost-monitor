/*
 * AI Resource Universe (read-only view).
 *
 * This module turns two existing, separately-owned inventories into
 * one list of everything a planned step could plausibly be run on:
 *
 *   registered  a registry model the user also owns as an active
 *               ai_resources row
 *   registry    a registry model with no such row
 *
 * It is pure. Every input arrives as an argument, nothing is read from
 * a database, no clock is consulted and no network is touched: the
 * same inputs always produce the same output.
 *
 * The universe carries FACTS and nothing else. There is no score, no
 * rank, no verdict, no recommendation and no ordering implied by
 * position. In particular, a source is a provenance label, not a
 * quality: "registry" does not mean unowned, only not owned through
 * this app.
 *
 * The one rule this module exists to enforce: unknown stays unknown.
 * A registry model with no entitlement record is not free. A resource
 * with no channel record is not callable. A model with no capability
 * row is not incapable. Every derived state below has an explicit
 * "unknown" arm and it is taken whenever the fact is absent.
 */
import type {
  RegistryModel,
} from "@/lib/registry/ai-registry-repository";
import type {
  AiResourceChannel,
  AiResourceRow,
} from "@/lib/repositories/ai-resource-repository";
import type {
  PlannerCapabilityFacts,
} from "@/lib/planner/fit-estimator";

/*
 * Where a candidate came from. stored as plain text so a reader never
 * has to infer it from which id column happens to be non-null.
 */
export type ResourceSource =
  | "registered"
  | "registry";

/*
 * Whether the user currently holds this resource inside this app. Only
 * an active ai_resources row makes a resource "registered": a model
 * that merely exists in the registry is not registered.
 */
export type ResourceRegistrationState =
  | "registered"
  | "not_registered";

/*
 * What the user says they pay. free / paid come from a recorded
 * entitlement; "unknown" is the answer for anything without one, and it
 * is never resolved to free.
 */
export type ResourceEntitlementState =
  | "free"
  | "paid"
  | "unknown";

/*
 * Whether this app could actually run the step on this resource.
 *
 *   callable            own_api or gateway: a path that exists here
 *   needs_configuration a registry model with no resource row yet
 *   external            something this app can describe but not reach
 *                       (web_only)
 *   unknown             no channel fact recorded
 */
export type ResourceAvailabilityState =
  | "callable"
  | "needs_configuration"
  | "external"
  | "unknown";

export type ResourcePricingState =
  | "known"
  | "unknown";

export type ResourceCapabilityState =
  | "known"
  | "unknown";

/*
 * Everything currently known about one resource, as state rather than
 * as identity. It is declared on its own so the read path for a stored
 * candidate can derive exactly the same facts for a row that was
 * generated earlier, instead of rebuilding a whole universe and risking
 * a second, subtly different version of these rules.
 */
export type ResourceState = {
  source: ResourceSource;
  registrationState: ResourceRegistrationState;
  providerId: string | null;
  providerName: string | null;
  modelName: string | null;
  /*
   * What to show a human. For a registry model it is the model name
   * exactly as the registry stores it (no invented display name).
   */
  displayName: string;
  channel: AiResourceChannel;
  entitlement: ResourceEntitlementState;
  availability: ResourceAvailabilityState;
  /*
   * pricingState describes the recorded price FACTS: a rate card
   * exists for a registry model. It is not a per-plan figure. Which
   * rate actually applies at the plan's frozen instant is the
   * generator's answer to make, from the same pricing authority it
   * already uses; see candidate-generator.
   */
  pricingState: ResourcePricingState;
  capabilityState: ResourceCapabilityState;
  capabilities: PlannerCapabilityFacts | null;
};

/*
 * One row of the universe: state plus the model it describes.
 */
export type ResourceUniverseEntry = ResourceState & {
  /*
   * Stable, collision-free identity for this entry. It repeats the
   * model id. Callers key their own maps on this rather than on
   * modelId so the stored key stays the single identity they compare.
   */
  key: string;
  modelId: string | null;
  registryModel: RegistryModel | null;
};

export type ResourceUniverseInput = {
  registryModels: ReadonlyArray<RegistryModel>;
  activeResources: ReadonlyArray<AiResourceRow>;
};

/*
 * The first active resource for a model decides, in listAiResources
 * order (created_at, then id). A model may be owned by several
 * resources; candidates are per model, so picking the first keeps the
 * whole set deterministic, and it is the same rule the registered
 * pricing path already applies.
 */
function indexActiveResources(
  activeResources: ReadonlyArray<AiResourceRow>
): Map<string, AiResourceRow> {
  const byModelId = new Map<string, AiResourceRow>();

  for (const resource of activeResources) {
    if (resource.status !== "active") {
      continue;
    }

    if (!byModelId.has(resource.model_id)) {
      byModelId.set(resource.model_id, resource);
    }
  }

  return byModelId;
}

function toCapabilityFacts(
  model: RegistryModel
): PlannerCapabilityFacts | null {
  const capabilities = model.capabilities;

  if (capabilities === null) {
    return null;
  }

  return {
    supports_tools: capabilities.supports_tools,
    supports_vision: capabilities.supports_vision,
    supports_reasoning: capabilities.supports_reasoning,
    context_window_tokens:
      capabilities.context_window_tokens,
    max_output_tokens: capabilities.max_output_tokens,
  };
}

/*
 * Known only when at least one field was stated. An all-null row means
 * nothing is known, which is the same as having no row at all.
 */
function capabilityStateOf(
  facts: PlannerCapabilityFacts | null
): ResourceCapabilityState {
  if (facts === null) {
    return "unknown";
  }

  const stated =
    facts.supports_tools !== null ||
    facts.supports_vision !== null ||
    facts.supports_reasoning !== null ||
    facts.context_window_tokens !== null ||
    facts.max_output_tokens !== null;

  return stated ? "known" : "unknown";
}

function entitlementOfRegistered(
  resource: AiResourceRow
): ResourceEntitlementState {
  if (resource.access_method === "free_tier") {
    return "free";
  }

  if (
    resource.access_method === "subscription" ||
    resource.access_method === "pay_as_you_go"
  ) {
    return "paid";
  }

  return "unknown";
}

function availabilityOfRegistered(
  channel: AiResourceChannel
): ResourceAvailabilityState {
  if (
    channel === "own_api" ||
    channel === "gateway"
  ) {
    return "callable";
  }

  if (channel === "web_only") {
    return "external";
  }

  return "unknown";
}

/*
 * pricing facts for a model entry. A rate card existing is not the
 * same as a price applying: the effective window and any registered
 * pricing basis are resolved later against the plan's own instant.
 * A model with no rate card, or a registered resource with no pricing
 * basis, is reported as unknown rather than as free.
 */
function modelPricingState(
  model: RegistryModel,
  resource: AiResourceRow | undefined
): ResourcePricingState {
  if (resource !== undefined) {
    return resource.pricing_basis_kind === "registry"
      ? "known"
      : "unknown";
  }

  return model.pricing.length > 0 ? "known" : "unknown";
}

/*
 * The facts about one registry model, with or without an owning active
 * resource. Shared by the universe builder and by the read path for a
 * stored candidate, so a row generated earlier is described with the
 * same rules the generator used.
 */
export function deriveModelState(
  model: RegistryModel | undefined,
  resource: AiResourceRow | undefined
): ResourceState {
  const source: ResourceSource =
    resource === undefined ? "registry" : "registered";
  const channel: AiResourceChannel =
    resource === undefined ? "unknown" : resource.channel;
  const capabilities =
    model === undefined ? null : toCapabilityFacts(model);

  return {
    source,
    registrationState:
      resource === undefined
        ? "not_registered"
        : "registered",
    providerId: model?.provider_id ?? null,
    providerName: model?.provider_name ?? null,
    modelName: model?.name ?? null,
    displayName: model?.name ?? "",
    channel,
    entitlement:
      resource === undefined
        ? "unknown"
        : entitlementOfRegistered(resource),
    availability:
      resource === undefined
        ? "needs_configuration"
        : availabilityOfRegistered(channel),
    pricingState:
      model === undefined
        ? "unknown"
        : modelPricingState(model, resource),
    capabilityState: capabilityStateOf(capabilities),
    capabilities,
  };
}

function buildModelEntry(
  model: RegistryModel,
  resource: AiResourceRow | undefined
): ResourceUniverseEntry {
  return {
    key: model.id,
    ...deriveModelState(model, resource),
    modelId: model.id,
    registryModel: model,
  };
}

/*
 * Lifts one plain registry model into a universe entry with no owning
 * resource, for a caller that holds the AI Registry and nothing else.
 * It is the same derivation a full universe uses, with no resource
 * passed, so there is one candidate path rather than a second one for
 * the registry-only case.
 */
export function buildRegistryEntry(
  model: RegistryModel
): ResourceUniverseEntry {
  return buildModelEntry(model, undefined);
}

/*
 * Builds the universe.
 *
 * Model entries come in whatever order the caller's registry arrived in
 * (listAiRegistry gives provider name then model name). That order is
 * an enumeration, not a ranking: nothing here compares two entries.
 *
 * Archived resources are excluded by the caller, which passes the
 * active list; this function additionally skips any non-active row it
 * is handed, so an archived row can never rejoin the candidate set
 * through a stale input.
 */
export function buildResourceUniverse(
  input: ResourceUniverseInput
): ResourceUniverseEntry[] {
  const activeByModelId = indexActiveResources(
    input.activeResources
  );

  return input.registryModels.map((model) =>
    buildModelEntry(
      model,
      activeByModelId.get(model.id)
    )
  );
}
