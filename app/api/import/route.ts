import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Gone. The generic import endpoint is closed. Use POST /api/import/deepseek for official DeepSeek ZIP imports.",
    },
    { status: 410 }
  );
}
