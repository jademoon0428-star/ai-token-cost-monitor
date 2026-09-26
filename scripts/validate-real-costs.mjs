// scripts/validate-real-costs.mjs

import { parseCodexLocal } from "../lib/parsers/codex.ts";
import { parseClineLocal } from "../lib/parsers/cline.ts";

import {
  calculateCost,
  microsToCurrency,
  currencyToMicros,
} from "../lib/cost-engine.ts";

function money(value, digits = 8) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }

  return value.toFixed(digits);
}

function sum(records, field) {
  return records.reduce(
    (total, record) =>
      total + Number(record[field] ?? 0),
    0,
  );
}

function duplicateCount(records) {
  const seen = new Set();
  let duplicates = 0;

  for (const record of records) {
    if (seen.has(record.fingerprint)) {
      duplicates += 1;
    }

    seen.add(record.fingerprint);
  }

  return duplicates;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

console.log("");
console.log("==============================================");
console.log(" ai-token-cost-monitor");
console.log(" REAL LOCAL COST VALIDATION");
console.log(" Cline + Codex");
console.log("==============================================");
console.log("");

/*
 * ============================================================
 * 1. REAL CLINE DATA
 * ============================================================
 */

console.log("Scanning REAL Cline local data...");

const cline = parseClineLocal({
  maxFiles: 2000,
});

console.log("");
console.log("CLINE");
console.log("----------------------------------------------");

console.log(
  "Scanned files :",
  cline.scannedFiles,
);

console.log(
  "Records       :",
  cline.records.length,
);

console.log(
  "Skipped       :",
  cline.skipped,
);

console.log(
  "Errors        :",
  cline.errors.length,
);

assert(
  cline.records.length > 0,
  "No real Cline usage records found.",
);

assert(
  cline.errors.length === 0,
  `Cline parser has ${cline.errors.length} errors.`,
);

const clineDuplicates =
  duplicateCount(cline.records);

assert(
  clineDuplicates === 0,
  `Cline duplicate fingerprints: ${clineDuplicates}`,
);

/*
 * Cline cost validation
 *
 * Source cost may contain more than 6 decimal places.
 *
 * Cost Engine stores integer micro-currency:
 *
 * 1 currency unit = 1,000,000 micros
 *
 * Therefore compare:
 *
 * round(sourceCost * 1,000,000)
 *
 * against:
 *
 * engine.totalCostMicros
 */

let clineExactCount = 0;
let clineSourceCost = 0;
let clineEngineCost = 0;

for (const record of cline.records) {
  const result = calculateCost(record);

  assert(
    result !== null,
    `Cline record could not produce a cost: ${record.fingerprint}`,
  );

  console.log("");
  console.log("Cline record");
  console.log("  model       :", record.model);
  console.log("  provider    :", record.provider);
  console.log("  input       :", record.inputTokens);
  console.log("  output      :", record.outputTokens);
  console.log("  cached      :", record.cachedTokens);
  console.log("  source cost :", record.cost);
  console.log("  currency    :", record.currency);
  console.log("  accuracy    :", result.accuracy);
  console.log(
    "  engine cost :",
    microsToCurrency(result.totalCostMicros),
  );

  assert(
    result.accuracy === "exact",
    `Cline record was not classified as exact: ${record.fingerprint}`,
  );

  assert(
    record.cost !== null &&
      record.cost !== undefined,
    `Cline record has no source cost: ${record.fingerprint}`,
  );

  /*
   * Compare at the same storage precision.
   */
  const sourceMicros =
    currencyToMicros(record.cost);

  const engineMicros =
    result.totalCostMicros;

  console.log(
    "  source micros:",
    sourceMicros,
  );

  console.log(
    "  engine micros:",
    engineMicros,
  );

  assert(
    sourceMicros === engineMicros,
    `Cline micro-cost mismatch. sourceMicros=${sourceMicros}, engineMicros=${engineMicros}`,
  );

  clineExactCount += 1;

  clineSourceCost += Number(record.cost);

  clineEngineCost +=
    microsToCurrency(
      result.totalCostMicros,
    );
}

console.log("");
console.log("Cline summary");
console.log("----------------------------------------------");

console.log(
  "Exact records :",
  clineExactCount,
);

console.log(
  "Source cost   :",
  money(clineSourceCost),
);

console.log(
  "Stored cost   :",
  money(clineEngineCost),
);

console.log(
  "Currency      :",
  cline.records[0]?.currency ?? "unknown",
);

console.log(
  "Duplicates    :",
  clineDuplicates,
);

console.log(
  "Cost precision: micro-currency",
);

/*
 * ============================================================
 * 2. REAL CODEX DATA
 * ============================================================
 */

console.log("");
console.log("Scanning REAL Codex local data...");

const codex = parseCodexLocal({
  maxFiles: 5000,
});

console.log("");
console.log("CODEX");
console.log("----------------------------------------------");

console.log(
  "Scanned files :",
  codex.scannedFiles,
);

console.log(
  "Records       :",
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

assert(
  codex.records.length > 0,
  "No real Codex usage records found.",
);

assert(
  codex.errors.length === 0,
  `Codex parser has ${codex.errors.length} errors.`,
);

const codexDuplicates =
  duplicateCount(codex.records);

assert(
  codexDuplicates === 0,
  `Codex duplicate fingerprints: ${codexDuplicates}`,
);

/*
 * ============================================================
 * 3. CODEX TOKEN INTEGRITY
 * ============================================================
 */

const codexInput = sum(
  codex.records,
  "inputTokens",
);

const codexOutput = sum(
  codex.records,
  "outputTokens",
);

const codexCached = sum(
  codex.records,
  "cachedTokens",
);

const codexReasoning = sum(
  codex.records,
  "reasoningTokens",
);

const codexTotal = sum(
  codex.records,
  "totalTokens",
);

console.log("");
console.log("Codex real token totals");
console.log("----------------------------------------------");

console.log(
  "Input tokens     :",
  codexInput,
);

console.log(
  "Output tokens    :",
  codexOutput,
);

console.log(
  "Cached tokens    :",
  codexCached,
);

console.log(
  "Reasoning tokens :",
  codexReasoning,
);

console.log(
  "Total tokens     :",
  codexTotal,
);

const codexExpectedTotal =
  codexInput + codexOutput;

assert(
  codexTotal === codexExpectedTotal,
  `Codex total mismatch. total=${codexTotal}, expected=${codexExpectedTotal}`,
);

console.log(
  "Token integrity  : PASS",
);

/*
 * ============================================================
 * 4. CODEX COST CALCULATION
 * ============================================================
 *
 * This is NOT an official Codex bill.
 *
 * It is a calculated cost based on the published
 * GPT-5-Codex standard pricing supplied to the Cost Engine.
 *
 * Input        = $1.25 / 1M
 * Cached input = $0.125 / 1M
 * Output       = $10 / 1M
 *
 * Reasoning tokens are already part of output usage,
 * so they are NOT charged again.
 */

const CODEX_PRICING = {
  inputPerMillion: 1.25,
  cachedPerMillion: 0.125,
  outputPerMillion: 10,
  currency: "USD",
  version:
    "gpt-5-codex-standard-public-pricing",
};

let codexCalculatedCostMicros = 0;
let codexCalculatedRecords = 0;

for (const record of codex.records) {
  const result = calculateCost(
    record,
    CODEX_PRICING,
  );

  assert(
    result !== null,
    `Codex record could not be calculated: ${record.fingerprint}`,
  );

  assert(
    result.accuracy === "calculated",
    `Codex record should be calculated: ${record.fingerprint}`,
  );

  codexCalculatedCostMicros +=
    result.totalCostMicros;

  codexCalculatedRecords += 1;
}

console.log("");
console.log("Codex calculated cost");
console.log("----------------------------------------------");

console.log(
  "Calculated records :",
  codexCalculatedRecords,
);

console.log(
  "Calculated micros  :",
  codexCalculatedCostMicros,
);

console.log(
  "Calculated cost    :",
  money(
    microsToCurrency(
      codexCalculatedCostMicros,
    ),
  ),
  "USD",
);

console.log(
  "Accuracy           : calculated",
);

console.log(
  "Pricing version    :",
  CODEX_PRICING.version,
);

console.log(
  "Duplicates         :",
  codexDuplicates,
);

/*
 * ============================================================
 * 5. FINAL RESULT
 * ============================================================
 */

console.log("");
console.log("==============================================");
console.log(" VALIDATION SUMMARY");
console.log("==============================================");

console.log("");

console.log("CLINE");
console.log("----------------------------------------------");

console.log(
  "Records          :",
  clineExactCount,
);

console.log(
  "Source cost      :",
  money(clineSourceCost),
  cline.records[0]?.currency ?? "",
);

console.log(
  "Stored cost      :",
  money(clineEngineCost),
  cline.records[0]?.currency ?? "",
);

console.log(
  "Accuracy         : exact",
);

console.log(
  "Duplicate check  : PASS",
);

console.log(
  "Micro-cost check : PASS",
);

console.log("");

console.log("CODEX");
console.log("----------------------------------------------");

console.log(
  "Records          :",
  codexCalculatedRecords,
);

console.log(
  "Input tokens     :",
  codexInput,
);

console.log(
  "Output tokens    :",
  codexOutput,
);

console.log(
  "Cached tokens    :",
  codexCached,
);

console.log(
  "Reasoning tokens :",
  codexReasoning,
);

console.log(
  "Total tokens     :",
  codexTotal,
);

console.log(
  "Calculated cost  :",
  money(
    microsToCurrency(
      codexCalculatedCostMicros,
    ),
  ),
  "USD",
);

console.log(
  "Accuracy         : calculated",
);

console.log(
  "Token check      : PASS",
);

console.log(
  "Duplicate check  : PASS",
);

console.log("");

console.log("==============================================");
console.log(" RESULT: PASS");
console.log("==============================================");
console.log("");