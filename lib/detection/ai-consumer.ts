import { execFile } from "child_process";
import { promisify } from "util";
import dns from "dns/promises";

import {
  getAIActivityCache,
  isAIActivityCacheFresh,
} from "@/lib/cache/ai-activity-cache";
import type {
  AIActivityCache,
} from "@/lib/cache/ai-activity-cache";

const execFileAsync = promisify(execFile);

const WINDOWS_PROCESS_TIMEOUT_MS =
  5 * 1000;

const WINDOWS_CONNECTION_TIMEOUT_MS =
  8 * 1000;

const DNS_TIMEOUT_MS =
  1500;

const DNS_CONCURRENCY = 8;

export type Confidence =
  | "confirmed"
  | "likely"
  | "unknown";

type ProcessInfo = {
  pid: number;
  name: string;
  path: string | null;
  commandLine: string | null;
};

type ConnectionInfo = {
  pid: number;
  remoteAddress: string;
  remotePort: number;
  state: string;
};

type WindowsProcessRow = {
  ProcessId?: unknown;
  Name?: unknown;
  ExecutablePath?: unknown;
  CommandLine?: unknown;
};

type WindowsConnectionRow = {
  OwningProcess?: unknown;
  RemoteAddress?: unknown;
  RemotePort?: unknown;
  State?: unknown;
};

export type TcpScanStatus =
  | "complete"
  | "timeout"
  | "failed";

export type AIConsumer = {
  pid: number;
  processName: string;
  processPath: string | null;

  // IMPORTANT:
  // Command lines may contain API keys or other secrets.
  // We only return a sanitized version.
  commandLine: string | null;

  remoteAddress: string | null;
  remotePort: number | null;
  hostname: string | null;

  provider: string | null;
  tool: string | null;

  confidence: Confidence;

  // Human-readable evidence explaining why this process matched.
  evidence: string[];

  // Internal diagnostic score.
  score: number;
};

type ProviderDefinition = {
  name: string;
  domains: string[];
};

const AI_PROVIDERS: ProviderDefinition[] = [
  {
    name: "OpenAI",
    domains: [
      "openai.com",
      "api.openai.com",
      "chatgpt.com",
    ],
  },
  {
    name: "Anthropic",
    domains: [
      "anthropic.com",
      "api.anthropic.com",
      "claude.ai",
    ],
  },
  {
    name: "DeepSeek",
    domains: [
      "deepseek.com",
      "api.deepseek.com",
    ],
  },
  {
    name: "Google Gemini",
    domains: [
      "googleapis.com",
      "generativelanguage.googleapis.com",
      "gemini.google.com",
    ],
  },
  {
    name: "Mistral",
    domains: [
      "mistral.ai",
      "api.mistral.ai",
    ],
  },
  {
    name: "Groq",
    domains: [
      "groq.com",
      "api.groq.com",
    ],
  },
  {
    name: "Cohere",
    domains: [
      "cohere.com",
      "api.cohere.ai",
    ],
  },
  {
    name: "OpenRouter",
    domains: [
      "openrouter.ai",
      "api.openrouter.ai",
    ],
  },
  {
    name: "Together AI",
    domains: [
      "together.ai",
      "api.together.xyz",
    ],
  },
  {
    name: "Perplexity",
    domains: [
      "perplexity.ai",
      "api.perplexity.ai",
    ],
  },
];

/*
 * Actual AI coding / AI client indicators.
 *
 * IMPORTANT:
 * "code" is intentionally NOT included.
 *
 * Ordinary VS Code is not proof of AI activity.
 */
const AI_TOOL_KEYWORDS = [
  "cursor",
  "cline",
  "copilot",
  "codeium",
  "windsurf",
  "continue",
  "roo-code",
  "roo_cline",
  "roo-cline",
  "aider",
  "claude-code",
  "claude",
  "github-copilot",
];

/*
 * Provider / API indicators that may appear inside
 * process metadata.
 *
 * These are evidence only.
 * They do NOT prove that money was spent.
 */
const AI_API_KEYWORDS = [
  "openai",
  "api.openai.com",

  "anthropic",
  "api.anthropic.com",

  "deepseek",
  "api.deepseek.com",

  "generativelanguage.googleapis.com",
  "gemini",

  "mistral",
  "api.mistral.ai",

  "groq",
  "api.groq.com",

  "cohere",
  "api.cohere.ai",

  "openrouter",
  "api.openrouter.ai",

  "together.ai",
  "api.together.xyz",

  "perplexity",
  "api.perplexity.ai",
];

