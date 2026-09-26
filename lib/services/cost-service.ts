import {
  getCostDatabaseRecords,
  type CostDatabaseRow,
  type CostRecordProvenance,
} from "@/lib/repositories/cost-repository";

import {
  parseClineUsage,
  type ClineUsageRecord,
} from "@/lib/parsers/cline";

import {
  parseCodexUsage,
  type CodexUsageRecord,
} from "@/lib/parsers/codex";

import {
  isOfficialVerifiedRecord as isOfficialVerifiedSourceRecord,
} from "@/lib/cost-policy";

export type Period =
  | "today"
  | "7d"
  | "30d"
  | "all";

export type UnifiedRecord = {
  id: string;
  source: string;
  provenance: CostRecordProvenance;

  provider: string;
  model: string;
  mode: string | null;

  timestamp: string;

  project: string | null;
  application: string | null;
  importId: string | null;
  taskId: string | null;

  tokens: {
    input: number;
    output: number;
    cached: number;
    reasoning: number;
    total: number;
  };

  cost: {
    amount: number | null;
    currency: string | null;
  };

  accuracy:
    | "exact"
    | "calculated"
    | "estimated"
    | "unknown";
};

export type CostPeriodRange = {
  start: Date | null;
  end: Date;
};

type CostPolicy = {
  monetarySource: "official_export";
  accuracy: "verified";
  savingsEstimates: false;
  message: string;
};

const COST_POLICY: CostPolicy = {
  monetarySource: "official_export",
  accuracy: "verified",
  savingsEstimates: false,
  message:
    "Recommendations are based on verified source-reported costs. No monetary savings are estimated without reliable comparison data.",
};

const LOCAL_EVIDENCE_TIMEOUT_MS = 5000;

type TimedLocalResult<T> = {
  value: T;
  timedOut: boolean;
  failed: boolean;
};

async function runLocalEvidenceWithTimeout<T>(
  operation: Promise<T>,
  fallback: T
): Promise<TimedLocalResult<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const value = await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("Local evidence scan timed out."));
        }, LOCAL_EVIDENCE_TIMEOUT_MS);
      }),
    ]);

    return {
      value,
      timedOut: false,
      failed: false,
    };
  } catch (error) {
    return {
      value: fallback,
      timedOut:
        error instanceof Error &&
        error.message ===
          "Local evidence scan timed out.",
      failed: true,
    };
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

function normalizeString(
  value: string | null | undefined,
  fallback: string
): string {
  const normalized =
    typeof value === "string"
      ? value.trim()
      : "";

  return normalized || fallback;
}

function normalizeNullableString(
  value: string | null | undefined
): string | null {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return null;
  }

  return value.trim();
}

function toNumber(
  value: number | bigint | null | undefined
): number {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  return 0;
}

function toNullableNumber(
  value: number | bigint | null | undefined
): number | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const numeric = toNumber(value);

  return Number.isFinite(numeric)
    ? numeric
    : null;
}

function normalizeDatabaseRecord(
  row: CostDatabaseRow
): UnifiedRecord {
  const inputTokens = toNumber(
    row.input_tokens
  );

  const outputTokens = toNumber(
    row.output_tokens
  );

  const cachedTokens = toNumber(
    row.cached_tokens
  );

  const reasoningTokens = toNumber(
    row.reasoning_tokens
  );

  const totalTokens =
    inputTokens +
    outputTokens +
    reasoningTokens;

  const totalCostMicros =
    toNullableNumber(
      row.total_cost_micros
    );

  return {
    id: row.id,

    source: row.source,
    provenance:
      row.provenance,

    provider: normalizeString(
      row.provider,
      "Unknown"
    ),

    model: normalizeString(
      row.model,
      "Unknown"
    ),

    mode: null,

    timestamp: row.timestamp,

    project:
      normalizeNullableString(
        row.project
      ),

    application:
      normalizeNullableString(
        row.application
      ),

    importId:
      normalizeNullableString(
        row.import_id
      ),

    taskId: null,

    tokens: {
      input: inputTokens,
      output: outputTokens,
      cached: cachedTokens,
      reasoning: reasoningTokens,
      total: totalTokens,
    },

    cost: {
      amount:
        totalCostMicros !== null
          ? totalCostMicros / 1_000_000
          : null,

      currency:
        normalizeNullableString(
          row.currency
        ),
    },

    accuracy:
      row.accuracy === "verified"
        ? "exact"
        : row.accuracy === "exact" ||
            row.accuracy === "calculated" ||
            row.accuracy === "estimated" ||
            row.accuracy === "unknown"
          ? row.accuracy
          : "unknown",
  };
}

