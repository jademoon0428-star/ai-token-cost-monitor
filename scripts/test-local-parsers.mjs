// scripts/test-local-parsers.mjs

import { parseCodexLocal } from "../lib/parsers/codex.ts";
import { parseClineLocal } from "../lib/parsers/cline.ts";

function printRecord(record) {
  console.log({
    application: record.application,
    provider: record.provider,
    model: record.model,

    timestamp: record.timestamp,

    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    cachedTokens: record.cachedTokens,
    reasoningTokens: record.reasoningTokens,
    totalTokens: record.totalTokens,

    cost: record.cost,
    currency: record.currency,

    accuracy: record.accuracy,

    project: record.project,
    sessionId: record.sessionId,

    sourceFile: record.sourceFile,
  });
}

console.log("");
console.log("========================================");
console.log(" ai-token-cost-monitor");
console.log(" MVP-1 LOCAL PARSER TEST");
console.log("========================================");
console.log("");

/* =========================================================
 * CODEX
 * ========================================================= */

console.log("Scanning Codex...");

const codex = parseCodexLocal({
  maxFiles: 5000,
});

console.log("");
console.log("CODEX RESULT");
console.log("----------------------------------------");

console.log(
  "Scanned files :",
  codex.scannedFiles,
);

console.log(
  "Parsed records:",
  codex.records.length,
);

console.log(
  "Skipped       :",
  codex.skipped,
);

console.log(
  "Errors        :",
  codex.errors.length,
);

if (codex.errors.length > 0) {
  console.log("");
  console.log("First Codex errors:");

  codex.errors
    .slice(0, 5)
    .forEach((error) => {
      console.log(error);
    });
}

if (codex.records.length > 0) {
  console.log("");
  console.log("First 5 Codex records:");

  codex.records
    .slice(0, 5)
    .forEach(printRecord);
} else {
  console.log("");
  console.log(
    "NO CODEX USAGE RECORDS FOUND",
  );
}

/* =========================================================
 * CLINE
 * ========================================================= */

console.log("");
console.log("Scanning Cline...");

const cline = parseClineLocal({
  maxFiles: 2000,
});

console.log("");
console.log("CLINE RESULT");
console.log("----------------------------------------");

console.log(
  "Scanned task dirs:",
  cline.scannedFiles,
);

console.log(
  "Parsed records   :",
  cline.records.length,
);

console.log(
  "Skipped          :",
  cline.skipped,
);

console.log(
  "Errors           :",
  cline.errors.length,
);

if (cline.errors.length > 0) {
  console.log("");
  console.log("First Cline errors:");

  cline.errors
    .slice(0, 5)
    .forEach((error) => {
      console.log(error);
    });
}

if (cline.records.length > 0) {
  console.log("");
  console.log("First 5 Cline records:");

  cline.records
    .slice(0, 5)
    .forEach(printRecord);
} else {
  console.log("");
  console.log(
    "NO CLINE USAGE RECORDS FOUND",
  );
}

/* =========================================================
 * SUMMARY
 * ========================================================= */

console.log("");
console.log("========================================");
console.log(" TEST COMPLETE");
console.log("========================================");
console.log("");

console.log(
  JSON.stringify(
    {
      codex: {
        files: codex.scannedFiles,
        records: codex.records.length,
        skipped: codex.skipped,
        errors: codex.errors.length,
      },

      cline: {
        tasks: cline.scannedFiles,
        records: cline.records.length,
        skipped: cline.skipped,
        errors: cline.errors.length,
      },
    },
    null,
    2,
  ),
);