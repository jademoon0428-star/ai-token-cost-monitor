import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const PROJECT_ROOT = process.cwd();
const DB_PATH = path.join(
  PROJECT_ROOT,
  "data",
  "ai-token-cost-monitor.db"
);

const IMPORTER_PATH = path.join(
  PROJECT_ROOT,
  "scripts",
  "import-deepseek-export.mjs"
);

const CURRENCY = "CNY";

function printLine(char = "-", length = 72) {
  console.log(char.repeat(length));
}

function money(value) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function safeDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatDate(value) {
  const date = safeDate(value);

  if (!date) {
    return "UNKNOWN";
  }

  return date.toISOString().slice(0, 10);
}

function getDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    return null;
  }

  return new DatabaseSync(DB_PATH);
}

function inspectDatabase(db) {
  const tables = db
    .prepare(
      `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
      ORDER BY name
      `
    )
    .all()
    .map((row) => row.name);

  const usageColumns = db
    .prepare(`PRAGMA table_info(usage_records)`)
    .all()
    .map((row) => row.name);

  const costColumns = db
    .prepare(`PRAGMA table_info(cost_records)`)
    .all()
    .map((row) => row.name);

  return {
    tables,
    usageColumns,
    costColumns,
  };
}

function getDeepSeekProviderId(db) {
  const row = db
    .prepare(
      `
      SELECT id
      FROM providers
      WHERE lower(name) = lower('DeepSeek')
      LIMIT 1
      `
    )
    .get();

  return row?.id ?? null;
}

function getVerifiedCostSummary(db, providerId) {
  if (!providerId) {
    return {
      recordCount: 0,
      totalCost: 0,
      currency: CURRENCY,
      firstTimestamp: null,
      lastTimestamp: null,
    };
  }

  /*
   * DATABASE RELATIONSHIP
   *
   * providers.id
   *      ↓
   * usage_records.provider_id
   *
   * usage_records.id
   *      ↓
   * cost_records.usage_record_id
   *
   * IMPORTANT:
   *
   * accuracy belongs to usage_records.
   * currency and total_cost_micros belong to cost_records.
   *
   * Therefore:
   *
   * u.accuracy = 'verified'
   * c.currency = 'CNY'
   */

  const row = db
    .prepare(
      `
      SELECT
        COUNT(*) AS record_count,
        COALESCE(SUM(c.total_cost_micros), 0) AS total_cost_micros
      FROM cost_records c
      JOIN usage_records u
        ON u.id = c.usage_record_id
      WHERE u.provider_id = ?
        AND u.accuracy = 'verified'
        AND c.currency = ?
      `
    )
    .get(providerId, CURRENCY);

  const latest = db
    .prepare(
      `
      SELECT
        u.timestamp AS timestamp
      FROM usage_records u
      JOIN cost_records c
        ON c.usage_record_id = u.id
      WHERE u.provider_id = ?
        AND u.accuracy = 'verified'
        AND c.currency = ?
      ORDER BY datetime(u.timestamp) DESC
      LIMIT 1
      `
    )
    .get(providerId, CURRENCY);

  const earliest = db
    .prepare(
      `
      SELECT
        u.timestamp AS timestamp
      FROM usage_records u
      JOIN cost_records c
        ON c.usage_record_id = u.id
      WHERE u.provider_id = ?
        AND u.accuracy = 'verified'
        AND c.currency = ?
      ORDER BY datetime(u.timestamp) ASC
      LIMIT 1
      `
    )
    .get(providerId, CURRENCY);

  return {
    recordCount: Number(row?.record_count || 0),
    totalCost:
      Number(row?.total_cost_micros || 0) / 1_000_000,
    currency: CURRENCY,
    firstTimestamp: earliest?.timestamp ?? null,
    lastTimestamp: latest?.timestamp ?? null,
  };
}

function getCurrentDateSingapore() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function checkImporter() {
  return {
    available: fs.existsSync(IMPORTER_PATH),
    path: IMPORTER_PATH,
  };
}

function determineStatus({
  importerAvailable,
  databaseAvailable,
  summary,
}) {
  if (!databaseAvailable) {
    return {
      code: "LOCAL_DATABASE_MISSING",
      message: "Local database is not available.",
    };
  }

  if (!importerAvailable) {
    return {
      code: "IMPORTER_MISSING",
      message:
        "DeepSeek historical export importer is not available.",
    };
  }

  if (summary.recordCount === 0) {
    return {
      code: "NO_VERIFIED_HISTORY",
      message:
        "No verified DeepSeek historical cost records are available.",
    };
  }

  return {
    code: "HISTORICAL_SOURCE_REQUIRED",
    message:
      "Local verified history exists, but no newer verified DeepSeek historical source is connected.",
  };
}

