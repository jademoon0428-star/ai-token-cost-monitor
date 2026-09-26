import { NextResponse } from "next/server";

import {
  getEfficiencyInsights,
} from "@/lib/services/efficiency-service";

import {
  validateTimeZone,
  type Period,
} from "@/lib/services/cost-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/*
 * Efficiency measurement only covers the Money Layer.
 *
 * Activity Layer records are never part of token or cost
 * measurements, therefore includeLocalEvidence is always
 * false and clients cannot enable local evidence here.
 */
const DEFAULT_TIME_ZONE =
  "Asia/Singapore";

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

export async function GET(
  request: Request
) {
  try {
    const { searchParams } =
      new URL(request.url);

    const period =
      normalizePeriod(
        searchParams.get("period")
      );

    const timeZone =
      searchParams.get("timezone") ??
      DEFAULT_TIME_ZONE;

    const includeLocalEvidence =
      searchParams.get(
        "includeLocalEvidence"
      );

    if (
      includeLocalEvidence !== null &&
      includeLocalEvidence !== "false"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Local evidence is not supported for efficiency measurements.",
        },
        { status: 400 }
      );
    }

    if (!validateTimeZone(timeZone)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid timezone",
          timezone: timeZone,
        },
        { status: 400 }
      );
    }

    const insights =
      await getEfficiencyInsights({
        period,
        timeZone,
      });

    return NextResponse.json({
      success: true,
      ...insights,
    });
  } catch (error) {
    console.error(
      "[Efficiency API] Failed to compute efficiency insights:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Failed to compute efficiency insights.",
      },
      { status: 500 }
    );
  }
}