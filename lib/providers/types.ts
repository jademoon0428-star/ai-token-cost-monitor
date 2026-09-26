export type ProviderId =
  | "openai"
  | "anthropic"
  | "openrouter";

export type ConnectorAccuracy =
  | "verified"
  | "estimated";

export type ProviderDefinition = {
  id: ProviderId;
  name: string;
  description: string;
  keyPlaceholder: string;
  requiresAdminKey: boolean;
};

export type ConnectionTestResult = {
  success: boolean;
  provider: ProviderId;
  account?: string;
  message: string;
};

export type UsageSyncResult = {
  success: boolean;
  provider: ProviderId;
  records: number;
  totalCost: number | null;
  currency: string | null;
  accuracy: ConnectorAccuracy;
  message: string;
};

export type ProviderConnector = {
  definition: ProviderDefinition;

  testConnection(
    apiKey: string
  ): Promise<ConnectionTestResult>;

  syncUsage(
    apiKey: string,
    startTime: Date,
    endTime: Date
  ): Promise<UsageSyncResult>;
};