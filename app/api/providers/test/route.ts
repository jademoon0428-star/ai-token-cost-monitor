import { NextResponse } from "next/server";

import {
  getProviderConnector,
} from "@/lib/providers/registry";

export const runtime = "nodejs";

export async function POST(
  request: Request
) {
  try {
    const body = await request.json();

    const provider = String(
      body?.provider ?? ""
    ).trim();

    const apiKey = String(
      body?.apiKey ?? ""
    ).trim();

    if (!provider) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Provider is required.",
        },
        { status: 400 }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          message:
            "API key is required.",
        },
        { status: 400 }
      );
    }

    const connector =
      getProviderConnector(provider);

    if (!connector) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Unsupported provider.",
        },
        { status: 400 }
      );
    }

    const result =
      await connector.testConnection(
        apiKey
      );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Connection test failed.",
      },
      { status: 500 }
    );
  }
}