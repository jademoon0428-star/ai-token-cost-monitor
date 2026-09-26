import { NextRequest, NextResponse } from "next/server";

import {
  getUnifiedCostData,
  validateTimeZone,
  type Period,
} from "@/lib/services/cost-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  return "today";
}

export async function GET(
  request: NextRequest
) {
  try {
    const searchParams =
      request.nextUrl.searchParams;

    const period =
      normalizePeriod(
        searchParams.get("period")
      );

    const timeZone =
      searchParams.get("timezone") ??
      "Asia/Singapore";

    const includeLocalEvidence =
      searchParams.get(
        "includeLocalEvidence"
      ) !== "false";

    if (
      !validateTimeZone(timeZone)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid timezone",
          timezone: timeZone,
        },
        { status: 400 }
      );
    }

    const data =
      await getUnifiedCostData({
        period,
        timeZone,
        includeLocalEvidence,
      });

    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error(
      "[Unified Costs] Failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load unified costs.",
      },
      { status: 500 }
    );
  }
}