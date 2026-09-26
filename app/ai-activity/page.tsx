"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Consumer = {
  pid: number;
  processName: string;
  processPath?: string | null;
  provider: string | null;
  tool?: string | null;
  confidence?: "confirmed" | "likely" | "unknown";
  remoteAddress?: string | null;
  remotePort?: number | null;
  hostname?: string | null;
  evidence?: string[];
  score?: number;
};

type HistoryEvent = {
  id: string;
  timestamp: string;
  detectedCount: number;
  consumers: Consumer[];
};

type AIActivityResponse = {
  success?: boolean;
  timestamp?: string;
  detectedCount?: number;
  scannedProcesses?: number;
  scannedConnections?: number;
  consumers?: Consumer[];
  history?: HistoryEvent[];
  cached?: boolean;
  scanning?: boolean;
};

const INITIAL_DATA: AIActivityResponse = {
  success: true,
  timestamp: "",
  detectedCount: 0,
  scannedProcesses: 0,
  scannedConnections: 0,
  consumers: [],
  history: [],
  cached: false,
  scanning: true,
};

const REQUEST_TIMEOUT_MS = 10000;

export default function AIActivityPage() {
  const [data, setData] =
    useState<AIActivityResponse>(INITIAL_DATA);

  const [loading, setLoading] = useState(true);

  const mountedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const fetchData = useCallback(async () => {
    const controller = new AbortController();

    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(
        `/api/ai-activity?_=${Date.now()}`,
        {
          method: "GET",
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
          },
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        throw new Error(
          `Request failed: ${response.status}`
        );
      }

      const json: AIActivityResponse =
        await response.json();

      if (!mountedRef.current) {
        return;
      }

      setData({
        success: json.success ?? true,
        timestamp: json.timestamp ?? "",
        detectedCount:
          json.detectedCount ?? 0,
        scannedProcesses:
          json.scannedProcesses ?? 0,
        scannedConnections:
          json.scannedConnections ?? 0,
        consumers: json.consumers ?? [],
        history: json.history ?? [],
        cached: json.cached ?? false,
        scanning: json.scanning ?? false,
      });

      setLoading(Boolean(json.scanning));

      return Boolean(json.scanning);
    } catch (error) {
      console.error(
        "[AI Activity UI] Request failed:",
        error
      );

      if (mountedRef.current) {
        setLoading(false);
      }

      return true;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    let cancelled = false;

    const poll = async () => {
      if (cancelled) {
        return;
      }

      const scanning = await fetchData();

      if (cancelled) {
        return;
      }

      if (scanning) {
        timerRef.current = window.setTimeout(
          poll,
          1000
        );
      } else {
        timerRef.current = null;
      }
    };

    poll();

    return () => {
      cancelled = true;
      mountedRef.current = false;

      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [fetchData]);

  const handleRefresh = async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setLoading(true);

    const scanning = await fetchData();

    if (scanning) {
      timerRef.current = window.setTimeout(
        async function pollAgain() {
          if (!mountedRef.current) {
            return;
          }

          const stillScanning =
            await fetchData();

          if (
            mountedRef.current &&
            stillScanning
          ) {
            timerRef.current =
              window.setTimeout(
                pollAgain,
                1000
              );
          }
        },
        1000
      );
    }
  };

  const consumers = data.consumers ?? [];

  return (
    <div className="space-y-8 p-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">
            AI Activity Monitor
          </h1>

          {data.scanning ? (
            <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">
              Scanning
            </span>
          ) : (
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
              Ready
            </span>
          )}
        </div>

        <p className="mt-2 text-gray-500">
          Detect AI-related processes and network
          activity using local evidence.
        </p>

        {data.scanning && (
          <p className="mt-2 text-sm text-gray-500">
            Scanning your local processes and network
            activity. You can continue using the page.
          </p>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card
          title="AI Consumers"
          value={data.detectedCount ?? 0}
        />

        <Card
          title="Connections Scanned"
          value={data.scannedConnections ?? 0}
        />

        <Card
          title="Processes Scanned"
          value={data.scannedProcesses ?? 0}
        />
      </div>

      {/* AI Activity */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            🚨 Detected AI Activity
          </h2>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Scanning..." : "Refresh"}
          </button>
        </div>

        {consumers.length > 0 ? (
          consumers.map((item) => (
            <div
              key={`${item.pid}-${item.remoteAddress}-${item.remotePort}-${item.tool}-${item.provider}`}
              className="mb-3 rounded border p-4"
            >
              <div className="text-lg font-bold">
                {item.processName}
              </div>

              <div>
                PID: {item.pid}
              </div>

              <div>
                Provider:{" "}
                {item.provider ?? "Unknown"}
              </div>

              <div>
                Tool:{" "}
                {item.tool ?? "Unknown"}
              </div>

              <div>
                Confidence:{" "}
                {item.confidence ?? "unknown"}
              </div>

              {item.hostname && (
                <div>
                  Hostname: {item.hostname}
                </div>
              )}

              {item.remoteAddress && (
                <div>
                  Connection:{" "}
                  {item.remoteAddress}
                  {item.remotePort
                    ? `:${item.remotePort}`
                    : ""}
                </div>
              )}

              {typeof item.score === "number" && (
                <div>
                  Evidence score: {item.score}
                </div>
              )}

              {item.evidence &&
                item.evidence.length > 0 && (
                  <div className="mt-3">
                    <div className="font-medium">
                      Evidence
                    </div>

                    <ul className="list-disc pl-5 text-sm text-gray-600">
                      {item.evidence.map(
                        (evidence, index) => (
                          <li key={index}>
                            {evidence}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}
            </div>
          ))
        ) : (
          <div className="rounded border p-4 text-gray-600">
            {data.scanning
              ? "Scanning for reliable AI activity..."
              : "No reliable AI activity detected."}
          </div>
        )}
      </section>

      {/* History */}
      <section>
        <h2 className="mb-3 text-xl font-semibold">
          Historical AI Activity
        </h2>

        {data.history &&
        data.history.length > 0 ? (
          data.history.map((event) => (
            <div
              key={event.id}
              className="mb-3 rounded border p-4"
            >
              <div>
                {new Date(
                  event.timestamp
                ).toLocaleString()}
              </div>

              <div>
                Detected:{" "}
                {event.detectedCount}
              </div>
            </div>
          ))
        ) : (
          <p className="text-gray-500">
            No history available.
          </p>
        )}
      </section>
    </div>
  );
}

function Card({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <div className="rounded border p-4">
      <div className="text-gray-500">
        {title}
      </div>

      <div className="text-3xl font-bold">
        {value}
      </div>
    </div>
  );
}