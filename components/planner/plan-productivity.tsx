"use client";

import type {
  PlanProductivityReport,
  RangeCheckResult,
  TaskProductivityRow,
} from "@/lib/services/productivity-service";

export type {
  PlanProductivityReport,
  TaskProductivityRow,
};

/*
 * R3.5-B: read-only AI Productivity display for one plan.
 *
 * This component fetches nothing and computes nothing beyond
 * formatting the facts the productivity API already returns:
 * planned estimates, actual usage, coverage and range checks. It
 * carries no score, no rank, no recommendation and no automatic
 * selection, and it never converts a currency - when the planned
 * and actual currencies differ the cost comparison says so and
 * stops there.
 */
type PlanProductivityProps = {
  report: PlanProductivityReport | null;
  error: string | null;
  onRetry: () => void;
};

const RANGE_LABELS: Record<RangeCheckResult, string> = {
  within: "Within plan range",
  below: "Below plan range",
  above: "Above plan range",
  unknown: "Unknown",
};

function formatMicros(micros: number): string {
  const value = micros / 1_000_000;

  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(6)));
}

function formatNumber(value: number): string {
  return String(value);
}

function formatMinutes(ms: number): string {
  const minutes = ms / 60000;

  return `${Number(minutes.toFixed(1))} min`;
}

function rangeText(
  min: number | null,
  max: number | null
): string {
  if (min === null && max === null) {
    return "No estimate";
  }

  if (min === null) {
    return `up to ${formatNumber(max!)}`;
  }

  if (max === null) {
    return `from ${formatNumber(min)}`;
  }

  return `${formatNumber(min)} – ${formatNumber(max)}`;
}

export function costRangeText(
  min: number | null,
  max: number | null,
  currency: string | null
): string {
  if (
    min === null ||
    max === null ||
    currency === null
  ) {
    return "Unknown";
  }

  return `${formatMicros(min)} – ${formatMicros(max)} ${currency}`;
}

export function minutesRangeText(
  min: number | null,
  max: number | null
): string {
  if (min === null && max === null) {
    return "Unknown";
  }

  if (min === null) {
    return `up to ${max} min`;
  }

  if (max === null) {
    return `from ${min} min`;
  }

  return `${min} – ${max} min`;
}

function Badge({
  text,
  color,
}: {
  text: string;
  color: string;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 8px",
        borderRadius: 5,
        fontSize: 11,
        fontWeight: 700,
        color,
        background: "#f4f5f7",
      }}
    >
      {text}
    </span>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "#666",
          marginBottom: 5,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: 15,
          lineHeight: 1.5,
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

const mutedTextStyle = {
  margin: 0,
  color: "#666",
  fontSize: 14,
  lineHeight: 1.5,
} as const;

const errorTextStyle = {
  margin: "0 0 14px",
  color: "#b42318",
  fontSize: 14,
  lineHeight: 1.5,
} as const;

const retryButtonStyle = {
  padding: "9px 14px",
  borderRadius: 8,
  border: "1px solid #ddd",
  background: "#fff",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
} as const;

const blockStyle = {
  display: "grid",
  gap: 3,
  color: "#333",
  fontSize: 13,
  lineHeight: 1.6,
} as const;

const blockLabelStyle = {
  fontSize: 12,
  fontWeight: 700,
  color: "#666",
  marginTop: 6,
} as const;

/*
 * The delta block shows only what the API returned: a range check
 * per dimension, and for cost either the same range check (same
 * currency) or an explicit not-comparable line. Nothing here
 * converts, subtracts across currencies or invents a value.
 *
 * currencyMatches is false both for a real cross-currency mix and
 * for missing data (a step with no verified cost or no planned
 * cost), so the mismatch wording is reserved for rows where both
 * currencies are actually present - anywhere else the honest
 * label is Unknown. The planned currency uses the same
 * assignment-first priority as the service's plannedCostRange().
 */
