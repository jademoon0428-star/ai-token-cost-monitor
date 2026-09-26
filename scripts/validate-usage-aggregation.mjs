import { parseCodexLocal } from "../lib/parsers/codex.ts";
import { parseClineLocal } from "../lib/parsers/cline.ts";

function divider(title) {
  console.log("\n" + "=".repeat(60));
  console.log(` ${title}`);
  console.log("=".repeat(60));
}

function sum(records, field) {
  return records.reduce((total, record) => {
    return total + (Number(record[field]) || 0);
  }, 0);
}

function moneySum(records) {
  return records.reduce((total, record) => {
    return total + (Number(record.cost) || 0);
  }, 0);
}

function groupBy(records, field) {
  const groups = new Map();

  for (const record of records) {
    const key = record[field] ?? "(null)";

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(record);
  }

  return groups;
}

function printNumber(label, value) {
  console.log(`${label.padEnd(24)} ${value.toLocaleString()}`);
}

function printMoney(label, value) {
  console.log(
    `${label.padEnd(24)} ${value.toFixed(8)}`
  );
}

/* =========================================================
   CODEX
========================================================= */

divider("CODEX AGGREGATION VALIDATION");

const codex = parseCodexLocal({
  maxFiles: 1000,
});

const codexRecords = codex.records;

console.log(`Scanned files : ${codex.scannedFiles}`);
console.log(`Parsed records: ${codexRecords.length}`);
console.log(`Skipped       : ${codex.skipped}`);
console.log(`Errors        : ${codex.errors.length}`);

if (codex.errors.length > 0) {
  console.log("\nCodex errors:");
  for (const error of codex.errors) {
    console.log("-", error);
  }
}

printNumber(
  "Input tokens",
  sum(codexRecords, "inputTokens")
);

printNumber(
  "Output tokens",
  sum(codexRecords, "outputTokens")
);

printNumber(
  "Cached tokens",
  sum(codexRecords, "cachedTokens")
);

printNumber(
  "Reasoning tokens",
  sum(codexRecords, "reasoningTokens")
);

printNumber(
  "Total tokens",
  sum(codexRecords, "totalTokens")
);

const codexSessions = groupBy(
  codexRecords,
  "sessionId"
);

console.log(`\nCodex sessions: ${codexSessions.size}`);

let codexDuplicateWarning = false;