/*
 * Generic runtime processes are NOT AI evidence.
 *
 * They are useful context because AI tools often run through
 * node.exe, python.exe, Code.exe, Chrome, Electron, etc.
 */
const GENERIC_RUNTIME_PROCESSES = new Set([
  "node.exe",
  "python.exe",
  "python3.exe",
  "code.exe",
  "chrome.exe",
  "msedge.exe",
  "electron.exe",
]);

const hostnameCache = new Map<
  string,
  {
    hostname: string | null;
    expiresAt: number;
  }
>();

const HOSTNAME_CACHE_TTL =
  10 * 60 * 1000;

function normalizeArray<T>(
  value: T | T[] | null | undefined
): T[] {
  if (value == null) {
    return [];
  }

  return Array.isArray(value)
    ? value
    : [value];
}

function cleanString(
  value: unknown
): string | null {
  if (
    typeof value !== "string" ||
    value.trim() === ""
  ) {
    return null;
  }

  return value.trim();
}

function parseNumber(
  value: unknown
): number | null {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function isPrivateOrLocalAddress(
  address: string
): boolean {
  const value = address
    .trim()
    .toLowerCase();

  if (
    value === "localhost" ||
    value === "::1" ||
    value === "0.0.0.0" ||
    value === "::"
  ) {
    return true;
  }

  if (value.startsWith("127.")) {
    return true;
  }

  if (value.startsWith("10.")) {
    return true;
  }

  if (value.startsWith("192.168.")) {
    return true;
  }

  const match = value.match(
    /^172\.(\d{1,3})\./
  );

  if (match) {
    const secondOctet =
      Number(match[1]);

    if (
      secondOctet >= 16 &&
      secondOctet <= 31
    ) {
      return true;
    }
  }

  if (
    value.startsWith("169.254.")
  ) {
    return true;
  }

  if (
    value.startsWith("fe80:") ||
    value.startsWith("fc") ||
    value.startsWith("fd")
  ) {
    return true;
  }

  return false;
}

async function resolveHostname(
  address: string
): Promise<string | null> {
  if (
    isPrivateOrLocalAddress(address)
  ) {
    return null;
  }

  const cached =
    hostnameCache.get(address);

  if (
    cached &&
    cached.expiresAt > Date.now()
  ) {
    return cached.hostname;
  }

  try {
    const hostnames =
      await Promise.race([
        dns.reverse(address),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(
              new Error(
                "DNS lookup timed out."
              )
            );
          }, DNS_TIMEOUT_MS);
        }),
      ]);

    const hostname =
      hostnames.length > 0
        ? hostnames[0]
        : null;

    hostnameCache.set(address, {
      hostname,
      expiresAt:
        Date.now() +
        HOSTNAME_CACHE_TTL,
    });

    return hostname;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "DNS lookup timed out."
    ) {
      console.warn(
        `[AI Activity] DNS lookup timed out for ${address}.`
      );
    }

    hostnameCache.set(address, {
      hostname: null,
      expiresAt:
        Date.now() +
        HOSTNAME_CACHE_TTL,
    });

    return null;
  }
}

function detectProvider(
  hostname: string | null
): string | null {
  if (!hostname) {
    return null;
  }

  const value =
    hostname.toLowerCase();

  for (const provider of AI_PROVIDERS) {
    for (const domain of provider.domains) {
      if (
        value === domain ||
        value.endsWith(`.${domain}`)
      ) {
        return provider.name;
      }
    }
  }

  return null;
}

function detectTool(
  process: ProcessInfo
): string | null {
  const text = [
    process.name,
    process.path ?? "",
    process.commandLine ?? "",
  ]
    .join(" ")
    .toLowerCase();

  for (
    const keyword of AI_TOOL_KEYWORDS
  ) {
    if (text.includes(keyword)) {
      return keyword;
    }
  }

  return null;
}

function detectApiKeyword(
  process: ProcessInfo
): string | null {
  const text = [
    process.commandLine ?? "",
    process.path ?? "",
    process.name,
  ]
    .join(" ")
    .toLowerCase();

  for (
    const keyword of AI_API_KEYWORDS
  ) {
    if (text.includes(keyword)) {
      return keyword;
    }
  }

  return null;
}

function isGenericRuntime(
  processName: string
): boolean {
  return GENERIC_RUNTIME_PROCESSES.has(
    processName.toLowerCase()
  );
}

