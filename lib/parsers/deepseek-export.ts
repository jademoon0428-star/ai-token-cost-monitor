import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { NormalizedUsage } from "../../providers/types";

const MAX_ZIP_BYTES = 100 * 1024 * 1024;
const MAX_RECORDS = 20_000;

const PROVIDER_NAME = "DeepSeek";
const SOURCE = "official_export";
const ACCURACY = "verified";

export type DeepSeekUsageCostPair = {
  usageId: string;
  costId: string;
  provider: string;
  model: string;
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  application: null;
  project: null;
  source: "official_export";
  accuracy: "verified";
  inputCostMicros: number;
  outputCostMicros: number;
  cachedCostMicros: number;
  reasoningCostMicros: number;
  totalCostMicros: number;
  currency: string;
  pricingVersion: string;
};

export type DeepSeekExportSummary = {
  recordCount: number;
  minTimestamp: string;
  maxTimestamp: string;
  models: string[];
  currency: string;
  totalCostMicros: number;
  totalCost: number;
  source: "official_export";
  accuracy: "verified";
  zipSha256: string;
};

export type DeepSeekExportResult = {
  records: DeepSeekUsageCostPair[];
  summary: DeepSeekExportSummary;
  files: { cost: string; amount: string };
};

function csvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }

  out.push(field);
  return out;
}

function readCsv(file: string): Record<string, string>[] {
  const text = fs
    .readFileSync(file, "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .trim();

  const lines = text.split("\n").filter(Boolean);

  const headers = csvLine(lines.shift() ?? "");

  return lines.map((line) => {
    const values = csvLine(line);
    return Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""])
    );
  });
}

function micros(value: number | string): number {
  return Math.round(Number(value || 0) * 1_000_000);
}

function safeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function deterministicId(...parts: string[]): string {
  return createHash("sha256")
    .update(parts.join("|"))
    .digest("hex")
    .slice(0, 32);
}