function normalizeClineRecord(
  record: ClineUsageRecord
): UnifiedRecord {
  const inputTokens =
    record.promptTokens;

  const outputTokens =
    record.completionTokens;

  const cachedTokens =
    record.cachedTokens;

  return {
    id: record.id,

    source: "cline",
    provenance: "unknown",

    provider: normalizeString(
      record.provider,
      "Unknown"
    ),

    model: normalizeString(
      record.model,
      "Unknown"
    ),

    mode:
      normalizeNullableString(
        record.mode
      ),

    timestamp: record.timestamp,

    project: null,

    application: "Cline",

    importId: null,

    taskId: record.taskId,

    tokens: {
      input: inputTokens,
      output: outputTokens,
      cached: cachedTokens,
      reasoning: 0,
      total:
        inputTokens +
        outputTokens +
        cachedTokens,
    },

    cost: {
      amount: record.sourceCost,
      currency: record.sourceCost !== null
        ? "USD"
        : null,
    },

    accuracy: record.accuracy,
  };
}

function normalizeCodexRecord(
  record: CodexUsageRecord
): UnifiedRecord {
  const inputTokens =
    record.inputTokens ?? 0;

  const outputTokens =
    record.outputTokens ?? 0;

  const cachedTokens =
    record.cachedInputTokens ?? 0;

  const reasoningTokens =
    record.reasoningOutputTokens ?? 0;

  const totalTokens =
    record.totalTokens ??
    inputTokens +
      outputTokens +
      reasoningTokens;

  return {
    id: record.id,

    source: "codex",
    provenance: "unknown",

    provider: normalizeString(
      record.provider,
      "Unknown"
    ),

    model: normalizeString(
      record.model,
      "Unknown"
    ),

    mode:
      normalizeNullableString(
        record.mode
      ),

    timestamp: record.timestamp,

    project:
      normalizeNullableString(
        record.project
      ),

    application: "Codex",

    importId: null,

    taskId: record.taskId,

    tokens: {
      input: inputTokens,
      output: outputTokens,
      cached: cachedTokens,
      reasoning: reasoningTokens,
      total: totalTokens,
    },

    cost: {
      amount: record.sourceCost,
      currency: record.currency,
    },

    accuracy: record.accuracy,
  };
}

function normalizeLocalRecords(
  clineRecords: ClineUsageRecord[],
  codexRecords: CodexUsageRecord[]
): UnifiedRecord[] {
  return [
    ...clineRecords.map(
      normalizeClineRecord
    ),
    ...codexRecords.map(
      normalizeCodexRecord
    ),
  ];
}

function isOfficialVerifiedRecord(
  record: UnifiedRecord
): boolean {
  return (
    isOfficialVerifiedSourceRecord(
      record.source,
      record.accuracy
    ) &&
    record.cost.amount !== null &&
    record.accuracy === "exact"
  );
}

function createRecordKey(
  record: UnifiedRecord
): string {
  return [
    record.provider,
    record.model,
    record.timestamp,
    record.tokens.input,
    record.tokens.output,
    record.tokens.cached,
    record.tokens.reasoning,
  ].join("|");
}

function mergeRecords(
  databaseRecords: UnifiedRecord[],
  localRecords: UnifiedRecord[]
): UnifiedRecord[] {
  const merged = new Map<
    string,
    UnifiedRecord
  >();

  for (const record of databaseRecords) {
    merged.set(record.id, record);
  }

  for (const localRecord of localRecords) {
    /*
     * Official database records remain authoritative
     * when the same usage has already been imported.
     */
    const duplicate = Array.from(
      merged.values()
    ).find((databaseRecord) => {
      if (
        !isOfficialVerifiedRecord(
          databaseRecord
        )
      ) {
        return false;
      }

      return (
        createRecordKey(
          databaseRecord
        ) ===
        createRecordKey(
          localRecord
        )
      );
    });

    if (duplicate) {
      continue;
    }

    if (!merged.has(localRecord.id)) {
      merged.set(
        localRecord.id,
        localRecord
      );
    }
  }

  return Array.from(
    merged.values()
  ).sort(
    (a, b) =>
      new Date(b.timestamp).getTime() -
      new Date(a.timestamp).getTime()
  );
}

