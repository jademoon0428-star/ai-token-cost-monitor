import { NextResponse } from "next/server";

import {
  getCostDailyBreakdown,
  getCostModelBreakdown,
  getCostProviderBreakdown,
  getCostTotal,
  getMostUsedCostCurrency,
} from "@/lib/repositories/cost-repository";

export const runtime = "nodejs";

export async function GET() {
  try {
    const models =
      getCostModelBreakdown();

    const daily =
      getCostDailyBreakdown();

    const byProvider =
      getCostProviderBreakdown();

    const total =
      getCostTotal();

    const currency =
      getMostUsedCostCurrency();

    return NextResponse.json({
      models,
      daily,
      byProvider,
      total,
      currency,
    });
  } catch (error) {
    console.error(
      "[Costs API] Failed to load costs:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load cost data.",
      },
      { status: 500 }
    );
  }
}