import {
  getCanonicalTokenCounts,
} from "@/lib/services/token-conventions";

import {
  getUnifiedCostData,
  getLocalDate,
  type Period,
  type UnifiedRecord,
} from "@/lib/services/cost-service";

import {
  isOfficialVerifiedRecord as isOfficialVerifiedSourceRecord,
} from "@/lib/cost-policy";

/*
 * Efficiency Service (measurement layer).
 *
 * It answers: within the Money Layer data, how many tokens and
 * how much cost actually occurred, and what the corresponding
 * token/cost efficiency is.
 *
 * It does NOT answer: which AI is best. No ranking, no score,
 * no recommendation, no predicted saving.
 *
 * This module never reads SQLite directly. It consumes the
 * output of cost-service (getUnifiedCostData) and applies the
 * canonical token conventions from token-conventions.ts.
 */

export type EfficiencyTokenMetrics = {
  totalTokens: number;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

export type EfficiencyRatioMetrics = {
  cacheHitRate: number;
  outputShare: number;
  reasoningShare: number;
};

export type EfficiencyCostMetrics = {
  verifiedCost: number | null;
  currency: string | null;
  costPerMillionTokens: number | null;
};

export type EfficiencyModelCost = {
  provider: string;
  model: string;
  recordCount: number;
  sourceCost: number;
};

export type EfficiencyDailyCost = {
  date: string;
  cost: number;
};

export type ModelEfficiency = {
  provider: string;
  model: string;
  recordCount: number;
  totalTokens: number;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  verifiedCost: number | null;
  currency: string | null;
  costPerMillionTokens: number | null;
  cacheHitRate: number;
  outputShare: number;
  reasoningShare: number;
};

export type DailyEfficiency = {
  date: string;
  recordCount: number;
  totalTokens: number;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  verifiedCost: number | null;
  currency: string | null;
  costPerMillionTokens: number | null;
  cacheHitRate: number;
  outputShare: number;
  reasoningShare: number;
};

export type EfficiencyInsights = {
  timezone: string;
  period: {
    type: Period;
    start: string | null;
    end: string;
  };
  verifiedRecordCount: number;
  visibleRecordCount: number;
  tokens: EfficiencyTokenMetrics;
  ratios: EfficiencyRatioMetrics;
  cost: EfficiencyCostMetrics;
  byModel: EfficiencyModelCost[];
  modelEfficiency: ModelEfficiency[];
  dailyCost: EfficiencyDailyCost[];
  dailyEfficiency: DailyEfficiency[];
};

export type UnifiedCostData = Awaited<
  ReturnType<typeof getUnifiedCostData>
>;

function isVerifiedRecord(
  record: UnifiedRecord
): boolean {
  if (
    !isOfficialVerifiedSourceRecord(
      record.source,
      record.accuracy
    )
  ) {
    return false;
  }

  return (
    record.accuracy === "exact" &&
    typeof record.cost?.amount ===
      "number" &&
    Number.isFinite(
      record.cost.amount
    )
  );
}

function safeRatio(
  numerator: number,
  denominator: number
): number {
  if (
    denominator > 0 &&
    Number.isFinite(numerator)
  ) {
    return numerator / denominator;
  }

  return 0;
}

function safeCostPerMillionTokens(
  verifiedCost: number | null,
  totalTokens: number
): number | null {
  if (
    verifiedCost === null ||
    !Number.isFinite(verifiedCost)
  ) {
    return null;
  }

  return totalTokens > 0
    ? verifiedCost /
        (totalTokens / 1_000_000)
    : 0;
}

/*
 * Model efficiency from verified Money Layer records only.
 *
 * Every model is grouped by (provider, model) and aggregated
 * with the canonical token conventions from token-conventions.ts
 * (total = input + output + reasoning; cached stays inside input).
 *
 * Cost is only summed when currencies are compatible; otherwise
 * the model still reports its token metrics but cost fields are null.
 *
 * The result is a display-ordered observation (by verified cost,
 * descending), never a ranking, score, or recommendation.
 */
export function computeModelEfficiency(input: {
  records: UnifiedRecord[];
  currency: string | null;
  currencyCompatible: boolean;
}): ModelEfficiency[] {
  const {
    records,
    currency,
    currencyCompatible,
  } = input;

  type Accumulator = {
    provider: string;
    model: string;
    recordCount: number;
    totalTokens: number;
    inputTokens: number;
    cachedTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    verifiedCost: number;
  };

  const grouped = new Map<
    string,
    Accumulator
  >();

  for (const record of records) {
    const canonical =
      getCanonicalTokenCounts(
        record.tokens
      );

    const key = [
      record.provider,
      record.model,
    ].join("|");

    const current =
      grouped.get(key) ?? {
        provider: record.provider,
        model: record.model,
        recordCount: 0,
        totalTokens: 0,
        inputTokens: 0,
        cachedTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        verifiedCost: 0,
      };

    current.recordCount += 1;
    current.totalTokens += canonical.total;
    current.inputTokens += canonical.input;
    current.cachedTokens += canonical.cached;
    current.outputTokens += canonical.output;
    current.reasoningTokens += canonical.reasoning;

    const amount = record.cost?.amount;

    if (
      typeof amount === "number" &&
      Number.isFinite(amount)
    ) {
      current.verifiedCost += amount;
    }

    grouped.set(key, current);
  }

  return Array.from(
    grouped.values()
  )
    .map((item) => {
      const verifiedCost =
        currencyCompatible
          ? item.verifiedCost
          : null;

      const itemCurrency =
        currencyCompatible
          ? currency
          : null;

      return {
        provider: item.provider,
        model: item.model,
        recordCount: item.recordCount,
        totalTokens: item.totalTokens,
        inputTokens: item.inputTokens,
        cachedTokens: item.cachedTokens,
        outputTokens: item.outputTokens,
        reasoningTokens: item.reasoningTokens,
        verifiedCost,
        currency: itemCurrency,
        costPerMillionTokens:
          safeCostPerMillionTokens(
            verifiedCost,
            item.totalTokens
          ),
        cacheHitRate: safeRatio(
          item.cachedTokens,
          item.inputTokens
        ),
        outputShare: safeRatio(
          item.outputTokens,
          item.totalTokens
        ),
        reasoningShare: safeRatio(
          item.reasoningTokens,
          item.totalTokens
        ),
      };
    })
    .sort(
      (a, b) => {
        const costA =
          a.verifiedCost ?? -Infinity;
        const costB =
          b.verifiedCost ?? -Infinity;

        if (costA !== costB) {
          return costB - costA;
        }

        return b.totalTokens - a.totalTokens;
      }
    );
}

/*
 * Daily efficiency from verified Money Layer records only.
 *
 * Days are bucketed with the exact getLocalDate(timezone) logic used by
 * cost-service (the same natural-day key every other daily view uses), so
 * dailyEfficiency cannot diverge from the rest of the product.
 *
 * Cost is only summed when currencies are compatible; otherwise the day
 * still reports token metrics but cost fields are null.
 *
 * Rows are ordered newest date first (a chronological display order, not
 * a ranking).
 */
export function computeDailyEfficiency(input: {
  records: UnifiedRecord[];
  currency: string | null;
  currencyCompatible: boolean;
  timeZone: string;
}): DailyEfficiency[] {
  const {
    records,
    currency,
    currencyCompatible,
    timeZone,
  } = input;

  type Accumulator = {
    date: string;
    recordCount: number;
    totalTokens: number;
    inputTokens: number;
    cachedTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    verifiedCost: number;
  };

  const grouped = new Map<
    string,
    Accumulator
  >();

  for (const record of records) {
    const date =
      getLocalDate(
        new Date(record.timestamp),
        timeZone
      );

    const canonical =
      getCanonicalTokenCounts(
        record.tokens
      );

    const current =
      grouped.get(date) ?? {
        date,
        recordCount: 0,
        totalTokens: 0,
        inputTokens: 0,
        cachedTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        verifiedCost: 0,
      };

    current.recordCount += 1;
    current.totalTokens += canonical.total;
    current.inputTokens += canonical.input;
    current.cachedTokens += canonical.cached;
    current.outputTokens += canonical.output;
    current.reasoningTokens += canonical.reasoning;

    const amount = record.cost?.amount;

    if (
      typeof amount === "number" &&
      Number.isFinite(amount)
    ) {
      current.verifiedCost += amount;
    }

    grouped.set(date, current);
  }

  return Array.from(
    grouped.values()
  )
    .map((item) => {
      const verifiedCost =
        currencyCompatible
          ? item.verifiedCost
          : null;

      const itemCurrency =
        currencyCompatible
          ? currency
          : null;

      return {
        date: item.date,
        recordCount: item.recordCount,
        totalTokens: item.totalTokens,
        inputTokens: item.inputTokens,
        cachedTokens: item.cachedTokens,
        outputTokens: item.outputTokens,
        reasoningTokens: item.reasoningTokens,
        verifiedCost,
        currency: itemCurrency,
        costPerMillionTokens:
          safeCostPerMillionTokens(
            verifiedCost,
            item.totalTokens
          ),
        cacheHitRate: safeRatio(
          item.cachedTokens,
          item.inputTokens
        ),
        outputShare: safeRatio(
          item.outputTokens,
          item.totalTokens
        ),
        reasoningShare: safeRatio(
          item.reasoningTokens,
          item.totalTokens
        ),
      };
    })
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date)
    );
}

