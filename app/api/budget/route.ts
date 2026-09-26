import { NextResponse } from "next/server";

import {
  getBudgetByPeriodAndCurrency,
  getDominantCostCurrency,
  getLatestBudgets,
  getRecentDailySpend,
  getVerifiedOfficialSpend,
  insertBudget,
  updateBudget,
  type BudgetPeriod,
  type BudgetRow,
} from "@/lib/repositories/budget-repository";

export const runtime = "nodejs";

const DEFAULT_TIMEZONE =
  "Asia/Singapore";

function isValidPeriod(
  value: unknown
): value is BudgetPeriod {
  return (
    value === "daily" ||
    value === "weekly" ||
    value === "monthly"
  );
}

function normalizeTimezone(
  value: unknown
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return DEFAULT_TIMEZONE;
  }

  try {
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: value,
      }
    ).format();

    return value;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function getTimeZoneParts(
  date: Date,
  timeZone: string
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
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
      date
    );

  const get = (
    type: string
  ) =>
    Number(
      parts.find(
        (part) =>
          part.type === type
      )?.value ?? 0
    );

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function getTimeZoneOffsetMs(
  date: Date,
  timeZone: string
): number {
  const parts =
    getTimeZoneParts(
      date,
      timeZone
    );

  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return (
    asUtc -
    date.getTime()
  );
}

function zonedDateToUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string
): Date {
  const approximate =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        0,
        0,
        0
      )
    );

  const offset =
    getTimeZoneOffsetMs(
      approximate,
      timeZone
    );

  return new Date(
    approximate.getTime() -
      offset
  );
}

function getPeriodBounds(
  now: Date,
  period: BudgetPeriod,
  timeZone: string
) {
  const local =
    getTimeZoneParts(
      now,
      timeZone
    );

  const localStartOfDay =
    new Date(
      Date.UTC(
        local.year,
        local.month - 1,
        local.day
      )
    );

  let startYear =
    local.year;
  let startMonth =
    local.month;
  let startDay =
    local.day;

  let endYear =
    local.year;
  let endMonth =
    local.month;
  let endDay =
    local.day;

  if (
    period === "daily"
  ) {
    const nextDay =
      new Date(
        Date.UTC(
          local.year,
          local.month - 1,
          local.day + 1
        )
      );

    endYear =
      nextDay.getUTCFullYear();

    endMonth =
      nextDay.getUTCMonth() + 1;

    endDay =
      nextDay.getUTCDate();
  }

  if (
    period === "weekly"
  ) {
    const dayOfWeek =
      localStartOfDay.getUTCDay() ===
      0
        ? 6
        : localStartOfDay.getUTCDay() -
          1;

    const monday =
      new Date(
        Date.UTC(
          local.year,
          local.month - 1,
          local.day -
            dayOfWeek
        )
      );

    const nextMonday =
      new Date(
        Date.UTC(
          monday.getUTCFullYear(),
          monday.getUTCMonth(),
          monday.getUTCDate() +
            7
        )
      );

    startYear =
      monday.getUTCFullYear();

    startMonth =
      monday.getUTCMonth() + 1;

    startDay =
      monday.getUTCDate();

    endYear =
      nextMonday.getUTCFullYear();

    endMonth =
      nextMonday.getUTCMonth() + 1;

    endDay =
      nextMonday.getUTCDate();
  }

  if (
    period === "monthly"
  ) {
    startDay = 1;

    const nextMonth =
      new Date(
        Date.UTC(
          local.year,
          local.month,
          1
        )
      );

    endYear =
      nextMonth.getUTCFullYear();

    endMonth =
      nextMonth.getUTCMonth() + 1;

    endDay =
      nextMonth.getUTCDate();
  }

  const start =
    zonedDateToUtc(
      startYear,
      startMonth,
      startDay,
      timeZone
    );

  const end =
    zonedDateToUtc(
      endYear,
      endMonth,
      endDay,
      timeZone
    );

  return {
    start,
    end,
    local,
  };
}

