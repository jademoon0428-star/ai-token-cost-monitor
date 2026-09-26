import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  insertUsageRecord,
} from "@/lib/repositories/usage-repository";

import {
  insertCostRecord,
} from "@/lib/repositories/cost-repository";

import {
  calculateCost,
  type PricingRule,
} from "@/lib/cost-engine";

import type { NormalizedUsage } from "@/providers/types";

export const runtime = "nodejs";

type ImportPayload = {
  usage: NormalizedUsage[];
  pricing?: Record<string, PricingRule>;
};

export async function POST(
  request: Request
) {
  try {
    const body =
      (await request.json()) as ImportPayload;

    if (
      !Array.isArray(body.usage) ||
      body.usage.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "usage must be a non-empty array",
        },
        { status: 400 }
      );
    }

    let imported = 0;
    let costed = 0;

    const errors: string[] = [];

    for (const item of body.usage) {
      try {
        if (
          !item.provider ||
          !item.model ||
          !item.timestamp ||
          !item.source ||
          !item.accuracy
        ) {
          throw new Error(
            "missing required fields"
          );
        }

        const id =
          item.id ?? randomUUID();

        insertUsageRecord(
          {
            ...item,
            id,
          },
          {
            ignoreDuplicate: true,
          }
        );

        imported++;

        const pricing =
          body.pricing?.[
            `${item.provider}:${item.model}`
          ];

        if (!pricing) {
          continue;
        }

        const result =
          calculateCost(
            item,
            pricing
          );

        if (!result) {
          continue;
        }

        const provenance =
          item.source === "official_api" ||
            item.source === "official_export"
            ? "source_reported"
            : item.accuracy === "estimated" ||
                item.source === "local_estimate"
              ? "estimated"
              : "unknown";

        insertCostRecord(
          {
            id: randomUUID(),
            usageRecordId: id,
            inputCostMicros:
              result.inputCostMicros,
            outputCostMicros:
              result.outputCostMicros,
            cachedCostMicros:
              result.cachedCostMicros,
            reasoningCostMicros:
              result.reasoningCostMicros,
            totalCostMicros:
              result.totalCostMicros,
            currency:
              result.currency,
            pricingVersion:
              result.pricingVersion,
            provenance,
          }
        );

        costed++;
      } catch (error) {
        errors.push(
          `${item.provider ?? "?"}/${
            item.model ?? "?"
          }: ${
            error instanceof Error
              ? error.message
              : "invalid record"
          }`
        );
      }
    }

    return NextResponse.json({
      imported,
      costed,
      errors,
    });
  } catch (error) {
    console.error(
      "[Import API] Failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to import usage data.",
      },
      { status: 500 }
    );
  }
}