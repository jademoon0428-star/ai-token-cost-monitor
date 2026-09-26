import { NextResponse } from "next/server";

import {
  getAIActivity,
} from "@/lib/detection/ai-consumer";

import {
  getAIActivityCache,
  isAIActivityCacheFresh,
  setAIActivityCache,
} from "@/lib/cache/ai-activity-cache";

import {
  addAIActivityEvent,
  getAIActivityHistory,
} from "@/lib/storage/ai-activity-history";

export const runtime = "nodejs";

// IMPORTANT:
// AI Activity is live local-machine data.
// Never allow Next.js/browser/CDN caching here.
export const dynamic = "force-dynamic";
export const revalidate = 0;

let scanning = false;

export async function GET() {
  const cached = getAIActivityCache();

  /*
    If there is no cache and no scan is running,
    start the scan in the background.

    The HTTP request itself must remain fast.
  */
  if (
    !scanning &&
    !isAIActivityCacheFresh(cached)
  ) {
    startBackgroundScan();
  }

  const response = {
    success: true,

    timestamp:
      cached?.timestamp || "",

    scannedProcesses:
      cached?.scannedProcesses ?? 0,

    scannedConnections:
      cached?.scannedConnections ?? 0,

    tcpScanStatus:
      cached?.tcpScanStatus ??
      "failed",

    detectedCount:
      cached?.aiConsumers.length ?? 0,

    consumers:
      cached?.aiConsumers ?? [],

    history:
      getAIActivityHistory(),

    cached:
      cached !== null,

    scanning,
  };

  return NextResponse.json(
    response,
    {
      headers: {
        "Cache-Control":
          "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    }
  );
}

/*
  Start the expensive Windows scan
  without blocking the HTTP request.
*/
function startBackgroundScan() {
  if (scanning) {
    return;
  }

  scanning = true;

  console.log(
    "[AI Activity] Background scan started."
  );

  getAIActivity()
    .then((freshResult) => {
      console.log(
        "[AI Activity] Background scan completed.",
        {
          scannedProcesses:
            freshResult.scannedProcesses,

          scannedConnections:
            freshResult.scannedConnections,

          detectedCount:
            freshResult.aiConsumers.length,
        }
      );

      /*
        IMPORTANT:
        Save the completed scan BEFORE
        releasing the scanning flag.
      */
      setAIActivityCache(
        freshResult
      );

      addAIActivityEvent(
        freshResult.aiConsumers
      );
    })
    .catch((error) => {
      console.error(
        "[AI Activity] Background scan failed:",
        error
      );
    })
    .finally(() => {
      scanning = false;

      console.log(
        "[AI Activity] Background scan state reset."
      );
    });
}