function printReport({
  importer,
  databaseAvailable,
  databaseInfo,
  summary,
  status,
}) {
  printLine("=");

  console.log("AI Token Cost Monitor");
  console.log("DeepSeek Sync Engine V2.1");

  printLine("=");

  console.log(`Project: ${PROJECT_ROOT}`);
  console.log(`Database: ${DB_PATH}`);
  console.log("");

  printLine();
  console.log("1. Local historical source");
  printLine();

  console.log(
    `Official export importer: ${
      importer.available ? "AVAILABLE" : "MISSING"
    }`
  );

  console.log(`Importer: ${importer.path}`);

  console.log(
    `Local database: ${
      databaseAvailable ? "AVAILABLE" : "MISSING"
    }`
  );

  if (databaseAvailable) {
    console.log(
      `Tables detected: ${
        databaseInfo.tables.length
          ? databaseInfo.tables.join(", ")
          : "NONE"
      }`
    );

    console.log(
      `usage_records columns: ${
        databaseInfo.usageColumns.length
          ? databaseInfo.usageColumns.join(", ")
          : "NONE"
      }`
    );

    console.log(
      `cost_records columns: ${
        databaseInfo.costColumns.length
          ? databaseInfo.costColumns.join(", ")
          : "NONE"
      }`
    );
  }

  console.log("");

  printLine();
  console.log("2. Verified DeepSeek cost history");
  printLine();

  console.log(
    `Verified records: ${summary.recordCount}`
  );

  console.log(
    `Verified total: ${money(summary.totalCost)}`
  );

  console.log(`Currency: ${summary.currency}`);

  console.log(
    `First verified record: ${
      summary.firstTimestamp
        ? formatDate(summary.firstTimestamp)
        : "NONE"
    }`
  );

  console.log(
    `Last verified record: ${
      summary.lastTimestamp
        ? formatDate(summary.lastTimestamp)
        : "NONE"
    }`
  );

  console.log("");

  printLine();
  console.log("3. Current local data status");
  printLine();

  const today = getCurrentDateSingapore();

  console.log(`Today (Asia/Singapore): ${today}`);

  if (summary.lastTimestamp) {
    const lastDate = formatDate(summary.lastTimestamp);

    if (lastDate < today) {
      console.log(
        `Local verified data is behind today: ${lastDate} -> ${today}`
      );
    } else {
      console.log(
        "Local verified data reaches today."
      );
    }
  } else {
    console.log(
      "No verified DeepSeek cost date is available."
    );
  }

  console.log("");

  printLine();
  console.log("4. Sync decision");
  printLine();

  console.log(`STATUS: ${status.code}`);
  console.log(`Message: ${status.message}`);

  console.log("");

  printLine();
  console.log("5. Cost safety");
  printLine();

  console.log("API request made: NO");
  console.log("New cost record inserted: NO");
  console.log("Current balance converted into cost: NO");
  console.log("Estimated cost inserted: NO");
  console.log("Existing verified records modified: NO");

  console.log("");

  printLine();
  console.log("6. Next action");
  printLine();

  if (status.code === "HISTORICAL_SOURCE_REQUIRED") {
    console.log(
      "NEXT: provide/import a newer verified DeepSeek historical export."
    );

    console.log(
      "The existing official export importer remains the trusted write path."
    );
  } else if (status.code === "NO_VERIFIED_HISTORY") {
    console.log(
      "NEXT: import the first verified DeepSeek historical export."
    );
  } else if (status.code === "LOCAL_DATABASE_MISSING") {
    console.log(
      "NEXT: verify the local database path before attempting any sync."
    );
  } else {
    console.log(
      "NEXT: resolve the reported source/database issue first."
    );
  }

  console.log("");

  printLine("=");

  console.log(
    "DeepSeek Sync Engine V2.1 finished."
  );

  printLine("=");
}

function main() {
  const importer = checkImporter();

  let db = null;

  let databaseInfo = {
    tables: [],
    usageColumns: [],
    costColumns: [],
  };

  let databaseAvailable = false;

  try {
    db = getDatabase();

    if (db) {
      databaseAvailable = true;
      databaseInfo = inspectDatabase(db);
    }

    const providerId = db
      ? getDeepSeekProviderId(db)
      : null;

    const summary = db
      ? getVerifiedCostSummary(
          db,
          providerId
        )
      : {
          recordCount: 0,
          totalCost: 0,
          currency: CURRENCY,
          firstTimestamp: null,
          lastTimestamp: null,
        };

    const status = determineStatus({
      importerAvailable: importer.available,
      databaseAvailable,
      summary,
    });

    printReport({
      importer,
      databaseAvailable,
      databaseInfo,
      summary,
      status,
    });
  } catch (error) {
    console.error("");

    printLine("!");

    console.error(
      "DeepSeek Sync Engine V2.1 failed."
    );

    console.error("");

    console.error(
      error?.stack ||
        error?.message ||
        error
    );

    printLine("!");

    process.exitCode = 1;
  } finally {
    db?.close();
  }
}

main();