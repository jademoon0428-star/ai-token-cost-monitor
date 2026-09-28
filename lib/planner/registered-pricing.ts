/*
 * R3.4-C1 The single authority on the nominal pricing basis of one
 * registered resource (B3-1, R3.4).
 *
 * This is the one and only place the three-way decision is made. The
 * combination-planner persistence (combination-service) and the
 * task-AI-options planner (planner-service) both call it, so a model
 * the user owns as a registered resource is priced identically at
 * every planner entry point.
 *
 *   pricing_basis_kind 'registry' + a pinned pricing_version_id: the
 *     exact pinned card is the basis. Nothing is resolved from the
 *     instant, and a card the pricing instant does not fall inside is
 *     still handed over - the estimator refuses to price it, which is
 *     the honest answer.
 *   pricing_basis_kind 'registry' + no pin: the registry card in force
 *     at the given instant, exactly the old behaviour.
 *   pricing_basis_kind 'none': no nominal pricing basis. No registry
 *     rate is resolved at all, so a planned cost that needs nominal
 *     pricing stays Unknown. Historical evidence is never converted
 *     into a nominal rate here or anywhere below.
 */
import type { AiResourceRow } from "@/lib/repositories/ai-resource-repository";
import {
  getRegistryPricingById,
  resolveRegistryPricing,
  type RegistryPricingRow,
} from "@/lib/registry/ai-registry-repository";

export function resolveRegisteredPricing(
  resource: AiResourceRow,
  at: string
): RegistryPricingRow | null {
  if (resource.pricing_basis_kind === "none") {
    return null;
  }

  if (resource.pricing_version_id !== null) {
    return getRegistryPricingById(
      resource.pricing_version_id
    );
  }

  return resolveRegistryPricing(
    resource.model_id,
    at
  );
}