function sha256File(file: string): string {
  return createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function assertValidTime(value: string, label: string): void {
  if (Number.isNaN(new Date(value).getTime())) {
    throw new Error(`Invalid ${label} timestamp: ${value}`);
  }
}

function unzipToTemp(zipPath: string, tempDir: string): void {
  const psQuote = (value: string) => `'${String(value).replace(/'/g, "''")}'`;

  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath ${psQuote(zipPath)} -DestinationPath ${psQuote(tempDir)} -Force`,
    ],
    { stdio: "ignore" }
  );
}

export function toNormalizedUsage(
  record: DeepSeekUsageCostPair
): NormalizedUsage & { id: string } {
  return {
    id: record.usageId,
    provider: record.provider,
    model: record.model,
    timestamp: record.timestamp,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    cachedTokens: record.cachedTokens,
    reasoningTokens: record.reasoningTokens,
    source: record.source,
    accuracy: record.accuracy,
  };
}

function buildRecords(
  costRows: Record<string, string>[],
  amountRows: Record<string, string>[],
  zipSha256: string,
  costFile: string,
  amountFile: string
): DeepSeekExportResult {
  const grouped = new Map<
    string,
    {
      model: string;
      start: string;
      end: string;
      inputHit: number;
      inputMiss: number;
      output: number;
    }
  >();

  for (const row of amountRows) {
    assertValidTime(String(row.start_time_iso ?? ""), "amount start_time_iso");
    assertValidTime(String(row.end_time_iso ?? ""), "amount end_time_iso");

    const key = [row.model, row.start_time_iso, row.end_time_iso].join("|");

    let group = grouped.get(key);

    if (!group) {
      group = {
        model: row.model,
        start: row.start_time_iso,
        end: row.end_time_iso,
        inputHit: 0,
        inputMiss: 0,
        output: 0,
      };
      grouped.set(key, group);
    }

    const amount = Number(row.amount || 0);

    if (row.type === "input_cache_hit_tokens") {
      group.inputHit += amount;
    }

    if (row.type === "input_cache_miss_tokens") {
      group.inputMiss += amount;
    }

    if (row.type === "output_tokens") {
      group.output += amount;
    }
  }

  const currencies = new Set<string>();
  const records: DeepSeekUsageCostPair[] = [];

  for (const row of costRows) {
    assertValidTime(String(row.start_time_iso ?? ""), "cost start_time_iso");
    assertValidTime(String(row.end_time_iso ?? ""), "cost end_time_iso");

    const currency = row.currency || "CNY";
    currencies.add(currency);

    const key = [row.model, row.start_time_iso, row.end_time_iso].join("|");

    const group =
      grouped.get(key) ??
      {
        model: row.model,
        start: row.start_time_iso,
        end: row.end_time_iso,
        inputHit: 0,
        inputMiss: 0,
        output: 0,
      };

    const totalCost = micros(row.cost);

    const component = { hit: 0, miss: 0, output: 0 };

    for (const amountRow of amountRows) {
      if (
        amountRow.model === row.model &&
        amountRow.start_time_iso === row.start_time_iso &&
        amountRow.end_time_iso === row.end_time_iso
      ) {
        if (amountRow.type === "input_cache_hit_tokens") {
          component.hit +=
            micros(Number(amountRow.price || 0) * Number(amountRow.amount || 0));
        }

        if (amountRow.type === "input_cache_miss_tokens") {
          component.miss +=
            micros(Number(amountRow.price || 0) * Number(amountRow.amount || 0));
        }

        if (amountRow.type === "output_tokens") {
          component.output +=
            micros(Number(amountRow.price || 0) * Number(amountRow.amount || 0));
        }
      }
    }

    const componentTotal = component.hit + component.miss + component.output;
    const adjustment = totalCost - componentTotal;
    const finalInput = component.miss + adjustment;

    const usageId = `deepseek_export_${deterministicId("usage", key)}`;
    const costId = `deepseek_export_cost_${deterministicId("cost", key)}`;

    records.push({
      usageId,
      costId,
      provider: PROVIDER_NAME,
      model: row.model,
      timestamp: row.start_time_iso,
      inputTokens: Math.trunc(group.inputHit + group.inputMiss),
      outputTokens: Math.trunc(group.output),
      cachedTokens: Math.trunc(group.inputHit),
      reasoningTokens: 0,
      application: null,
      project: null,
      source: SOURCE,
      accuracy: ACCURACY,
      inputCostMicros: Math.max(0, finalInput),
      outputCostMicros: component.output,
      cachedCostMicros: component.hit,
      reasoningCostMicros: 0,
      totalCostMicros: totalCost,
      currency,
      pricingVersion: `deepseek-official-export-${String(
        row.start_time_iso
      ).slice(0, 10)}`,
    });
  }

  if (currencies.size > 1) {
    throw new Error(
      `Mixed currencies in DeepSeek export: ${[...currencies].join(
        ", "
      )}. Refusing to import.`
    );
  }

  const currency = currencies.size === 1 ? [...currencies][0]! : "CNY";

  const timestamps = records.map((record) => record.timestamp);

  const minTimestamp = timestamps.reduce(
    (a, b) => (a < b ? a : b),
    timestamps[0] ?? "1970-01-01T00:00:00.000Z"
  );

  const maxTimestamp = timestamps.reduce(
    (a, b) => (a > b ? a : b),
    timestamps[0] ?? "1970-01-01T00:00:00.000Z"
  );

  const models = [...new Set(records.map((record) => record.model))].sort();

  const totalCostMicros = records.reduce(
    (sum, record) => sum + record.totalCostMicros,
    0
  );

  return {
    records,
    summary: {
      recordCount: records.length,
      minTimestamp,
      maxTimestamp,
      models,
      currency,
      totalCostMicros,
      totalCost: totalCostMicros / 1_000_000,
      source: SOURCE,
      accuracy: ACCURACY,
      zipSha256,
    },
    files: { cost: costFile, amount: amountFile },
  };
}

export function parseDeepSeekExportZip(
  zipPath: string
): DeepSeekExportResult {
  const resolved = path.resolve(zipPath);

  const stat = fs.statSync(resolved);

  if (!stat.isFile()) {
    throw new Error(`Not a file: ${zipPath}`);
  }

  if (stat.size > MAX_ZIP_BYTES) {
    throw new Error(
      `ZIP exceeds the ${Math.round(
        MAX_ZIP_BYTES / (1024 * 1024)
      )} MB processing limit: ${zipPath}`
    );
  }

  const zipSha256 = sha256File(resolved);

  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "ai-token-cost-monitor-deepseek-")
  );

  try {
    unzipToTemp(resolved, tempDir);

    const entries = fs.readdirSync(tempDir);

    const costFile = entries.find((name) => /^cost-.*\.csv$/i.test(name));
    const amountFile = entries.find((name) => /^amount-.*\.csv$/i.test(name));

    if (!costFile || !amountFile) {
      throw new Error(
        "DeepSeek export must contain cost-*.csv and amount-*.csv"
      );
    }

    const costRows = readCsv(path.join(tempDir, costFile));
    const amountRows = readCsv(path.join(tempDir, amountFile));

    if (costRows.length === 0) {
      throw new Error("The cost CSV is empty.");
    }

    if (costRows.length > MAX_RECORDS || amountRows.length > MAX_RECORDS) {
      throw new Error(
        `Export exceeds the ${MAX_RECORDS}-row processing limit.`
      );
    }

    return buildRecords(
      costRows,
      amountRows,
      zipSha256,
      costFile,
      amountFile
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}