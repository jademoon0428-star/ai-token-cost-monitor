import { NextResponse } from "next/server";

import {
  getProviderDefinitions,
} from "@/lib/providers/registry";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    success: true,
    providers:
      getProviderDefinitions(),
  });
}