function isRecordInRange(
  record: UnifiedRecord,
  range: CostPeriodRange
): boolean {
  const timestamp =
    new Date(record.timestamp).getTime();

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  if (
    range.start &&
    timestamp < range.start.getTime()
  ) {
    return false;
  }

  return (
    timestamp <= range.end.getTime()
  );
}

export function getLocalDate(
  date: Date,
  timeZone: string
): string {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  ).format(date);
}

function getUtcMidnightForLocalDate(
  localDate: string,
  timeZone: string
): Date {
  const [year, month, day] =
    localDate
      .split("-")
      .map(Number);

  const approximateUtc =
    Date.UTC(
      year,
      month - 1,
      day
    );

  let result =
    new Date(approximateUtc);

  const formatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }
    );

  const parts =
    formatter.formatToParts(
      result
    );

  const values: Record<
    string,
    number
  > = {};

  for (const part of parts) {
    if (
      part.type !== "literal"
    ) {
      values[part.type] =
        Number(part.value);
    }
  }

  const localAsUtc =
    Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second
    );

  const offset =
    localAsUtc -
    approximateUtc;

  result = new Date(
    approximateUtc - offset
  );

  return result;
}

function addDays(
  date: Date,
  days: number
): Date {
  return new Date(
    date.getTime() +
      days *
        24 *
        60 *
        60 *
        1000
  );
}

function getPeriodRange(
  period: Period,
  timeZone: string
): CostPeriodRange {
  const now = new Date();

  if (period === "all") {
    return {
      start: null,
      end: now,
    };
  }

  const localToday =
    getLocalDate(
      now,
      timeZone
    );

  const todayStart =
    getUtcMidnightForLocalDate(
      localToday,
      timeZone
    );

  if (period === "today") {
    return {
      start: todayStart,
      end: now,
    };
  }

  if (period === "7d") {
    return {
      start: addDays(
        todayStart,
        -6
      ),
      end: now,
    };
  }

  return {
    start: addDays(
      todayStart,
      -29
    ),
    end: now,
  };
}

function buildBreakdown(
  records: UnifiedRecord[]
) {
  const sourceMap = new Map<
    string,
    {
      source: string;
      cost: number;
      recordCount: number;
    }
  >();

  const providerMap = new Map<
    string,
    {
      provider: string;
      cost: number;
      recordCount: number;
    }
  >();

  const modelMap = new Map<
    string,
    {
      provider: string;
      model: string;
      cost: number;
      recordCount: number;
    }
  >();

  const dailyMap = new Map<
    string,
    number
  >();

  for (const record of records) {
    const amount =
      record.cost.amount;

    if (
      amount === null ||
      !Number.isFinite(amount)
    ) {
      continue;
    }

    const source =
      sourceMap.get(record.source) ??
      {
        source: record.source,
        cost: 0,
        recordCount: 0,
      };

    source.cost += amount;
    source.recordCount++;
    sourceMap.set(
      record.source,
      source
    );

    const provider =
      providerMap.get(
        record.provider
      ) ?? {
        provider:
          record.provider,
        cost: 0,
        recordCount: 0,
      };

    provider.cost += amount;
    provider.recordCount++;
    providerMap.set(
      record.provider,
      provider
    );

    const modelKey = [
      record.provider,
      record.model,
    ].join("|");

    const model =
      modelMap.get(modelKey) ??
      {
        provider:
          record.provider,
        model: record.model,
        cost: 0,
        recordCount: 0,
      };

    model.cost += amount;
    model.recordCount++;
    modelMap.set(
      modelKey,
      model
    );

    const date =
      record.timestamp.slice(
        0,
        10
      );

    dailyMap.set(
      date,
      (dailyMap.get(date) ?? 0) +
        amount
    );
  }

  return {
    bySource: Array.from(
      sourceMap.values()
    ).sort(
      (a, b) =>
        b.cost - a.cost
    ),

    byProvider: Array.from(
      providerMap.values()
    ).sort(
      (a, b) =>
        b.cost - a.cost
    ),

    byModel: Array.from(
      modelMap.values()
    ).sort(
      (a, b) =>
        b.cost - a.cost
    ),

    daily: Array.from(
      dailyMap.entries()
    )
      .map(
        ([date, cost]) => ({
          date,
          cost,
        })
      )
      .sort(
        (a, b) =>
          a.date.localeCompare(
            b.date
          )
      ),
  };
}

