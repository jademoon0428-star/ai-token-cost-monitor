import { NextResponse } from "next/server";

import {
  getMostUsedCurrency,
  getUsageRecords,
  getUsageSummary,
  insertUsageRecord,
} from "@/lib/repositories/usage-repository";

import { autoAttributeUsageRecord } from "@/lib/services/task-service";

import type { NormalizedUsage } from "@/providers/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    const usage = getUsageRecords({
      limit: 100,
    });

    const summary = getUsageSummary();
    const currency = getMostUsedCurrency();

    return NextResponse.json({
      count: usage.length,
      usage,
      summary,
      currency,
    });
  } catch (error) {
    console.error(
      "[Usage API] Failed to load usage:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load usage data.",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request
) {
  try {
    const body =
      (await request.json()) as NormalizedUsage;

    if (
      !body.provider ||
      !body.model ||
      !body.timestamp ||
      !body.source ||
      !body.accuracy
    ) {
      return NextResponse.json(
        {
          error:
            "provider, model, timestamp, source and accuracy are required",
        },
        { status: 400 }
      );
    }

    const id = insertUsageRecord(body);

    /*
     * Attribution is an extra step layered on top of storing the
     * usage record, not part of it. The row is already committed, so
     * this runs strictly afterwards and never rolls it back: the
     * request only fails if storing the usage itself failed, which
     * has already been handled above.
     */
    let attribution: string;

    try {
      attribution = autoAttributeUsageRecord({
        usageRecordId: id,
      });
    } catch (error) {
      console.warn(
        "[Usage API] Usage was stored but automatic task attribution failed:",
        error
      );

      attribution = "failed";
    }

    return NextResponse.json(
      {
        id,
        status: "created",
        task_attribution: attribution,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "[Usage API] Failed to store usage:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to store usage record.",
      },
      { status: 500 }
    );
  }
}