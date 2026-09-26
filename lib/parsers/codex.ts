import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

export type CodexUsageRecord = {
  id: string;
  source: "codex";

  provider: string | null;
  model: string | null;
  mode: string | null;

  timestamp: string;

  project: string | null;
  taskId: string | null;
  turnId: string | null;

  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  reasoningOutputTokens: number | null;
  totalTokens: number | null;

  sourceCost: number | null;
  currency: string | null;

  accuracy: "exact" | "calculated" | "estimated" | "unknown";

  durationMs: number | null;
  status: "completed" | "failed" | "unknown";

  sourceFile: string;
};

export type CodexParserResult = {
  records: CodexUsageRecord[];

  sessionsScanned: number;
  sessionsWithUsage: number;
  sessionsWithoutUsage: number;

  tokenUsageAvailable: boolean;

  source: "codex";
};

type JsonObject = Record<string, unknown>;

type SessionState = {
  sessionId: string | null;
  sessionTimestamp: string | null;
  cwd: string | null;
  model: string | null;
  mode: string | null;

  currentTurnId: string | null;
  currentTurnStartedAt: number | null;

  latestTokenUsage: TokenUsage | null;
  latestTokenTimestamp: string | null;

  taskComplete: TaskCompleteInfo | null;
};

type TokenUsage = {
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reasoningOutputTokens: number | null;
  totalTokens: number | null;
};

type TaskCompleteInfo = {
  turnId: string | null;
  completedAt: number | null;
  durationMs: number | null;
  failed: boolean;
};

const MAX_SESSION_FILES = 5000;

export async function parseCodexUsage(): Promise<CodexParserResult> {
  const codexHome = getCodexHome();

  if (!codexHome) {
    return emptyResult();
  }

  const sessionsPath = path.join(codexHome, "sessions");

  if (!fs.existsSync(sessionsPath)) {
    return emptyResult();
  }

  const files = await findRolloutFiles(sessionsPath);

  const records: CodexUsageRecord[] = [];

  let sessionsWithUsage = 0;
  let sessionsWithoutUsage = 0;

  for (const file of files) {
    const state = await parseSessionFile(file);

    if (!state.sessionId && !state.sessionTimestamp && !state.cwd) {
      continue;
    }

    if (state.latestTokenUsage) {
      sessionsWithUsage++;

      records.push(
        createUsageRecord(
          state,
          file,
        ),
      );
    } else {
      sessionsWithoutUsage++;
    }
  }

  return {
    records,
    sessionsScanned: files.length,
    sessionsWithUsage,
    sessionsWithoutUsage,
    tokenUsageAvailable: records.length > 0,
    source: "codex",
  };
}

function emptyResult(): CodexParserResult {
  return {
    records: [],
    sessionsScanned: 0,
    sessionsWithUsage: 0,
    sessionsWithoutUsage: 0,
    tokenUsageAvailable: false,
    source: "codex",
  };
}

function getCodexHome(): string | null {
  const configured = process.env.CODEX_HOME?.trim();

  if (configured) {
    return configured;
  }

  const home =
    process.env.USERPROFILE ||
    process.env.HOME ||
    process.env.HOMEPATH;

  if (!home) {
    return null;
  }

  return path.join(home, ".codex");
}

async function findRolloutFiles(
  sessionsPath: string,
): Promise<string[]> {
  const results: string[] = [];

  await walkDirectory(
    sessionsPath,
    results,
  );

  results.sort((a, b) => {
    try {
      const aTime = fs.statSync(a).mtimeMs;
      const bTime = fs.statSync(b).mtimeMs;

      return bTime - aTime;
    } catch {
      return 0;
    }
  });

  return results.slice(
    0,
    MAX_SESSION_FILES,
  );
}

