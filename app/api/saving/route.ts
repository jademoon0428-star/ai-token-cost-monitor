import { NextResponse } from "next/server";

import { isOfficialSource } from "@/lib/cost-policy";

import {
  getUnifiedCostData,
  validateTimeZone,
  type Period,
} from "@/lib/services/cost-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type UnifiedModel = {
  provider?: string | null;
  model?: string | null;
  recordCount?: number;
  sourceCost?: number | null;
  sourceCostRecordCount?: number;
};

function normalizePeriod(
  value: string | null
): Period {
  if (
    value === "today" ||
    value === "7d" ||
    value === "30d" ||
    value === "all"
  ) {
    return value;
  }

  return "30d";
}

function round(
  value: number,
  decimals = 2
): number {
  const factor = 10 ** decimals;

  return (
    Math.round(value * factor) /
    factor
  );
}

function safeNumber(
  value: unknown
): number {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : 0;
}

function getPercentage(
  part: number,
  total: number
): number {
  if (total <= 0) {
    return 0;
  }

  return round(
    (part / total) * 100,
    1
  );
}

function getModelName(
  model: UnifiedModel | undefined
): string | null {
  if (!model?.model) {
    return null;
  }

  return model.model;
}

export async function GET(
  request: Request
) {
  const { searchParams } =
    new URL(request.url);

  const period = normalizePeriod(
    searchParams.get("period")
  );

  const requestedTimeZone =
    searchParams.get("timezone") ??
    "Asia/Singapore";

  if (!validateTimeZone(requestedTimeZone)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid timezone",
        timezone: requestedTimeZone,
      },
      { status: 400 }
    );
  }

  try {
    const data = await getUnifiedCostData({
      period,
      timeZone: requestedTimeZone,
      includeLocalEvidence: false,
    });

    const totalCost =
      safeNumber(
        data.summary?.totalSourceCost
      );

    const currency =
      data.summary?.currency ??
      null;

    const models =
      Array.isArray(data.byModel)
        ? data.byModel
            .map((item) => ({
              provider:
                item.provider ??
                null,

              model:
                getModelName(item),

              recordCount:
                safeNumber(
                  item.recordCount
                ),

              sourceCost:
                safeNumber(
                  item.sourceCost
                ),

              sourceCostRecordCount:
                safeNumber(
                  item.sourceCostRecordCount
                ),
            }))
            .filter(
              (item) =>
                item.model &&
                item.sourceCostRecordCount >
                  0 &&
                item.sourceCost > 0
            )
            .sort(
              (a, b) =>
                b.sourceCost -
                a.sourceCost
            )
        : [];

    const biggestCostDriver =
      models[0] ?? null;

    const dailyCosts =
      Array.isArray(
        data.dailyCost
      )
        ? data.dailyCost
            .map((item) => ({
              date:
                item.date ?? null,

              cost:
                safeNumber(
                  item.cost
                ),
            }))
            .filter(
              (item) =>
                item.date &&
                item.cost > 0
            )
            .sort(
              (a, b) =>
                b.cost - a.cost
            )
        : [];

    const highestSpendingDay =
      dailyCosts[0] ?? null;

    /*
     * Only official verified records
     * are used for cache efficiency.
     */
    const records =
      Array.isArray(
        data.records
      )
        ? data.records
        : [];

    const verifiedRecords =
      records.filter(
        (record) =>
          isOfficialSource(
            record.source
          ) &&
          record.accuracy ===
            "exact" &&
          typeof record.cost
            ?.amount ===
            "number" &&
          Number.isFinite(
            record.cost.amount
          )
      );

    let totalInputTokens = 0;
    let totalCachedTokens = 0;

    for (const record of verifiedRecords) {
      totalInputTokens +=
        safeNumber(
          record.tokens?.input
        );

      totalCachedTokens +=
        safeNumber(
          record.tokens?.cached
        );
    }

    const cacheEfficiency =
      data.summary
        ?.currencyCompatible ===
        false ||
      totalInputTokens <= 0
        ? null
        : getPercentage(
            totalCachedTokens,
            totalInputTokens
          );

    const recommendations: Array<{
      id: string;
      severity:
        | "high"
        | "medium"
        | "low";
      title: string;
      explanation: string;
      action: string;
      evidence: {
        type: string;
        value: string;
      }[];
    }> = [];

    if (biggestCostDriver) {
      const share =
        getPercentage(
          biggestCostDriver.sourceCost,
          totalCost
        );

      recommendations.push({
        id: "high-cost-model",

        severity:
          share >= 50
            ? "high"
            : "medium",

        title:
          "Review high-cost model usage",

        explanation:
          `${biggestCostDriver.model} accounts for ${share}% of your verified spending.`,

        action:
          "Review which tasks use this model and whether lower-cost models can handle some of them.",

        evidence: [
          {
            type: "model",
            value:
              biggestCostDriver.model ??
              "Unknown",
          },
          {
            type: "verified cost",
            value:
              `${biggestCostDriver.sourceCost.toFixed(2)} ${currency ?? ""}`.trim(),
          },
          {
            type: "share",
            value:
              `${share}% of verified cost`,
          },
        ],
      });
    }

    if (highestSpendingDay) {
      const share =
        getPercentage(
          highestSpendingDay.cost,
          totalCost
        );

      recommendations.push({
        id: "high-spending-day",

        severity: "medium",

        title:
          "Review your highest-spending day",

        explanation:
          `${highestSpendingDay.date} had the highest verified spending in this period.`,

        action:
          "Check what work happened on this day and identify unusually large or repeated AI tasks.",

        evidence: [
          {
            type: "date",
            value:
              highestSpendingDay.date ??
              "",
          },
          {
            type: "verified cost",
            value:
              `${highestSpendingDay.cost.toFixed(2)} ${currency ?? ""}`.trim(),
          },
          {
            type: "period share",
            value:
              `${share}% of verified cost`,
          },
        ],
      });
    }

    if (
      cacheEfficiency !== null
    ) {
      if (
        cacheEfficiency >= 80
      ) {
        recommendations.push({
          id: "strong-cache",

          severity: "low",

          title:
            "Cache usage looks strong",

          explanation:
            `${cacheEfficiency}% of input tokens were cached in the verified records.`,

          action:
            "Keep monitoring cache efficiency. Do not assume a monetary saving without a reliable uncached comparison.",

          evidence: [
            {
              type: "cached input",
              value:
                `${cacheEfficiency}%`,
            },
          ],
        });
      } else if (
        cacheEfficiency < 50
      ) {
        recommendations.push({
          id: "low-cache",

          severity: "medium",

          title:
            "Review cache efficiency",

          explanation:
            `Only ${cacheEfficiency}% of input tokens were cached in the verified records.`,

          action:
            "Review repeated prompts, long context, and workflows that may prevent effective cache reuse.",

          evidence: [
            {
              type: "cached input",
              value:
                `${cacheEfficiency}%`,
            },
          ],
        });
      }
    }

    return NextResponse.json({
      success: true,

      timestamp:
        new Date().toISOString(),

      timezone:
        data.timezone ??
        requestedTimeZone,

      period:
        data.period ?? {
          type:
            period,
        },

      dataPolicy: {
        monetarySource:
          data.summary?.monetarySource ??
            "none",

        accuracy: "verified",

        savingsEstimates:
          false,

        message:
          "Recommendations are based on verified source-reported costs. No monetary savings are estimated without reliable comparison data.",
      },

      summary: {
        totalVerifiedCost:
          totalCost,

        currency,

        verifiedRecordCount:
          safeNumber(
            data.summary
              ?.sourceCostRecordCount
          ),

        visibleRecordCount:
          safeNumber(
            data.summary
              ?.visibleRecordCount
          ),
      },

      biggestCostDriver:
        biggestCostDriver
          ? {
              provider:
                biggestCostDriver.provider,

              model:
                biggestCostDriver.model,

              cost:
                biggestCostDriver.sourceCost,

              currency,

              percentage:
                getPercentage(
                  biggestCostDriver.sourceCost,
                  totalCost
                ),

              recordCount:
                biggestCostDriver.recordCount,
            }
          : null,

      highestSpendingDay:
        highestSpendingDay
          ? {
              date:
                highestSpendingDay.date,

              cost:
                highestSpendingDay.cost,

              currency,

              percentage:
                getPercentage(
                  highestSpendingDay.cost,
                  totalCost
                ),
            }
          : null,

      cacheEfficiency:
        cacheEfficiency !== null
          ? {
              cachedInputPercentage:
                cacheEfficiency,

              inputTokens:
                totalInputTokens,

              cachedTokens:
                totalCachedTokens,
            }
          : null,

      recommendations,

      modelBreakdown:
        models.map(
          (model) => ({
            provider:
              model.provider,

            model:
              model.model,

            cost:
              model.sourceCost,

            currency,

            percentage:
              getPercentage(
                model.sourceCost,
                totalCost
              ),

            recordCount:
              model.recordCount,
          })
        ),

      dailySpending:
        dailyCosts.reverse(),
    });
  } catch (error) {
    console.error(
      "[Saving API] Failed to build saving insights:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Failed to build saving insights.",
      },
      { status: 500 }
    );
  }
}