for (const [sessionId, records] of codexSessions) {
  const totalTokens = sum(records, "totalTokens");

  const timestamps = records
    .map((record) => new Date(record.timestamp).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  const uniqueFingerprints = new Set(
    records.map((record) => record.fingerprint)
  );

  const duplicateCount =
    records.length - uniqueFingerprints.size;

  if (duplicateCount > 0) {
    codexDuplicateWarning = true;
  }

  console.log("\nSession:", sessionId);
  console.log("  Records           :", records.length);
  console.log("  Sum total tokens  :", totalTokens.toLocaleString());
  console.log(
    "  Duplicate records :",
    duplicateCount
  );

  if (timestamps.length > 0) {
    console.log(
      "  First timestamp    :",
      new Date(timestamps[0]).toISOString()
    );

    console.log(
      "  Last timestamp     :",
      new Date(
        timestamps[timestamps.length - 1]
      ).toISOString()
    );
  }
}

/* =========================================================
   CODEX CONSISTENCY CHECK
========================================================= */

divider("CODEX CONSISTENCY CHECK");

const codexInvalid = codexRecords.filter((record) => {
  const input = Number(record.inputTokens) || 0;
  const output = Number(record.outputTokens) || 0;
  const total = Number(record.totalTokens) || 0;

  return total !== input + output;
});

console.log(
  "Records where total != input + output:",
  codexInvalid.length
);

const codexReasoningOverTotal = codexRecords.filter(
  (record) => {
    const reasoning = Number(record.reasoningTokens) || 0;
    const output = Number(record.outputTokens) || 0;
    const total = Number(record.totalTokens) || 0;

    return reasoning > output || reasoning > total;
  }
);

console.log(
  "Records with unusual reasoning/output:",
  codexReasoningOverTotal.length
);

if (codexDuplicateWarning) {
  console.log(
    "\nWARNING: Codex duplicate fingerprints detected."
  );
} else {
  console.log(
    "\nOK: No duplicate Codex fingerprints detected."
  );
}

/* =========================================================
   CLINE
========================================================= */

divider("CLINE AGGREGATION VALIDATION");

const cline = parseClineLocal({
  maxTasks: 1000,
});

const clineRecords = cline.records;

console.log(`Scanned task dirs: ${cline.scannedTasks}`);
console.log(`Parsed records   : ${clineRecords.length}`);
console.log(`Skipped          : ${cline.skipped}`);
console.log(`Errors           : ${cline.errors.length}`);

if (cline.errors.length > 0) {
  console.log("\nCline errors:");
  for (const error of cline.errors) {
    console.log("-", error);
  }
}

printNumber(
  "Input tokens",
  sum(clineRecords, "inputTokens")
);

printNumber(
  "Output tokens",
  sum(clineRecords, "outputTokens")
);

printNumber(
  "Cached tokens",
  sum(clineRecords, "cachedTokens")
);

printNumber(
  "Reasoning tokens",
  sum(clineRecords, "reasoningTokens")
);

printNumber(
  "Total tokens",
  sum(clineRecords, "totalTokens")
);

printMoney(
  "Total cost",
  moneySum(clineRecords)
);

const clineSessions = groupBy(
  clineRecords,
  "sessionId"
);

console.log(`\nCline sessions: ${clineSessions.size}`);

let clineDuplicateWarning = false;

for (const [sessionId, records] of clineSessions) {
  const totalTokens = sum(records, "totalTokens");
  const totalCost = moneySum(records);

  const uniqueFingerprints = new Set(
    records.map((record) => record.fingerprint)
  );

  const duplicateCount =
    records.length - uniqueFingerprints.size;

  if (duplicateCount > 0) {
    clineDuplicateWarning = true;
  }

  console.log("\nSession:", sessionId);
  console.log("  Records          :", records.length);
  console.log(
    "  Sum total tokens :",
    totalTokens.toLocaleString()
  );
  console.log(
    "  Sum cost         :",
    totalCost.toFixed(8)
  );
  console.log(
    "  Duplicate records:",
    duplicateCount
  );
}

/* =========================================================
   CLINE COST CHECK
========================================================= */

divider("CLINE COST CHECK");

const clineWithoutCost = clineRecords.filter(
  (record) => record.cost == null
);

console.log(
  "Records without cost:",
  clineWithoutCost.length
);

const clineWithExactCost = clineRecords.filter(
  (record) => record.accuracy === "exact"
);

console.log(
  "Records marked exact:",
  clineWithExactCost.length
);

const clineDifferentCurrencies = new Set(
  clineRecords
    .map((record) => record.currency)
    .filter(Boolean)
);

console.log(
  "Currencies:",
  [...clineDifferentCurrencies].join(", ") || "(none)"
);

if (clineDuplicateWarning) {
  console.log(
    "\nWARNING: Cline duplicate fingerprints detected."
  );
} else {
  console.log(
    "\nOK: No duplicate Cline fingerprints detected."
  );
}

/* =========================================================
   FINAL VERDICT
========================================================= */

divider("FINAL VALIDATION");

const checks = {
  codexParsed: codexRecords.length > 0,
  codexNoErrors: codex.errors.length === 0,
  codexNoDuplicates: !codexDuplicateWarning,
  codexTotalsConsistent: codexInvalid.length === 0,

  clineParsed: clineRecords.length > 0,
  clineNoErrors: cline.errors.length === 0,
  clineNoDuplicates: !clineDuplicateWarning,
  clineHasCost:
    clineRecords.length > 0 &&
    clineWithoutCost.length === 0,
};

for (const [name, passed] of Object.entries(checks)) {
  console.log(
    `${passed ? "PASS" : "FAIL"}  ${name}`
  );
}

const allPassed = Object.values(checks).every(Boolean);

console.log("\n" + "-".repeat(60));

if (allPassed) {
  console.log(
    "RESULT: PASS — usage aggregation is ready for Cost Engine."
  );
} else {
  console.log(
    "RESULT: REVIEW — do NOT build Cost Engine yet."
  );
}

console.log("-".repeat(60));