export function validateTimeZone(
  timeZone: string
): boolean {
  try {
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone,
      }
    );

    return true;
  } catch {
    return false;
  }
}

export async function getUnifiedCostData({
  period,
  timeZone,
  includeLocalEvidence,
}: {
  period: Period;
  timeZone: string;
  includeLocalEvidence: boolean;
}) {
  const range =
    getPeriodRange(
      period,
      timeZone
    );

  const databaseRecords =
  getCostDatabaseRecords({
    start: range.start,
    end: range.end,
  }).map(
    normalizeDatabaseRecord
  );

  let localRecords: UnifiedRecord[] =
    [];

  let localEvidence = {
    requested: includeLocalEvidence,
    completed: !includeLocalEvidence,
    timedOut: false,
    failed: false,
  };

  if (includeLocalEvidence) {
    const [
      clineResult,
      codexResult,
    ] = await Promise.all([
      runLocalEvidenceWithTimeout(
        parseClineUsage(),
        []
      ),
      runLocalEvidenceWithTimeout(
        parseCodexUsage(),
        {
          records: [],
          sessionsScanned: 0,
          sessionsWithUsage: 0,
          sessionsWithoutUsage: 0,
          tokenUsageAvailable: false,
          source: "codex" as const,
        }
      ),
    ]);

    localRecords =
      normalizeLocalRecords(
        clineResult.value,
        codexResult.value.records
      );

    localEvidence = {
      requested: true,
      completed:
        !clineResult.failed &&
        !codexResult.failed,
      timedOut:
        clineResult.timedOut ||
        codexResult.timedOut,
      failed:
        clineResult.failed ||
        codexResult.failed,
    };
  }

  const allRecords =
    mergeRecords(
      databaseRecords,
      localRecords
    );

  const records =
    allRecords.filter(
      (record) =>
        isRecordInRange(
          record,
          range
        )
    );

  const breakdown =
    buildBreakdown(records);

  const monetaryRecords =
    records.filter(
      (record) =>
        record.cost.amount !== null &&
        Number.isFinite(
          record.cost.amount
        )
    );

  const officialRecords =
    monetaryRecords.filter(
      isOfficialVerifiedRecord
    );

  const currencies = Array.from(
    new Set(
      officialRecords
        .map(
          (record) =>
            record.cost.currency
        )
        .filter(
          (currency): currency is string =>
            Boolean(currency)
        )
    )
  );

  const currencyCompatible =
    currencies.length <= 1;

  const verifiedRecords =
    currencyCompatible
      ? officialRecords
      : [];

  const totalVerifiedCost =
    verifiedRecords.reduce(
      (sum, record) =>
        sum +
        (record.cost.amount ?? 0),
      0
    );

  const currency =
    currencies.length === 1
      ? currencies[0]
      : currencies.length === 0
        ? "CNY"
        : null;

  const providerTotals =
    new Map<
      string,
      {
        provider: string;
        model: string;
        cost: number;
        recordCount: number;
      }
    >();

  for (const record of verifiedRecords) {
    const amount =
      record.cost.amount ?? 0;

    const key = [
      record.provider,
      record.model,
    ].join("|");

    const current =
      providerTotals.get(
        key
      ) ?? {
        provider:
          record.provider,
        model:
          record.model,
        cost: 0,
        recordCount: 0,
      };

    current.cost += amount;
    current.recordCount++;

    providerTotals.set(
      key,
      current
    );
  }

  const biggestCostDriver =
    Array.from(
      providerTotals.values()
    ).sort(
      (a, b) =>
        b.cost - a.cost
    )[0] ?? null;

  const biggestCostDriverResult =
    biggestCostDriver
      ? {
          provider:
            biggestCostDriver.provider,
          model:
            biggestCostDriver.model,
          cost:
            biggestCostDriver.cost,
          currency,
          percentage:
            totalVerifiedCost > 0
              ? Number(
                  (
                    (biggestCostDriver.cost /
                      totalVerifiedCost) *
                    100
                  ).toFixed(1)
                )
              : 0,
          recordCount:
            biggestCostDriver.recordCount,
        }
      : null;

  const dailyVerified =
    new Map<
      string,
      number
    >();

  for (const record of verifiedRecords) {
    const date =
      getLocalDate(
        new Date(
          record.timestamp
        ),
        timeZone
      );

    dailyVerified.set(
      date,
      (dailyVerified.get(
        date
      ) ?? 0) +
        (record.cost.amount ?? 0)
    );
  }

  const highestSpendingDayEntry =
    Array.from(
      dailyVerified.entries()
    ).sort(
      (a, b) =>
        b[1] - a[1]
    )[0] ?? null;

  const highestSpendingDay =
    highestSpendingDayEntry
      ? {
          date:
            highestSpendingDayEntry[0],
          cost:
            highestSpendingDayEntry[1],
          currency,
          percentage:
            totalVerifiedCost > 0
              ? Number(
                  (
                    (highestSpendingDayEntry[1] /
                      totalVerifiedCost) *
                    100
                  ).toFixed(1)
                )
              : 0,
        }
      : null;

  const totalInputTokens =
    records.reduce(
      (sum, record) =>
        sum + record.tokens.input,
      0
    );

  const totalCachedTokens =
    records.reduce(
      (sum, record) =>
        sum + record.tokens.cached,
      0
    );

  const cacheEfficiency =
    totalInputTokens > 0
      ? {
          cachedInputPercentage:
            Number(
              (
                (totalCachedTokens /
                  totalInputTokens) *
                100
              ).toFixed(1)
            ),
          inputTokens:
            totalInputTokens,
          cachedTokens:
            totalCachedTokens,
        }
      : {
          cachedInputPercentage: 0,
          inputTokens: 0,
          cachedTokens: 0,
        };

    const officialBreakdown =
      buildBreakdown(
        verifiedRecords
      );

    const officialDailyCost =
      Array.from(
        verifiedRecords.reduce(
          (daily, record) => {
            const date =
              getLocalDate(
                new Date(
                  record.timestamp
                ),
                timeZone
              );

            daily.set(
              date,
              (daily.get(date) ?? 0) +
                (record.cost.amount ?? 0)
            );

            return daily;
          },
          new Map<string, number>()
        ).entries()
      )
        .map(([date, cost]) => ({
          date,
          cost,
        }))
        .sort((a, b) =>
          a.date.localeCompare(b.date)
        );

    const officialByModel =
      officialBreakdown.byModel.map(
        (item) => ({
          provider: item.provider,
          model: item.model,
          recordCount: item.recordCount,
          sourceCost: item.cost,
          sourceCostRecordCount:
            item.recordCount,
        })
      );

  return {
    timezone: timeZone,

    period: {
      type: period,
      start:
        range.start?.toISOString() ??
        null,
      end:
        range.end.toISOString(),
    },

    dataPolicy:
      COST_POLICY,

    summary: {
      totalVerifiedCost,
      totalSourceCost:
        totalVerifiedCost,
      currency,
      verifiedRecordCount:
        verifiedRecords.length,
      sourceCostRecordCount:
        verifiedRecords.length,
      visibleRecordCount:
        records.length,
      currencyCompatible,
      currencies,
      monetarySource:
        currencyCompatible &&
        verifiedRecords.length > 0
          ? "official"
          : "none",
    },

    biggestCostDriver:
      biggestCostDriverResult,

    highestSpendingDay,

    cacheEfficiency,

    breakdown,

    localEvidence,

    byModel: officialByModel,

    dailyCost: officialDailyCost,

    records,
  };
}