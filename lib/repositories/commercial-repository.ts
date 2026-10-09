import { getDb } from "@/lib/db";
import { initDb } from "@/lib/schema";

export type CommercialStateRow = {
  id: string;
  first_use_at: string | null;
  paid: number;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

function initialize() {
  initDb();
  return getDb();
}

export function getCommercialStateRow():
  | CommercialStateRow
  | undefined {
  const db = initialize();

  return db
    .prepare(
      `
        SELECT *
        FROM commercial_state
        WHERE id = 'singleton'
      `
    )
    .get() as CommercialStateRow | undefined;
}

export function ensureCommercialStateRow(
  nowIso: string
): CommercialStateRow {
  const db = initialize();

  const existing = getCommercialStateRow();

  if (existing) {
    return existing;
  }

  db.prepare(
    `
      INSERT INTO commercial_state (
        id,
        first_use_at,
        paid,
        paid_at,
        created_at,
        updated_at
      )
      VALUES ('singleton', NULL, 0, NULL, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `
  ).run(nowIso, nowIso);

  const created = getCommercialStateRow();

  if (!created) {
    throw new Error(
      "Failed to initialize commercial_state singleton row."
    );
  }

  return created;
}

export function stampCommercialFirstUse(
  nowIso: string
): CommercialStateRow {
  ensureCommercialStateRow(nowIso);

  const before = getCommercialStateRow();

  if (!before) {
    throw new Error(
      "commercial_state singleton row is missing."
    );
  }

  if (before.first_use_at !== null) {
    return before;
  }

  const db = initialize();

  db.prepare(
    `
      UPDATE commercial_state
      SET
        first_use_at = ?,
        updated_at = ?
      WHERE id = 'singleton'
        AND first_use_at IS NULL
    `
  ).run(nowIso, nowIso);

  const after = getCommercialStateRow();

  if (!after || after.first_use_at === null) {
    throw new Error(
      "Failed to stamp commercial_state.first_use_at."
    );
  }

  return after;
}

export function updateCommercialPaid(
  paid: boolean,
  nowIso: string
): void {
  const db = initialize();

  db.prepare(
    `
      UPDATE commercial_state
      SET
        paid = ?,
        paid_at = ?,
        updated_at = ?
      WHERE id = 'singleton'
    `
  ).run(
    paid ? 1 : 0,
    paid ? nowIso : null,
    nowIso
  );
}
