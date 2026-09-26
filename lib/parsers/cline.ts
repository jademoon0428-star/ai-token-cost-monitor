import fs from "fs/promises";
import path from "path";

export type ClineUsageRecord = {
  id: string;

  timestamp: string;

  provider: string | null;
  model: string | null;
  mode: string | null;

  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;

  sourceCost: number | null;

  accuracy: "exact" | "calculated" | "estimated" | "unknown";

  source: "cline";
  sourceFile: string;
  taskId: string;
};

type ClineTaskEntry = {
  ts?: number;

  modelInfo?: {
    modelId?: string;
    providerId?: string;
    mode?: string;
  };

  metrics?: {
    tokens?: {
      prompt?: number;
      completion?: number;
      cached?: number;
    };

    cost?: number;
  };
};

const CLINE_GLOBAL_STORAGE = path.join(
  process.env.APPDATA ?? "",
  "Code",
  "User",
  "globalStorage",
  "saoudrizwan.claude-dev"
);

const CLINE_TASKS_DIR = path.join(
  CLINE_GLOBAL_STORAGE,
  "tasks"
);

function toNumber(value: unknown): number {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function toTimestamp(ts: unknown): string {
  const numericTs = toNumber(ts);

  if (numericTs > 0) {
    const date = new Date(numericTs);

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return new Date(0).toISOString();
}

async function getTaskDirectories(): Promise<string[]> {
  try {
    const entries = await fs.readdir(
      CLINE_TASKS_DIR,
      {
        withFileTypes: true,
      }
    );

    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        path.join(
          CLINE_TASKS_DIR,
          entry.name
        )
      );
  } catch {
    return [];
  }
}

async function readTaskFile(
  taskDirectory: string
): Promise<ClineUsageRecord[]> {
  const taskId = path.basename(taskDirectory);

  const filePath = path.join(
    taskDirectory,
    "api_conversation_history.json"
  );

  try {
    const content = await fs.readFile(
      filePath,
      "utf8"
    );

    const parsed: unknown = JSON.parse(
      content
    );

    if (!Array.isArray(parsed)) {
      return [];
    }

    const records: ClineUsageRecord[] = [];

    for (let index = 0; index < parsed.length; index++) {
      const entry =
        parsed[index] as ClineTaskEntry;

      if (
        !entry ||
        typeof entry !== "object"
      ) {
        continue;
      }

      if (
        !entry.modelInfo ||
        !entry.metrics
      ) {
        continue;
      }

      const provider =
        typeof entry.modelInfo.providerId ===
        "string"
          ? entry.modelInfo.providerId
          : null;

      const model =
        typeof entry.modelInfo.modelId ===
        "string"
          ? entry.modelInfo.modelId
          : null;

      const mode =
        typeof entry.modelInfo.mode ===
        "string"
          ? entry.modelInfo.mode
          : null;

      const promptTokens =
        toNumber(
          entry.metrics.tokens?.prompt
        );

      const completionTokens =
        toNumber(
          entry.metrics.tokens?.completion
        );

      const cachedTokens =
        toNumber(
          entry.metrics.tokens?.cached
        );

      const hasSourceCost =
        typeof entry.metrics.cost ===
          "number" &&
        Number.isFinite(
          entry.metrics.cost
        );

      const sourceCost =
        hasSourceCost
          ? entry.metrics.cost!
          : null;

      /*
       * Cline 已经在本地记录了 cost。
       * 因此 V1 不重新猜价格。
       *
       * exact 的含义是：
       * “这里存在来源程序自己报告的成本”
       * 而不是声称这是支付账单最终金额。
       */
      const accuracy =
        sourceCost !== null
          ? "exact"
          : promptTokens > 0 ||
            completionTokens > 0 ||
            cachedTokens > 0
          ? "calculated"
          : "unknown";

      const timestamp =
        toTimestamp(entry.ts);

      const id = [
        "cline",
        taskId,
        entry.ts ?? index,
        model ?? "unknown",
        sourceCost ?? "nocost",
      ].join("-");

      records.push({
        id,

        timestamp,

        provider,

        model,

        mode,

        promptTokens,

        completionTokens,

        cachedTokens,

        sourceCost,

        accuracy,

        source: "cline",

        sourceFile: filePath,

        taskId,
      });
    }

    return records;
  } catch {
    return [];
  }
}

export async function parseClineUsage(): Promise<
  ClineUsageRecord[]
> {
  const taskDirectories =
    await getTaskDirectories();

  const allRecords: ClineUsageRecord[] =
    [];

  for (const taskDirectory of taskDirectories) {
    const records =
      await readTaskFile(
        taskDirectory
      );

    allRecords.push(...records);
  }

  /*
   * 防止相同任务数据重复进入结果。
   */
  const uniqueRecords =
    new Map<
      string,
      ClineUsageRecord
    >();

  for (const record of allRecords) {
    uniqueRecords.set(
      record.id,
      record
    );
  }

  return Array.from(
    uniqueRecords.values()
  ).sort(
    (a, b) =>
      new Date(b.timestamp).getTime() -
      new Date(a.timestamp).getTime()
  );
}

export async function getClineUsageSummary() {
  const records =
    await parseClineUsage();

  let completionTokens = 0;
  let cachedTokens = 0;
  let promptTokens = 0;
  let sourceCost = 0;

  let sourceCostCount = 0;

  const providers = new Set<string>();
  const models = new Set<string>();
  const tasks = new Set<string>();

  for (const record of records) {
    promptTokens += record.promptTokens;

    completionTokens +=
      record.completionTokens;

    cachedTokens +=
      record.cachedTokens;

    if (record.sourceCost !== null) {
      sourceCost += record.sourceCost;
      sourceCostCount++;
    }

    if (record.provider) {
      providers.add(record.provider);
    }

    if (record.model) {
      models.add(record.model);
    }

    tasks.add(record.taskId);
  }

  return {
    source: "cline" as const,

    records: records.length,

    tasks: tasks.size,

    providers: Array.from(providers),

    models: Array.from(models),

    promptTokens,

    completionTokens,

    cachedTokens,

    sourceCost:
      sourceCostCount > 0
        ? sourceCost
        : null,

    sourceCostRecords:
      sourceCostCount,

    accuracy:
      sourceCostCount > 0
        ? ("exact" as const)
        : records.length > 0
        ? ("calculated" as const)
        : ("unknown" as const),

    recordsData: records,
  };
}