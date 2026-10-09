import { NextResponse } from "next/server";

import {
  startCommercialTrial,
} from "@/lib/services/commercial-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const lifecycle =
      startCommercialTrial();

    return NextResponse.json({
      success: true,
      lifecycle,
    });
  } catch (error) {
    console.error(
      "[Commercial API] Failed to start commercial trial:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to start commercial trial.",
      },
      { status: 500 }
    );
  }
}
