import type {
  AIConsumer,
  TcpScanStatus,
} from "@/lib/detection/ai-consumer";

export type AIActivityCache = {
  timestamp: string;
  scannedProcesses: number;
  scannedConnections: number;
  tcpScanStatus: TcpScanStatus;
  aiConsumers: AIConsumer[];
};

export const AI_ACTIVITY_CACHE_TTL =
  20 * 1000;

let cache: AIActivityCache | null = null;

export function getAIActivityCache(): AIActivityCache | null {
  return cache;
}

export function setAIActivityCache(
  data: AIActivityCache
): void {
  cache = data;
}

export function hasAIActivityCache(): boolean {
  return cache !== null && cache.timestamp !== "";
}

export function isAIActivityCacheFresh(
  data: AIActivityCache | null
): boolean {
  if (!data?.timestamp) {
    return false;
  }

  const timestamp =
    new Date(data.timestamp).getTime();

  return (
    Number.isFinite(timestamp) &&
    Date.now() - timestamp >= 0 &&
    Date.now() - timestamp <
      AI_ACTIVITY_CACHE_TTL
  );
}