import fs from "node:fs";
import path from "node:path";

const CLINE_ROOT = path.join(
  process.env.APPDATA ?? "",
  "Code",
  "User",
  "globalStorage",
  "saoudrizwan.claude-dev",
  "tasks",
);

const PRICING = {
  inputPerMillion: 0,
  cacheReadPerMillion: 0.07,
  cacheWritePerMillion: 0.27,
  outputPerMillion: 1.10,
};

function roundMicros(value) {
  return Math.round(value * 1_000_000);
}

function costMicros(tokens, pricePerMillion) {
  return roundMicros((tokens / 1_000_000) * pricePerMillion);
}

// Cline's source cost is calculated from the aggregate floating-point
// amount and rounded only once at the end.
// Do not round each component before summing.
function calculatedCostMicros(record) {
  const inputCost =
    (record.tokensIn / 1_000_000) * PRICING.inputPerMillion;

  const cacheReadCost =
    (record.cacheReads / 1_000_000) * PRICING.cacheReadPerMillion;

  const cacheWriteCost =
    (record.cacheWrites / 1_000_000) * PRICING.cacheWritePerMillion;

  const outputCost =
    (record.tokensOut / 1_000_000) * PRICING.outputPerMillion;

  return roundMicros(
    inputCost + cacheReadCost + cacheWriteCost + outputCost,
  );
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];

  const result = [];

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      result.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      result.push(fullPath);
    }
  }

  return result;
}

function parseNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function parseRecord(message, sourceFile, taskDir) {
  if (!message || message.say !== "api_req_started") {
    return null;
  }

  let requestData;

  try {
    requestData =
      typeof message.text === "string"
        ? JSON.parse(message.text)
        : message.text;
  } catch {
    return null;
  }

  if (!requestData || typeof requestData !== "object") {
    return null;
  }

  const tokensIn = parseNumber(requestData.tokensIn);
  const tokensOut = parseNumber(requestData.tokensOut);
  const cacheReads = parseNumber(requestData.cacheReads);
  const cacheWrites = parseNumber(requestData.cacheWrites);
  const sourceCost = Number(requestData.cost);

  return {
    sourceFile,
    taskDir,
    tokensIn,
    tokensOut,
    cacheReads,
    cacheWrites,
    sourceCost: Number.isFinite(sourceCost) ? sourceCost : null,
    providerId:
      requestData.providerId ??
      requestData.provider ??
      null,
    modelId:
      requestData.modelId ??
      requestData.model ??
      null,
  };
}

function collectRecords() {
  const files = walkFiles(CLINE_ROOT).filter(
    (file) => path.basename(file).toLowerCase() === "ui_messages.json",
  );

  const records = [];

  for (const file of files) {
    let data;

    try {
      data = readJson(file);
    } catch {
      continue;
    }

    const messages = Array.isArray(data) ? data : [];
    const taskDir = path.dirname(file);

    for (const message of messages) {
      const record = parseRecord(message, file, taskDir);

      if (record) {
        records.push(record);
      }
    }
  }

  return {
    files,
    records,
  };
}

function main() {
  console.log("=== Cline cache semantics validation ===");
  console.log(`Cline root: ${CLINE_ROOT}`);

  const { files, records } = collectRecords();

  console.log(`ui_messages.json files: ${files.length}`);
  console.log(`API request records: ${records.length}`);
  console.log("");

  if (records.length === 0) {
    console.log("FAIL: No Cline API request records found.");
    process.exitCode = 1;
    return;
  }

  let sourceTotalMicros = 0;
  let calculatedTotalMicros = 0;
  let failures = 0;

  for (const [index, record] of records.entries()) {
    const calculatedMicros = calculatedCostMicros(record);

    const sourceMicros =
      record.sourceCost === null
        ? null
        : roundMicros(record.sourceCost);

    sourceTotalMicros += sourceMicros ?? 0;
    calculatedTotalMicros += calculatedMicros;

    const inputMicros = costMicros(
      record.tokensIn,
      PRICING.inputPerMillion,
    );

    const cacheReadMicros = costMicros(
      record.cacheReads,
      PRICING.cacheReadPerMillion,
    );

    const cacheWriteMicros = costMicros(
      record.cacheWrites,
      PRICING.cacheWritePerMillion,
    );

    const outputMicros = costMicros(
      record.tokensOut,
      PRICING.outputPerMillion,
    );

    console.log(`Record #${index + 1}`);
    console.log(`  provider: ${record.providerId ?? "null"}`);
    console.log(`  model: ${record.modelId ?? "null"}`);
    console.log(`  input tokens: ${record.tokensIn}`);
    console.log(`  cache read tokens: ${record.cacheReads}`);
    console.log(`  cache write tokens: ${record.cacheWrites}`);
    console.log(`  output tokens: ${record.tokensOut}`);

    console.log(
      `  input cost: ${(inputMicros / 1_000_000).toFixed(6)}`,
    );

    console.log(
      `  cache read cost: ${(cacheReadMicros / 1_000_000).toFixed(6)}`,
    );

    console.log(
      `  cache write cost: ${(cacheWriteMicros / 1_000_000).toFixed(6)}`,
    );

    console.log(
      `  output cost: ${(outputMicros / 1_000_000).toFixed(6)}`,
    );

    console.log(
      `  source cost: ${
        record.sourceCost === null
          ? "null"
          : record.sourceCost.toFixed(8)
      }`,
    );

    console.log(
      `  calculated cost: ${(calculatedMicros / 1_000_000).toFixed(6)}`,
    );

    if (sourceMicros === null) {
      console.log("  result: SKIP (no source cost)");
      console.log("");
      continue;
    }

    const passed = sourceMicros === calculatedMicros;

    console.log(
      `  verification: source=${sourceMicros} calculated=${calculatedMicros} -> ${
        passed ? "PASS" : "FAIL"
      }`,
    );

    if (!passed) {
      failures += 1;
    }

    console.log("");
  }

  console.log("=== Totals ===");

  console.log(
    `Source cost total: ${(sourceTotalMicros / 1_000_000).toFixed(6)}`,
  );

  console.log(
    `Calculated cost total: ${(calculatedTotalMicros / 1_000_000).toFixed(6)}`,
  );

  console.log(
    `Difference: ${(
      (calculatedTotalMicros - sourceTotalMicros) /
      1_000_000
    ).toFixed(6)}`,
  );

  console.log("");

  if (failures > 0) {
    console.log(
      `FAIL: ${failures} Cline record(s) failed cost verification.`,
    );

    process.exitCode = 1;
    return;
  }

  console.log(
    "PASS: Cline cache read/cache write semantics and source costs verified.",
  );
}

main();