function DeltaBlock({
  row,
}: {
  row: TaskProductivityRow;
}) {
  const plannedCurrency =
    row.planned.assignment !== null
      ? row.planned.assignment.plannedCostCurrency
      : row.planned.selectedOption !== null
        ? row.planned.selectedOption
            .estimatedCostCurrency
        : null;
  const actualCurrency =
    row.actual?.verifiedCost?.currency ?? null;

  const costText = row.deltas.cost.currencyMatches
    ? RANGE_LABELS[row.deltas.cost.rangeCheck]
    : plannedCurrency !== null &&
        actualCurrency !== null &&
        plannedCurrency !== actualCurrency
      ? "Not comparable (currency mismatch)"
      : "Unknown";

  return (
    <div style={blockStyle}>
      <div style={blockLabelStyle}>
        PLAN VS ACTUAL (RANGE CHECK)
      </div>

      <div>
        Input tokens:{" "}
        {RANGE_LABELS[row.deltas.inputTokens]}
      </div>
      <div>
        Output tokens:{" "}
        {RANGE_LABELS[row.deltas.outputTokens]}
      </div>
      <div>
        Session time vs plan:{" "}
        {RANGE_LABELS[row.deltas.sessionMinutesVsPlan]}
      </div>
      <div>Cost: {costText}</div>
    </div>
  );
}

function TaskRow({
  row,
}: {
  row: TaskProductivityRow;
}) {
  const assignment = row.planned.assignment;
  const selectedOption = row.planned.selectedOption;

  return (
    <div
      style={{
        paddingTop: 10,
        borderTop: "1px solid #f0f1f4",
        display: "grid",
        gap: 6,
        fontSize: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ fontWeight: 600 }}>
          {row.sequence}. {row.name}
        </span>

        <span
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          <Badge
            text={
              row.coverage.linked
                ? "Linked"
                : "Not linked"
            }
            color="#555"
          />

          {row.coverage.hasSessions ? (
            <Badge text="Has sessions" color="#555" />
          ) : null}

          {row.coverage.verifiedCostAvailable ? (
            <Badge
              text="Verified cost"
              color="#555"
            />
          ) : null}
        </span>
      </div>

      <div style={blockStyle}>
        <div style={blockLabelStyle}>PLANNED</div>

        <div>
          Tokens: input{" "}
          {rangeText(
            row.planned.estimatedInputTokens.min,
            row.planned.estimatedInputTokens.max
          )}{" "}
          · output{" "}
          {rangeText(
            row.planned.estimatedOutputTokens.min,
            row.planned.estimatedOutputTokens.max
          )}
        </div>

        {assignment !== null ? (
          <div>
            Assignment: role {assignment.role} · cost{" "}
            {costRangeText(
              assignment.plannedCostMicros.min,
              assignment.plannedCostMicros.max,
              assignment.plannedCostCurrency
            )}{" "}
            · time{" "}
            {minutesRangeText(
              assignment.plannedTimeMinutes.min,
              assignment.plannedTimeMinutes.max
            )}
          </div>
        ) : null}

        {selectedOption !== null ? (
          <div>
            Selected option: cost{" "}
            {costRangeText(
              selectedOption.estimatedCostMicros.min,
              selectedOption.estimatedCostMicros.max,
              selectedOption.estimatedCostCurrency
            )}{" "}
            · time{" "}
            {minutesRangeText(
              selectedOption.estimatedTimeMinutes.min,
              selectedOption.estimatedTimeMinutes.max
            )}{" "}
            · fit {selectedOption.fitStatus}
          </div>
        ) : null}

        {assignment === null &&
        selectedOption === null ? (
          <div>No stored cost or time estimate.</div>
        ) : null}
      </div>

      <div style={blockStyle}>
        <div style={blockLabelStyle}>ACTUAL</div>

        {row.actual === null ? (
          <div>
            Not linked to an execution task, so there
            is no recorded usage for this step.
          </div>
        ) : (
          <>
            <div>
              Tokens: input{" "}
              {formatNumber(row.actual.tokens.input)} ·
              output{" "}
              {formatNumber(row.actual.tokens.output)} ·
              cached{" "}
              {formatNumber(row.actual.tokens.cached)} ·
              reasoning{" "}
              {formatNumber(
                row.actual.tokens.reasoning
              )}
            </div>

            <div>
              Sessions: {row.actual.sessions.count} (
              {row.actual.sessions.completed} completed
              · {row.actual.sessions.abandoned}{" "}
              abandoned · {row.actual.sessions.active}{" "}
              active) · total{" "}
              {formatMinutes(
                row.actual.sessions.totalMs
              )}
              {row.actual.sessions.activeSessionMs !==
              null
                ? ` · current ${formatMinutes(row.actual.sessions.activeSessionMs)}`
                : ""}
            </div>

            <div>
              Attribution:{" "}
              {row.actual.attribution.auto} auto ·{" "}
              {row.actual.attribution.manual} manual ·{" "}
              {row.actual.attribution.other} other
            </div>

            <div>
              Model mix:{" "}
              {row.actual.modelMix.length === 0
                ? "none recorded"
                : row.actual.modelMix
                    .map(
                      (entry) =>
                        `${entry.provider}/${entry.model} · ${entry.records} records · in ${formatNumber(entry.inputTokens)} / out ${formatNumber(entry.outputTokens)} tokens`
                    )
                    .join(" · ")}
            </div>

            <div>
              Verified cost:{" "}
              {row.actual.verifiedCost !== null
                ? `${formatMicros(row.actual.verifiedCost.amountMicros)} ${row.actual.verifiedCost.currency}`
                : "Unavailable (not a verified, single-currency total)"}
            </div>
          </>
        )}
      </div>

      <DeltaBlock row={row} />
    </div>
  );
}

