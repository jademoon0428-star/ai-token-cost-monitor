import { copyFileSync, existsSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_FILE_NAME = "ai-token-cost-monitor.db";

type TargetStatus =
  | "not_exist"
  | "migrated"
  | "pristine"
  | "not_pristine"
  | "error";

type SqliteOpenOptions = {
  readOnly?: boolean;
};

type SqliteHandle = {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): unknown;
  };
  close(): void;
};

function openDatabase(
  path: string,
  options?: SqliteOpenOptions
): SqliteHandle {
  const Constructor = DatabaseSync as unknown as new (
    target: string,
    options?: SqliteOpenOptions
  ) => SqliteHandle;

  return new Constructor(path, options);
}

function log(message: string): void {
  console.log(`[ai-cost-management] ${message}`);
}

function warn(message: string): void {
  console.error(`[ai-cost-management] ${message}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function evaluateTarget(targetPath: string): TargetStatus {
  if (!existsSync(targetPath)) {
    return "not_exist";
  }

  let db: SqliteHandle | null = null;

  try {
    db = openDatabase(targetPath, { readOnly: true });

    const version = (
      db.prepare("PRAGMA user_version").get() as {
        user_version: number;
      }
    ).user_version;

    if (version === 1) {
      return "migrated";
    }

    const tables = db
      .prepare(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table'
           AND name NOT LIKE 'sqlite_%'`
      )
      .all() as { name: string }[];

    for (const table of tables) {
      const count = (
        db.prepare(
          `SELECT COUNT(*) AS c FROM "${table.name}"`
        ).get() as { c: number }
      ).c;

      if (count > 0) {
        return "not_pristine";
      }
    }

    return "pristine";
  } catch {
    return "error";
  } finally {
    db?.close();
  }
}

function probeSource(): string | null {
  const candidates: string[] = [];

  const envSource =
    process.env.AI_COST_MONITOR_SOURCE_DB?.trim();

  if (envSource) {
    candidates.push(resolve(envSource));
  }

  candidates.push(
    resolve(process.cwd(), "data", DB_FILE_NAME)
  );

  candidates.push(
    resolve(
      dirname(process.execPath),
      "data",
      DB_FILE_NAME
    )
  );

  const seen = new Set<string>();

  for (const candidate of candidates) {
    const key = candidate.toLocaleLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function removeSidecar(path: string): void {
  try {
    if (existsSync(path)) {
      unlinkSync(path);
    }
  } catch (error) {
    warn(
      `could not remove target database sidecar: ${errorMessage(error)}`
    );
  }
}

export function maybeMigrateProductionDb(
  targetPath: string
): boolean {
  if (process.env.NODE_ENV === "development") {
    return false;
  }

  const status = evaluateTarget(targetPath);

  if (status === "migrated") {
    return false;
  }

  if (status === "not_pristine") {
    log("development database migration skipped (target database already in use)");
    return false;
  }

  if (status === "error") {
    log("development database migration skipped (target database check failed)");
    return false;
  }

  const sourcePath = probeSource();

  if (sourcePath === null) {
    log("development database migration skipped (no source database found)");
    return false;
  }

  const hasWalSidecar =
    existsSync(`${sourcePath}-wal`) ||
    existsSync(`${sourcePath}-shm`);

  if (hasWalSidecar) {
    log("development database migration skipped (source database is active)");
    return false;
  }

  try {
    copyFileSync(sourcePath, targetPath);
  } catch (error) {
    log(
      `development database migration skipped (copy failed: ${errorMessage(error)})`
    );
    return false;
  }

  removeSidecar(`${targetPath}-wal`);
  removeSidecar(`${targetPath}-shm`);

  log("migrated existing development database");
  return true;
}