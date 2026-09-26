import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  insertUsageRecord,
} from "@/lib/repositories/usage-repository";

import {
  insertCostRecord,
  insertPricingVersion,
} from "@/lib/repositories/cost-repository";

import {
  calculateCost,
} from "@/lib/cost-engine";

import {
  getDeepSeekPricing,
  normalizeDeepSeekResponse,
  type DeepSeekResponseLike,
} from "@/providers/deepseek";

export const runtime = "nodejs";

export async function POST(
  request: Request
) {
  try {
    const response =
      (await request.json()) as DeepSeekResponseLike;

    if (
      !response?.model ||
      !response?.usage
    ) {
      return NextResponse.json(
        {
          error:
            "A DeepSeek API response with model and usage is required",
        },
        { status: 400 }
      );
    }

    const usage =
      normalizeDeepSeekResponse(
        response
      );

    const pricing =
      getDeepSeekPricing(
        usage.timestamp,
        usage.model
      );

    const cost =
      calculateCost(
        usage,
        pricing
      );

    const usageId =
      usage.id ?? randomUUID();

    insertUsageRecord(
      {
        ...usage,
        id: usageId,
        source: "official_api",
        accuracy: "verified",
      },
      {
        ignoreDuplicate: true,
      }
    );

    insertPricingVersion(
      {
        id: pricing.version,
        providerId: "provider_deepseek",
        model: usage.model,
        currency: pricing.currency,
        inputPerMillion:
          pricing.inputPerMillion,
        outputPerMillion:
          pricing.outputPerMillion,
        cachedPerMillion:
          pricing.cachedPerMillion ?? 0,
        reasoningPerMillion:
          pricing.reasoningPerMillion ?? 0,
        effectiveFrom:
          usage.timestamp,
      },
      {
        ignoreDuplicate: true,
      }
    );

    if (cost) {
      insertCostRecord(
        {
          id: randomUUID(),
          usageRecordId: usageId,
          inputCostMicros:
            cost.inputCostMicros,
          outputCostMicros:
            cost.outputCostMicros,
          cachedCostMicros:
            cost.cachedCostMicros,
          reasoningCostMicros:
            cost.reasoningCostMicros,
          totalCostMicros:
            cost.totalCostMicros,
          currency:
            cost.currency,
          pricingVersion:
            cost.pricingVersion,
          provenance:
            "source_reported",
        },
        {
          ignoreDuplicate: true,
        }
      );
    }

    return NextResponse.json(
      {
        usage,
        pricing,
        cost,
        status: "stored",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "[DeepSeek API] Failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to store DeepSeek usage.",
      },
      { status: 500 }
    );
  }
}