function calculateAbnormalStatus(
  now: Date,
  timeZone: string,
  currency: string | null,
  todaySpend: number
) {
  if (!currency) {
    return {
      status:
        "insufficient_data",
      message:
        "No verified official cost data is available.",
      baseline_days: 0,
      baseline_average_micros:
        null,
    };
  }

  const currentLocal =
    getTimeZoneParts(
      now,
      timeZone
    );

  const todayStart =
    zonedDateToUtc(
      currentLocal.year,
      currentLocal.month,
      currentLocal.day,
      timeZone
    );

  const startDate =
    new Date(
      todayStart.getTime() -
        7 *
          24 *
          60 *
          60 *
          1000
    );

  const rows =
    getRecentDailySpend(
      startDate,
      todayStart,
      currency
    );

  const positiveDays =
    rows.filter(
      (row) =>
        Number(
          row.total_cost_micros
        ) > 0
    );

  if (
    positiveDays.length < 3
  ) {
    return {
      status:
        "insufficient_data",
      message:
        "Not enough recent verified cost history to detect abnormal consumption.",
      baseline_days:
        positiveDays.length,
      baseline_average_micros:
        null,
    };
  }

  const average =
    positiveDays.reduce(
      (sum, row) =>
        sum +
        Number(
          row.total_cost_micros
        ),
      0
    ) /
    positiveDays.length;

  if (
    todaySpend <= 0
  ) {
    return {
      status: "normal",
      message:
        "No verified official cost recorded today.",
      baseline_days:
        positiveDays.length,
      baseline_average_micros:
        Math.round(
          average
        ),
    };
  }

  const abnormalThreshold =
    average * 2;

  if (
    todaySpend >=
    abnormalThreshold
  ) {
    return {
      status: "abnormal",
      message:
        "Today's verified cost is at least 2× the recent daily average.",
      baseline_days:
        positiveDays.length,
      baseline_average_micros:
        Math.round(
          average
        ),
    };
  }

  return {
    status: "normal",
    message:
      "Today's verified cost is within the recent normal range.",
    baseline_days:
      positiveDays.length,
    baseline_average_micros:
      Math.round(
        average
      ),
  };
}

function getBudgetStatus(
  amountMicros: number | null,
  spentMicros: number
) {
  if (
    amountMicros === null ||
    amountMicros <= 0
  ) {
    return "not_set";
  }

  const percent =
    (spentMicros /
      amountMicros) *
    100;

  if (percent >= 100) {
    return "over";
  }

  if (percent >= 80) {
    return "near";
  }

  return "normal";
}

function getElapsedDays(
  start: Date,
  now: Date,
  end: Date,
  timeZone: string
) {
  const startLocal =
    getTimeZoneParts(
      start,
      timeZone
    );

  const nowLocal =
    getTimeZoneParts(
      now,
      timeZone
    );

  const endLocal =
    getTimeZoneParts(
      end,
      timeZone
    );

  const startDay =
    Date.UTC(
      startLocal.year,
      startLocal.month - 1,
      startLocal.day
    );

  const nowDay =
    Date.UTC(
      nowLocal.year,
      nowLocal.month - 1,
      nowLocal.day
    );

  const endDay =
    Date.UTC(
      endLocal.year,
      endLocal.month - 1,
      endLocal.day
    );

  const totalDays =
    Math.max(
      1,
      Math.round(
        (endDay -
          startDay) /
          (24 *
            60 *
            60 *
            1000)
      )
    );

  const elapsedDays =
    Math.min(
      totalDays,
      Math.max(
        1,
        Math.floor(
          (nowDay -
            startDay) /
            (24 *
              60 *
              60 *
              1000)
        ) + 1
      )
    );

  return {
    elapsedDays,
    totalDays,
  };
}

function buildBudgetState(
  budget: BudgetRow | null,
  period: BudgetPeriod,
  now: Date,
  timeZone: string,
  costCurrency: string | null
) {
  const {
    start,
    end,
  } = getPeriodBounds(
    now,
    period,
    timeZone
  );

  const compatibleBudget =
    budget &&
    costCurrency &&
    budget.currency ===
      costCurrency
      ? budget
      : null;

  const spent =
    getVerifiedOfficialSpend(
      start,
      end,
      costCurrency
    );

  const amount =
    compatibleBudget !== null
      ? Number(
          compatibleBudget.amount_micros
        )
      : null;

  const remaining =
    amount === null
      ? null
      : amount - spent;

  const percentUsed =
    amount !== null &&
    amount > 0
      ? (spent / amount) *
        100
      : null;

  const {
    elapsedDays,
    totalDays,
  } =
    getElapsedDays(
      start,
      now,
      end,
      timeZone
    );

  let forecast:
    | number
    | null = null;

  if (
    amount !== null &&
    spent > 0 &&
    elapsedDays > 0
  ) {
    forecast = Math.round(
      (spent /
        elapsedDays) *
        totalDays
    );
  }

  const forecastPercent =
    amount !== null &&
    amount > 0 &&
    forecast !== null
      ? (forecast / amount) *
        100
      : null;

  return {
    id:
      compatibleBudget?.id ??
      null,

    period,

    budget_micros:
      amount,

    spent_micros:
      spent,

    remaining_micros:
      remaining,

    percent_used:
      percentUsed,

    forecast_micros:
      forecast,

    forecast_percent:
      forecastPercent,

    status:
      getBudgetStatus(
        amount,
        spent
      ),

    currency:
      compatibleBudget?.currency ??
      costCurrency,

    start:
      start.toISOString(),

    end:
      end.toISOString(),

    days_elapsed:
      elapsedDays,

    days_in_period:
      totalDays,

    has_data:
      spent > 0,

    currency_mismatch:
      budget !== null &&
      costCurrency !== null &&
      budget.currency !==
        costCurrency,
  };
}

