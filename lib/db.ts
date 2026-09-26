import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { maybeMigrateProductionDb } from "./migration/dev-db-migrate";

const DB_FILE_NAME =
  "ai-token-cost-monitor.db";

function getUserDataDir(): string | null {
  const appData =
    process.env.APPDATA?.trim();
  const xdgData =
    process.env.XDG_DATA_HOME?.trim();
  const home = homedir().trim();

  return appData || xdgData || home || null;
}

/*
 * Development (next dev) keeps using the project-local
 * data/ directory exactly as before.
 *
 * Production / desktop (next build, next start) uses a
 * Windows user-writable data directory instead of any
 * installation or project folder:
 *
 *   %APPDATA%\AI-Cost-Management\data\ai-token-cost-monitor.db
 *
 * APPDATA is the first choice. When it is missing, fall
 * back to XDG_DATA_HOME, then to the OS home directory.
 */
function resolveDbPath(): string {
  if (
    process.env.NODE_ENV === "development"
  ) {
    return join(
      process.cwd(),
      "data",
      DB_FILE_NAME
    );
  }

  const userDataDir =
    getUserDataDir();

  if (userDataDir === null) {
    return join(
      process.cwd(),
      "data",
      DB_FILE_NAME
    );
  }

  return join(
    userDataDir,
    "AI-Cost-Management",
    "data",
    DB_FILE_NAME
  );
}

const dbPath = resolveDbPath();
let db: DatabaseSync | null = null;

export function getDb() {
  if (!db) {
    mkdirSync(dirname(dbPath), { recursive: true });
    const migrated = maybeMigrateProductionDb(dbPath);
    db = new DatabaseSync(dbPath);
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA journal_mode = WAL;");
    if (migrated) {
      db.exec("PRAGMA user_version = 1;");
    }
  }
  return db;
}

export { dbPath };