export function computeEfficiencyInsights(
  data: UnifiedCostData
): EfficiencyInsights {
  const verifiedRecords =
    data.records.filter(
      isVerifiedRecord
    );

  let totalTokens = 0;
  let inputTokens = 0;
  let cachedTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;

  for (const record of verifiedRecords) {
    const canonical =
      getCanonicalTokenCounts(
        record.tokens
      );

    totalTokens += canonical.total;
    inputTokens += canonical.input;
    cachedTokens += canonical.cached;
    outputTokens += canonical.output;
    reasoningTokens +=
      canonical.reasoning;
  }

  const cacheHitRate =
    inputTokens > 0
      ? cachedTokens / inputTokens
      : 0;

  const outputShare =
    totalTokens > 0
      ? outputTokens / totalTokens
      : 0;

  const reasoningShare =
    totalTokens > 0
      ? reasoningTokens / totalTokens
      : 0;

  const hasVerifiedRecords =
    verifiedRecords.length > 0;

  const currencyCompatible =
    data.summary?.currencyCompatible !==
    false;

  const canReportCost =
    hasVerifiedRecords &&
    currencyCompatible;

  const verifiedCost =
    canReportCost
      ? data.summary?.totalVerifiedCost ??
        null
      : null;

  const currency =
    canReportCost
      ? data.summary?.currency ?? null
      : null;

  const costPerMillionTokens =
    verifiedCost === null
      ? null
      : totalTokens > 0
        ? verifiedCost /
          (totalTokens / 1_000_000)
        : 0;

  const byModel =
    (data.byModel ?? []).map(
      (item) => ({
        provider: item.provider,
        model: item.model,
        recordCount: item.recordCount,
        sourceCost: item.sourceCost,
      })
    );

  const dailyCost =
    (data.dailyCost ?? []).map(
      (item) => ({
        date: item.date,
        cost: item.cost,
      })
    );

  return {
    timezone: data.timezone,

    period: {
      type: data.period.type,
      start: data.period.start,
      end: data.period.end,
    },

    verifiedRecordCount:
      verifiedRecords.length,

    visibleRecordCount:
      data.summary?.visibleRecordCount ??
      0,

    tokens: {
      totalTokens,
      inputTokens,
      cachedTokens,
      outputTokens,
      reasoningTokens,
    },

    ratios: {
      cacheHitRate,
      outputShare,
      reasoningShare,
    },

    cost: {
      verifiedCost,
      currency,
      costPerMillionTokens,
    },

    byModel,

    modelEfficiency:
      computeModelEfficiency({
        records: verifiedRecords,
        currency:
          data.summary?.currency ??
          null,
        currencyCompatible:
          data.summary?.currencyCompatible !==
          false,
      }),

    dailyCost,

    dailyEfficiency:
      computeDailyEfficiency({
        records: verifiedRecords,
        currency:
          data.summary?.currency ??
          null,
        currencyCompatible:
          data.summary?.currencyCompatible !==
          false,
        timeZone: data.timezone,
      }),
  };
}

export async function getEfficiencyInsights({
  period,
  timeZone,
}: {
  period: Period;
  timeZone: string;
}): Promise<EfficiencyInsights> {
  const data = await getUnifiedCostData({
    period,
    timeZone,
    includeLocalEvidence: false,
  });

  return computeEfficiencyInsights(
    data
  );
}