/**
 * Remove obvious secrets from command-line strings.
 *
 * We do NOT want to expose API keys in the dashboard/logs.
 */
function sanitizeCommandLine(
  commandLine: string | null
): string | null {
  if (!commandLine) {
    return null;
  }

  let value = commandLine;

  value = value.replace(
    /\bsk-ant-[A-Za-z0-9_-]{12,}\b/gi,
    "[REDACTED]"
  );

  value = value.replace(
    /\bsk-[A-Za-z0-9_-]{12,}\b/gi,
    "[REDACTED]"
  );

  value = value.replace(
    /\bAIza[0-9A-Za-z_-]{20,}\b/g,
    "[REDACTED]"
  );

  value = value.replace(
    /\b(?:api[_-]?key|token|authorization|bearer|secret)\s*[=:]\s*["']?[^"' \t]+["']?/gi,
    "$1=[REDACTED]"
  );

  if (value.length > 500) {
    value =
      value.slice(0, 500) +
      " ...";
  }

  return value;
}

async function getWindowsProcesses(): Promise<
  ProcessInfo[]
> {
  const command = `
    Get-CimInstance Win32_Process |
    Select-Object ProcessId,Name,ExecutablePath,CommandLine |
    ConvertTo-Json -Compress
  `;

  try {
  const { stdout } =
    await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        command,
      ],
      {
        windowsHide: true,
        timeout:
          WINDOWS_PROCESS_TIMEOUT_MS,
        maxBuffer:
          20 * 1024 * 1024,
      }
    );

    const raw =
      stdout.trim();

    if (!raw) {
      return [];
    }

    const parsed: unknown =
      JSON.parse(raw);

    return normalizeArray(
      parsed as WindowsProcessRow[]
    )
      .map((item: WindowsProcessRow) => ({
      pid:
        parseNumber(
          item.ProcessId
        ) ?? -1,

      name:
        cleanString(item.Name) ??
        "unknown",

      path:
        cleanString(
          item.ExecutablePath
        ),

      commandLine:
        cleanString(
          item.CommandLine
        ),
      }))
      .filter(
        (item) => item.pid > 0
      );
  } catch (error) {
    console.error(
      "[AI Activity] Process scan failed:",
      error
    );

    return [];
  }
}

async function getWindowsConnections(): Promise<{
  connections: ConnectionInfo[];
  status: TcpScanStatus;
}> {
  const command = `
    Get-NetTCPConnection -State Established |
    Select-Object OwningProcess,RemoteAddress,RemotePort,State |
    ConvertTo-Json -Compress
  `;

  try {
  const { stdout } =
    await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        command,
      ],
      {
        windowsHide: true,
        timeout:
          WINDOWS_CONNECTION_TIMEOUT_MS,
        maxBuffer:
          20 * 1024 * 1024,
      }
    );

    const raw =
      stdout.trim();

    if (!raw) {
      return {
        connections: [],
        status: "complete",
      };
    }

    const parsed: unknown =
      JSON.parse(raw);

    const connections = normalizeArray(
      parsed as WindowsConnectionRow[]
    )
      .map((item: WindowsConnectionRow) => ({
      pid:
        parseNumber(
          item.OwningProcess
        ) ?? -1,

      remoteAddress:
        cleanString(
          item.RemoteAddress
        ) ?? "",

      remotePort:
        parseNumber(
          item.RemotePort
        ) ?? 0,

      state:
        cleanString(
          item.State
        ) ?? "Unknown",
      }))
      .filter(
        (item) =>
          item.pid > 0 &&
          item.remoteAddress !== ""
      );

    return {
      connections,
      status: "complete",
    };
  } catch (error) {
    console.error(
      "[AI Activity] Connection scan failed:",
      error
    );

    const details =
      error as NodeJS.ErrnoException & {
        killed?: boolean;
        signal?: string | null;
      };

    const timedOut =
      details.killed === true ||
      details.signal === "SIGTERM" ||
      (typeof details.message === "string" &&
        details.message
          .toLowerCase()
          .includes("timed out"));

    return {
      connections: [],
      status: timedOut
        ? "timeout"
        : "failed",
    };
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(
    items.length
  );

  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex++;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await mapper(
        items[currentIndex]
      );
    }
  }

  const workerCount = Math.min(
    Math.max(1, limit),
    items.length
  );

  await Promise.all(
    Array.from(
      { length: workerCount },
      () => worker()
    )
  );

  return results;
}

