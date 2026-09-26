import {
  ProviderConnector,
  ProviderDefinition,
  ProviderId,
} from "./types";

import { openaiConnector } from "./openai";
import { anthropicConnector } from "./anthropic";
import { openrouterConnector } from "./openrouter";

export const providerConnectors:
  Record<ProviderId, ProviderConnector> = {
    openai: openaiConnector,
    anthropic: anthropicConnector,
    openrouter: openrouterConnector,
  };

export function getProviderConnector(
  id: string
): ProviderConnector | null {
  if (
    id !== "openai" &&
    id !== "anthropic" &&
    id !== "openrouter"
  ) {
    return null;
  }

  return providerConnectors[id];
}

export function getProviderDefinitions():
  ProviderDefinition[] {
  return Object.values(
    providerConnectors
  ).map(
    (connector) =>
      connector.definition
  );
}