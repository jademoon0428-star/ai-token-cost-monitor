export type UsageAccuracy = "verified" | "estimated";

export type UsageSource =
  | "official_api"
  | "official_export"
  | "application"
  | "sdk"
  | "gateway"
  | "local_estimate";

export interface NormalizedUsage {
  id?: string;
  provider: string;
  model: string;
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  application?: string;
  project?: string;
  source: UsageSource;
  accuracy: UsageAccuracy;
}