export async function detectAIConsumers() {
  const timestamp =
    new Date().toISOString();
  const scanStartedAt =
    Date.now();

  /*
   * Process and network collection run in parallel.
   */
  const [
    processes,
    connectionResult,
  ] = await Promise.all([
    getWindowsProcesses(),
    getWindowsConnections(),
  ]);

  const connections =
    connectionResult.connections;

  const collectionElapsedMs =
    Date.now() - scanStartedAt;

  const processMap =
    new Map<number, ProcessInfo>();

  for (const process of processes) {
    processMap.set(
      process.pid,
      process
    );
  }

  /*
   * IMPORTANT:
   *
   * We intentionally DO NOT remove local connections.
   *
   * AI coding tools may communicate through:
   *
   *   127.0.0.1
   *   ::1
   *   localhost
   *
   * However, a local connection alone is NOT AI evidence.
   *
   * We only promote it when additional AI evidence exists.
   */

  const dnsStartedAt = Date.now();

  const uniqueAddresses =
    Array.from(
      new Set(
        connections.map(
          (connection) =>
            connection.remoteAddress
        )
      )
    );

  const hostnamesByAddress =
    new Map<string, string | null>();

  const resolvedAddresses =
    await mapWithConcurrency(
      uniqueAddresses,
      DNS_CONCURRENCY,
      async (address) => ({
        address,
        hostname:
          await resolveHostname(
            address
          ),
      })
    );

  for (const resolved of resolvedAddresses) {
    hostnamesByAddress.set(
      resolved.address,
      resolved.hostname
    );
  }

  const connectionsWithHostnames =
    connections.map((connection) => ({
      connection,
      hostname:
        hostnamesByAddress.get(
          connection.remoteAddress
        ) ?? null,
    }));

  console.log(
    `[AI Activity] Timing: collection=${collectionElapsedMs}ms, DNS=${Date.now() - dnsStartedAt}ms, total=${Date.now() - scanStartedAt}ms.`
  );

  const consumers: AIConsumer[] =
    [];

  let providerHits = 0;
  let toolHits = 0;
  let apiKeywordHits = 0;
  let localConnections = 0;
  let externalConnections = 0;

  for (
    const result of connectionsWithHostnames
  ) {
    const connection =
      result.connection;

    const process =
      processMap.get(
        connection.pid
      );

    if (!process) {
      continue;
    }

    const isLocal =
      isPrivateOrLocalAddress(
        connection.remoteAddress
      );

    if (isLocal) {
      localConnections++;
    } else {
      externalConnections++;
    }

    const hostname =
      result.hostname;

    const provider =
      detectProvider(hostname);

    const tool =
      detectTool(process);

    const apiKeyword =
      detectApiKeyword(process);

    if (provider) {
      providerHits++;
    }

    if (tool) {
      toolHits++;
    }

    if (apiKeyword) {
      apiKeywordHits++;
    }

    /*
     * ----------------------------------------------------------
     * Evidence scoring
     * ----------------------------------------------------------
     *
     * Base:
     *
     * Local/external connection       +1
     *
     * Stronger evidence:
     *
     * AI provider domain              +3
     * AI API keyword                  +3
     * AI tool/process keyword         +3
     *
     * Examples:
     *
     * Code + localhost only
     *     = 1
     *     => ignored
     *
     * Code + Cline + localhost
     *     = 4
     *     => likely
     *
     * node + DeepSeek keyword
     *     = 4
     *     => likely
     *
     * Cline + DeepSeek provider
     *     = 7+
     *     => confirmed
     *
     * This keeps ordinary VS Code / Node / Python
     * from becoming false positives.
     */

    let score = 1;

    const evidence: string[] =
      [];

    if (isLocal) {
      evidence.push(
        `Local connection: ${connection.remoteAddress}:${connection.remotePort}`
      );
    } else {
      evidence.push(
        `External connection: ${connection.remoteAddress}:${connection.remotePort}`
      );
    }

    if (provider) {
      score += 3;

      evidence.push(
        `AI provider domain: ${hostname}`
      );
    }

    if (apiKeyword) {
      score += 3;

      evidence.push(
        `AI API keyword in process metadata: ${apiKeyword}`
      );
    }

    if (tool) {
      score += 3;

      evidence.push(
        `AI tool/process keyword: ${tool}`
      );
    }

    if (
      isGenericRuntime(
        process.name
      )
    ) {
      evidence.push(
        `Generic runtime host: ${process.name}`
      );
    }

    /*
     * A connection by itself is never enough.
     *
     * This is especially important for:
     *
     * Code.exe
     * node.exe
     * python.exe
     * Chrome
     * Electron
     *
     * because these applications commonly have
     * local or external network connections.
     */
    if (
      !provider &&
      !tool &&
      !apiKeyword
    ) {
      continue;
    }

    /*
     * Minimum meaningful AI evidence.
     */
    if (score < 4) {
      continue;
    }

    let confidence: Confidence =
      "unknown";

    if (score >= 7) {
      confidence = "confirmed";
    } else if (score >= 4) {
      confidence = "likely";
    }

    /*
     * API keyword alone is useful evidence,
     * but it is not proof of actual AI spending.
     *
     * Keep it at "unknown" unless another strong
     * signal exists.
     */
    if (
      apiKeyword &&
      !tool &&
      !provider
    ) {
      confidence = "unknown";
    }

    consumers.push({
      pid: process.pid,

      processName:
        process.name,

      processPath:
        process.path,

      commandLine:
        sanitizeCommandLine(
          process.commandLine
        ),

      remoteAddress:
        connection.remoteAddress,

      remotePort:
        connection.remotePort,

      hostname,

      provider,

      tool,

      confidence,

      evidence,

      score,
    });
  }

  /*
   * Remove duplicates.
   *
   * Keep the strongest evidence for each
   * process / connection combination.
   */
  const unique =
    new Map<string, AIConsumer>();

  for (
    const consumer of consumers
  ) {
    const key = [
      consumer.pid,
      consumer.remoteAddress,
      consumer.remotePort,
      consumer.provider,
      consumer.tool,
    ].join("|");

    const existing =
      unique.get(key);

    if (
      !existing ||
      consumer.score > existing.score
    ) {
      unique.set(
        key,
        consumer
      );
    }
  }

  const finalConsumers =
    Array.from(
      unique.values()
    ).sort(
      (a, b) =>
        b.score - a.score
    );

  /*
   * ----------------------------------------------------------
   * Diagnostics
   * ----------------------------------------------------------
   */
  console.log("");

  console.log(
    "============================================================"
  );

  console.log(
    "[AI Activity] EVIDENCE SCAN"
  );

  console.log(
    "============================================================"
  );

  console.log(
    `[AI Activity] Processes scanned      : ${processes.length}`
  );

  console.log(
    `[AI Activity] Connections scanned    : ${connections.length}`
  );

  console.log(
    `[AI Activity] Local connections      : ${localConnections}`
  );

  console.log(
    `[AI Activity] External connections   : ${externalConnections}`
  );

  console.log(
    `[AI Activity] Provider hits          : ${providerHits}`
  );

  console.log(
    `[AI Activity] Tool keyword hits      : ${toolHits}`
  );

  console.log(
    `[AI Activity] API keyword hits       : ${apiKeywordHits}`
  );

  console.log(
    `[AI Activity] AI consumers           : ${finalConsumers.length}`
  );

  if (
    finalConsumers.length > 0
  ) {
    console.log("");

    console.log(
      "[AI Activity] DETECTED EVIDENCE"
    );

    for (
      const consumer of finalConsumers
    ) {
      console.log(
        `  PID ${consumer.pid} | ${consumer.processName} | score=${consumer.score} | confidence=${consumer.confidence}`
      );

      console.log(
        `    provider=${consumer.provider ?? "-"} | tool=${consumer.tool ?? "-"}`
      );

      console.log(
        `    remote=${consumer.remoteAddress ?? "-"}:${consumer.remotePort ?? "-"}`
      );

      console.log(
        `    evidence=${consumer.evidence.join("; ")}`
      );
    }
  }

  console.log(
    "============================================================"
  );

  return {
    timestamp,

    scannedProcesses:
      processes.length,

    scannedConnections:
      connections.length,

    tcpScanStatus:
      connectionResult.status,

    aiConsumers:
      finalConsumers,
  };
}

/**
 * Public entry used by /api/ai-activity.
 *
 * Uses the existing cache first so opening Activity
 * does not trigger a full Windows scan every time.
 */
export async function getAIActivity(): Promise<
  AIActivityCache
> {
  const cached =
    getAIActivityCache();

  if (
    cached &&
    isAIActivityCacheFresh(cached)
  ) {
    return cached;
  }

  return await detectAIConsumers();
}