async function walkDirectory(
  directory: string,
  results: string[],
): Promise<void> {
  if (results.length >= MAX_SESSION_FILES) {
    return;
  }

  let entries: fs.Dirent[];

  try {
    entries = await fs.promises.readdir(
      directory,
      {
        withFileTypes: true,
      },
    );
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= MAX_SESSION_FILES) {
      return;
    }

    const fullPath = path.join(
      directory,
      entry.name,
    );

    if (entry.isDirectory()) {
      await walkDirectory(
        fullPath,
        results,
      );

      continue;
    }

    if (
      entry.isFile() &&
      /^rollout-.*\.jsonl$/i.test(entry.name)
    ) {
      results.push(fullPath);
    }
  }
}

async function parseSessionFile(
  filePath: string,
): Promise<SessionState> {
  const state: SessionState = {
    sessionId: null,
    sessionTimestamp: null,
    cwd: null,
    model: null,
    mode: null,

    currentTurnId: null,
    currentTurnStartedAt: null,

    latestTokenUsage: null,
    latestTokenTimestamp: null,

    taskComplete: null,
  };

  let stream: fs.ReadStream;

  try {
    stream = fs.createReadStream(
      filePath,
      {
        encoding: "utf8",
      },
    );
  } catch {
    return state;
  }

  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  try {
    for await (const line of rl) {
      if (!line.trim()) {
        continue;
      }

      const json = parseJsonObject(line);

      if (!json) {
        continue;
      }

      inspectEvent(
        json,
        state,
      );
    }
  } catch {
    // Ignore malformed/incomplete session files.
  } finally {
    rl.close();
    stream.destroy();
  }

  return state;
}

function inspectEvent(
  json: JsonObject,
  state: SessionState,
): void {
  const type = stringValue(json.type);

  if (type === "session_meta") {
    inspectSessionMeta(
      json,
      state,
    );

    return;
  }

  if (type === "turn_context") {
    inspectTurnContext(
      json,
      state,
    );

    return;
  }

  if (type === "event_msg") {
    inspectEventMessage(
      json,
      state,
    );
  }
}

function inspectSessionMeta(
  json: JsonObject,
  state: SessionState,
): void {
  const payload = objectValue(
    json.payload,
  );

  if (!payload) {
    return;
  }

  state.sessionId =
    stringValue(payload.id) ??
    state.sessionId;

  state.sessionTimestamp =
    stringValue(payload.timestamp) ??
    stringValue(json.timestamp) ??
    state.sessionTimestamp;

  state.cwd =
    stringValue(payload.cwd) ??
    state.cwd;
}

function inspectTurnContext(
  json: JsonObject,
  state: SessionState,
): void {
  const payload = objectValue(
    json.payload,
  );

  if (!payload) {
    return;
  }

  state.cwd =
    stringValue(payload.cwd) ??
    state.cwd;

  state.model =
    stringValue(payload.model) ??
    state.model;

  state.mode =
    stringValue(payload.mode) ??
    state.mode;

  const turnId =
    stringValue(payload.turn_id) ??
    stringValue(payload.turnId);

  if (turnId) {
    state.currentTurnId = turnId;
  }

  const startedAt =
    numberValue(payload.started_at) ??
    numberValue(payload.startedAt) ??
    numberValue(payload.started_at_ms) ??
    numberValue(payload.startedAtMs);

  if (startedAt !== null) {
    state.currentTurnStartedAt =
      startedAt;
  }
}