function getLatestBudgetByPeriod(
  budgets: BudgetRow[]
): Map<
  BudgetPeriod,
  BudgetRow
> {
  const result =
    new Map<
      BudgetPeriod,
      BudgetRow
    >();

  for (const budget of budgets) {
    if (
      !result.has(
        budget.period
      )
    ) {
      result.set(
        budget.period,
        budget
      );
    }
  }

  return result;
}

export async function GET(
  request: Request
) {
  try {
    const url =
      new URL(
        request.url
      );

    const timeZone =
      normalizeTimezone(
        url.searchParams.get(
          "timezone"
        )
      );

    const now =
      new Date();

    const costCurrency =
      getDominantCostCurrency();

    const budgets =
      getLatestBudgets();

    const latestBudgetByPeriod =
      getLatestBudgetByPeriod(
        budgets
      );

    const daily =
      buildBudgetState(
        latestBudgetByPeriod.get(
          "daily"
        ) ?? null,
        "daily",
        now,
        timeZone,
        costCurrency
      );

    const weekly =
      buildBudgetState(
        latestBudgetByPeriod.get(
          "weekly"
        ) ?? null,
        "weekly",
        now,
        timeZone,
        costCurrency
      );

    const monthly =
      buildBudgetState(
        latestBudgetByPeriod.get(
          "monthly"
        ) ?? null,
        "monthly",
        now,
        timeZone,
        costCurrency
      );

    const todayBounds =
      getPeriodBounds(
        now,
        "daily",
        timeZone
      );

    const todaySpend =
      getVerifiedOfficialSpend(
        todayBounds.start,
        todayBounds.end,
        costCurrency
      );

    const abnormal =
      calculateAbnormalStatus(
        now,
        timeZone,
        costCurrency,
        todaySpend
      );

    return NextResponse.json({
      success: true,
      timestamp:
        now.toISOString(),
      timezone:
        timeZone,
      currency:
        costCurrency,
      monetary_source:
        "official_export",
      cost_policy:
        "Only verified official imported costs are used for budget calculations. Local application costs are not mixed with official currency data.",
      budgets: {
        daily,
        weekly,
        monthly,
      },
      abnormal_consumption: {
        ...abnormal,
        today_spend_micros:
          todaySpend,
      },
    });
  } catch (error) {
    console.error(
      "[Budget API] Failed to load budget data:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load budget data.",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request
) {
  try {
    let body: Record<
      string,
      unknown
    >;

    try {
      body =
        (await request.json()) as Record<
          string,
          unknown
        >;
    } catch {
      return NextResponse.json(
        {
          error:
            "Request body must be valid JSON.",
        },
        { status: 400 }
      );
    }

    const period =
      body.period;

    if (
      !isValidPeriod(period)
    ) {
      return NextResponse.json(
        {
          error:
            "period must be daily, weekly, or monthly.",
        },
        { status: 400 }
      );
    }

    const amount =
      Number(
        body.amount
      );

    if (
      !Number.isFinite(
        amount
      ) ||
      amount < 0
    ) {
      return NextResponse.json(
        {
          error:
            "amount must be a non-negative number.",
        },
        { status: 400 }
      );
    }

    const detectedCurrency =
      getDominantCostCurrency();

    const requestedCurrency =
      typeof body.currency ===
      "string"
        ? body.currency
            .trim()
            .toUpperCase()
        : "";

    const currency =
      requestedCurrency ||
      detectedCurrency;

    if (!currency) {
      return NextResponse.json(
        {
          error:
            "No verified official cost currency is available yet. Import verified usage before setting a budget.",
        },
        { status: 400 }
      );
    }

    if (
      detectedCurrency &&
      currency !==
        detectedCurrency
    ) {
      return NextResponse.json(
        {
          error:
            `Budget currency ${currency} does not match the verified cost currency ${detectedCurrency}. Currency conversion is not supported in V1.`,
          detected_currency:
            detectedCurrency,
        },
        { status: 400 }
      );
    }

    const now =
      new Date().toISOString();

    const amountMicros =
      Math.round(
        amount * 1_000_000
      );

    const existing =
      getBudgetByPeriodAndCurrency(
        period,
        currency
      );

    if (
      existing?.id
    ) {
      updateBudget(
        existing.id,
        amountMicros,
        now
      );

      return NextResponse.json({
        ok: true,
        id: existing.id,
        period,
        amount_micros:
          amountMicros,
        currency,
        action: "updated",
      });
    }

    const id =
      crypto.randomUUID();

    insertBudget({
      id,
      period,
      amountMicros,
      currency,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({
      ok: true,
      id,
      period,
      amount_micros:
        amountMicros,
      currency,
      action: "created",
    });
  } catch (error) {
    console.error(
      "[Budget API] Failed to save budget:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save budget.",
      },
      { status: 500 }
    );
  }
}