export default function PlanProductivity({
  report,
  error,
  onRetry,
}: PlanProductivityProps) {
  return (
    <>
      <h2
        style={{
          fontSize: 16,
          margin: "0 0 8px",
        }}
      >
        Productivity
      </h2>

      <p
        style={{
          margin: "0 0 14px",
          color: "#666",
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        Planned versus actual facts for the steps of
        this plan. These are recorded facts: no score,
        no rank, no recommendation, and currencies are
        never converted.
      </p>

      {error ? (
        <div>
          <p style={errorTextStyle}>{error}</p>

          <button
            type="button"
            onClick={onRetry}
            style={retryButtonStyle}
          >
            Retry
          </button>
        </div>
      ) : report === null ? (
        <p style={mutedTextStyle}>
          No productivity data for this plan.
        </p>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 14,
              marginBottom: 16,
            }}
          >
            <Stat
              label="STEPS"
              value={formatNumber(
                report.summary.taskCount
              )}
            />

            <Stat
              label="LINKED"
              value={formatNumber(
                report.summary.linkedCount
              )}
            />

            <Stat
              label="WITH SESSIONS"
              value={formatNumber(
                report.summary.withSessionsCount
              )}
            />

            <Stat
              label="VERIFIED COST"
              value={formatNumber(
                report.summary.verifiedCostCount
              )}
            />

            <Stat
              label="ACTUAL TOKENS (LINKED)"
              value={
                report.summary.totalTokens !== null
                  ? `in ${formatNumber(report.summary.totalTokens.input)} · out ${formatNumber(report.summary.totalTokens.output)}`
                  : "—"
              }
            />

            <Stat
              label="UNATTRIBUTED USAGE"
              value={`${formatNumber(report.context.unattributedUsageRecords)} (global)`}
            />
          </div>

          {report.tasks.length === 0 ? (
            <p style={mutedTextStyle}>
              No steps yet.
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 14,
              }}
            >
              {report.tasks.map((row) => (
                <TaskRow
                  key={row.projectTaskId}
                  row={row}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