function inspectEventMessage(
  json: JsonObject,
  state: SessionState,
): void {
  const payload = objectValue(
    json.payload,
  );

  if (!payload) {
    return;
  }

  const payloadType =
    stringValue(payload.type);

  if (payloadType === "token_count") {
    const info = objectValue(
      payload.info,
    );

    if (!info) {
      return;
    }

    const usage =
      objectValue(
        info.last_token_usage,
      );

    if (!usage) {
      return;
    }

    state.latestTokenUsage =
      extractTokenUsage(usage);

    state.latestTokenTimestamp =
      stringValue(json.timestamp) ??
      state.latestTokenTimestamp;

    return;
  }

  if (payloadType === "task_started") {
    const turnId =
      stringValue(payload.turn_id) ??
      stringValue(payload.turnId);

    if (turnId) {
      state.currentTurnId =
        turnId;
    }

    const startedAt =
      numberValue(payload.started_at) ??
      numberValue(payload.startedAt) ??
      numberValue(payload.started_at_ms) ??
      numberValue(payload.startedAtMs);

    if (startedAt !== null) {
      state.currentTurnStartedAt =
        startedAt;
    }

    return;
  }

  if (payloadType === "task_complete") {
    const turnId =
      stringValue(payload.turn_id) ??
      stringValue(payload.turnId);

    const completedAt =
      numberValue(payload.completed_at) ??
      numberValue(payload.completedAt);

    const durationMs =
      numberValue(payload.duration_ms) ??
      numberValue(payload.durationMs);

    const error =
      objectValue(payload.error);

    state.taskComplete = {
      turnId:
        turnId ??
        state.currentTurnId,

      completedAt,

      durationMs,

      failed:
        Boolean(error),
    };
  }
}

function extractTokenUsage(
  usage: JsonObject,
): TokenUsage {
  return {
    inputTokens:
      numberValue(usage.input_tokens) ??
      numberValue(usage.inputTokens),

    cachedInputTokens:
      numberValue(usage.cached_input_tokens) ??
      numberValue(usage.cachedInputTokens),

    outputTokens:
      numberValue(usage.output_tokens) ??
      numberValue(usage.outputTokens),

    reasoningOutputTokens:
      numberValue(
        usage.reasoning_output_tokens,
      ) ??
      numberValue(
        usage.reasoningOutputTokens,
      ),

    totalTokens:
      numberValue(usage.total_tokens) ??
      numberValue(usage.totalTokens),
  };
}

function createUsageRecord(
  state: SessionState,
  sourceFile: string,
): CodexUsageRecord {
  const usage =
    state.latestTokenUsage;

  const timestamp =
    state.latestTokenTimestamp ??
    state.sessionTimestamp ??
    new Date().toISOString();

  const sessionId =
    state.sessionId ??
    createStableId(
      sourceFile,
      timestamp,
    );

  const turnId =
    state.taskComplete?.turnId ??
    state.currentTurnId ??
    null;

  const id = [
    "codex",
    sessionId,
    turnId ?? "session",
    timestamp,
  ].join(":");

  const status =
    state.taskComplete === null
      ? "unknown"
      : state.taskComplete.failed
        ? "failed"
        : "completed";

  return {
    id,

    source: "codex",

    provider: "openai",

    model: state.model,

    mode: state.mode,

    timestamp,

    project: state.cwd,

    taskId: sessionId,

    turnId,

   inputTokens:
  usage?.inputTokens ?? 0,


outputTokens:
  usage?.outputTokens ?? 0,


cachedInputTokens:
  usage?.cachedInputTokens ?? 0,


reasoningOutputTokens:
  usage?.reasoningOutputTokens ?? 0,


totalTokens:
  usage?.totalTokens ?? 0,

    // Codex local rollout logs currently
    // do not provide a trustworthy source
    // cost in the inspected format.
    sourceCost: null,

    currency: null,

    accuracy: "unknown",

    durationMs:
      state.taskComplete?.durationMs ??
      null,

    status,

    sourceFile,
  };
}

function createStableId(
  sourceFile: string,
  timestamp: string,
): string {
  return [
    "codex",
    sourceFile,
    timestamp,
  ].join(":");
}

function parseJsonObject(
  line: string,
): JsonObject | null {
  try {
    const parsed: unknown =
      JSON.parse(line);

    return objectValue(parsed);
  } catch {
    return null;
  }
}

function objectValue(
  value: unknown,
): JsonObject | null {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return value as JsonObject;
  }

  return null;
}

function stringValue(
  value: unknown,
): string | null {
  return typeof value === "string"
    ? value
    : null;
}

function numberValue(
  value: unknown,
): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  return null;
}