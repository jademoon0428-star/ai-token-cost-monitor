"use client";

import {
  useEffect,
  useState,
} from "react";

/*
 * One persisted candidate for one planned step, exactly as
 * GET /api/planner/tasks/[id]/ai-options returns it.
 *
 * The shape is copied from the response on purpose and nothing is
 * added to it. There is no provider, no model display name, no score,
 * no rank and no recommendation in the payload, so this component
 * shows none of them. The model is shown as the raw model_id it was
 * stored with, and nothing tries to parse that id into anything
 * prettier, because a derived name would be a fact the API never sent.
 */
type ProjectTaskAiOption = {
  id: string;
  project_task_id: string;
  model_id: string;
  tool_id: string | null;
  is_selected: number;
  cost_min_micros: number | null;
  cost_max_micros: number | null;
  cost_currency: string | null;
  time_min_minutes: number | null;
  time_max_minutes: number | null;
  fit_status: "meets" | "below_minimum" | "unknown";
  excluded_reason: string | null;
  pricing_basis: string | null;
  rationale: string | null;
  created_at: string;
  updated_at: string;
};

/*
 * Symbol only, and only for the two currencies this project has used.
 * An unknown currency code is printed as the code itself: guessing a
 * symbol, and above all converting between currencies, would turn a
 * stored number into an amount the API never reported.
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: "¥",
  USD: "$",
};

/*
 * fit_status is a capability fact about the task's own
 * required_capabilities. It is not a score, a grade, a quality rating
 * or a budget verdict, so it is labelled in those terms and carries a
 * fixed one-line explanation instead of an implied judgement.
 */
const FIT_LABELS: Record<string, string> = {
  meets: "Meets requirements",
  below_minimum: "Below minimum",
  unknown: "Unknown",
};

const FIT_HINT =
  "Reflects the task's declared capability requirements.";

const LABEL_STYLE = {
  fontSize: 12,
  fontWeight: 700,
  color: "#666",
  marginBottom: 5,
} as const;

const VALUE_STYLE = {
  fontSize: 14,
  lineHeight: 1.5,
  wordBreak: "break-word",
} as const;

const MUTED_TEXT_STYLE = {
  margin: 0,
  color: "#666",
  fontSize: 13,
  lineHeight: 1.5,
} as const;

const ERROR_TEXT_STYLE = {
  margin: "0 0 10px",
  color: "#b42318",
  fontSize: 13,
  lineHeight: 1.5,
} as const;

const HINT_TEXT_STYLE = {
  marginTop: 4,
  color: "#666",
  fontSize: 12,
  lineHeight: 1.5,
} as const;

const SECONDARY_BUTTON_STYLE = {
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#111",
  fontSize: 13,
  fontWeight: 600,
} as const;

const SELECT_BUTTON_STYLE = {
  padding: "7px 14px",
  borderRadius: 8,
  border: 0,
  background: "#172033",
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
} as const;

const SELECTED_BADGE_STYLE = {
  display: "inline-block",
  padding: "3px 8px",
  borderRadius: 5,
  fontSize: 11,
  fontWeight: 700,
  color: "#172033",
  background: "#eef1f6",
} as const;

function Detail({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <div style={LABEL_STYLE}>{label}</div>

      <div style={VALUE_STYLE}>{value}</div>

      {hint ? (
        <div style={HINT_TEXT_STYLE}>{hint}</div>
      ) : null}
    </div>
  );
}

/*
 * A stored measurement is shown only when it is really a number. A
 * null, an undefined and a non-finite value all take the unknown
 * branch, so nothing here can turn a missing figure into a zero.
 */
function isKnownAmount(
  value: number | null
): value is number {
  return (
    typeof value === "number" && Number.isFinite(value)
  );
}

function formatAmount(micros: number): string {
  const value = micros / 1_000_000;

  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(6)));
}

function formatMoney(
  micros: number,
  currency: string
): string {
  const symbol = CURRENCY_SYMBOLS[currency];

  return symbol
    ? `${symbol}${formatAmount(micros)}`
    : `${currency} ${formatAmount(micros)}`;
}

/*
 * A known price carries cost_min_micros, cost_max_micros and
 * cost_currency together; an unknown one carries none of them. Each
 * option is therefore rendered in its own currency and no total is
 * ever produced, because two options in two currencies have no sum.
 */
function formatCost(
  option: ProjectTaskAiOption
): { value: string; basis: string } {
  const min = option.cost_min_micros;
  const max = option.cost_max_micros;
  const currency = option.cost_currency;
  const basis =
    option.pricing_basis ??
    "Pricing basis unavailable";

  if (
    !isKnownAmount(min) ||
    !isKnownAmount(max) ||
    typeof currency !== "string" ||
    currency === ""
  ) {
    return { value: "Pricing unavailable", basis };
  }

  return {
    value:
      min === max
        ? formatMoney(min, currency)
        : `${formatMoney(min, currency)} – ${formatMoney(max, currency)}`,
    basis,
  };
}

/*
 * A range, not a promise. The wording stays on "estimate" so the
 * number is never read as a guarantee, a service level or a measured
 * duration.
 */
function formatTime(
  option: ProjectTaskAiOption
): string {
  const min = option.time_min_minutes;
  const max = option.time_max_minutes;

  if (
    !isKnownAmount(min) ||
    !isKnownAmount(max)
  ) {
    return "Time estimate unavailable";
  }

  return min === max
    ? `${min} min`
    : `${min}–${max} min`;
}

async function readOptions(
  response: Response
): Promise<ProjectTaskAiOption[]> {
  const data = await response
    .json()
    .catch(() => null);

  if (
    !response.ok ||
    !data ||
    data.ok !== true
  ) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Failed to load AI options."
    );
  }

  if (!Array.isArray(data.items)) {
    throw new Error("Failed to load AI options.");
  }

  return data.items as ProjectTaskAiOption[];
}

export default function TaskAiOptions({
  taskId,
  expanded,
}: {
  taskId: string;
  expanded: boolean;
}) {
  const [options, setOptions] = useState<
    ProjectTaskAiOption[] | null
  >(null);
  const [error, setError] = useState<string | null>(
    null
  );
  const [selectingId, setSelectingId] = useState<
    string | null
  >(null);
  const [selectError, setSelectError] = useState<
    string | null
  >(null);
  const [reloadKey, setReloadKey] = useState(0);

  /*
   * The panel is mounted only after the user opens it, so the read
   * below happens on the first opening and never for a task the user
   * has not looked at. A read that has already succeeded is not
   * replaced by the loading line again: options being present is what
   * makes the panel loaded, which is why a refresh after a selection
   * keeps the list on screen while the server confirms it.
   */
  const loading = options === null && error === null;

  function handleRetry() {
    setError(null);
    setReloadKey((key) => key + 1);
  }

  useEffect(() => {
    let cancelled = false;

    fetch(
      `/api/planner/tasks/${taskId}/ai-options`,
      { cache: "no-store" }
    )
      .then(readOptions)
      .then((items) => {
        if (cancelled) {
          return;
        }

        setOptions(items);
        setError(null);
        setSelectingId(null);
      })
      .catch((cause) => {
        if (cancelled) {
          return;
        }

        setError(
          cause instanceof Error
            ? cause.message
            : "Failed to load AI options."
        );
        setSelectingId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [taskId, reloadKey]);

  /*
   * The select endpoint takes no body: the call is the decision. On
   * success the list is read again rather than patched, because the
   * response carries only the chosen option while the server also
   * cleared its siblings, and only the server knows that.
   *
   * Nothing here chooses on the user's behalf. There is no default
   * option, no first-item selection and no comparison of cost, time,
   * fit or plan strategy: is_selected is read back from the API and
   * shown as it is.
   */
  async function handleSelect(optionId: string) {
    if (selectingId !== null) {
      return;
    }

    setSelectingId(optionId);
    setSelectError(null);

    try {
      const response = await fetch(
        `/api/planner/tasks/${taskId}/ai-options/${optionId}/select`,
        { method: "POST" }
      );

      const data = await response
        .json()
        .catch(() => null);

      if (
        !response.ok ||
        !data ||
        data.ok !== true
      ) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Failed to select AI option."
        );
      }

      setReloadKey((key) => key + 1);
    } catch (cause) {
      setSelectError(
        cause instanceof Error
          ? cause.message
          : "Failed to select AI option."
      );
      setSelectingId(null);
    }
  }

  if (!expanded) {
    return null;
  }

  return (
    <div
      style={{
        marginTop: 12,
        padding: 14,
        border: "1px solid #e7ebf0",
        borderRadius: 10,
        background: "#fcfdfe",
      }}
    >
      <div
        style={{
          ...LABEL_STYLE,
          marginBottom: 10,
        }}
      >
        AI options
      </div>

      {loading ? (
        <p style={MUTED_TEXT_STYLE}>
          Loading AI options…
        </p>
      ) : error && options === null ? (
        <>
          <p
            role="alert"
            style={ERROR_TEXT_STYLE}
          >
            {error}
          </p>

          <button
            type="button"
            onClick={handleRetry}
            style={SECONDARY_BUTTON_STYLE}
          >
            Retry
          </button>
        </>
      ) : options === null ? null : (
        <>
          {error ? (
            <>
              <p
                role="alert"
                style={ERROR_TEXT_STYLE}
              >
                {error}
              </p>

              <button
                type="button"
                onClick={handleRetry}
                style={SECONDARY_BUTTON_STYLE}
              >
                Retry
              </button>
            </>
          ) : null}

          {selectError ? (
            <p
              role="alert"
              style={ERROR_TEXT_STYLE}
            >
              {selectError}
            </p>
          ) : null}

          {options.length === 0 ? (
            <p style={MUTED_TEXT_STYLE}>
              No AI options recorded for this
              task.
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 10,
              }}
            >
              {/*
                Rendered in the order the endpoint returned, which
                is storage order and carries no ranking: nothing is
                sorted by cost, time, fit or model, and no position
                here means recommended, best or first.
              */}
              {options.map((option) => {
                const cost = formatCost(option);
                const selected =
                  option.is_selected === 1;
                const busy =
                  selectingId !== null;

                return (
                  <div
                    key={option.id}
                    style={{
                      padding: 12,
                      border:
                        "1px solid #e7ebf0",
                      borderRadius: 8,
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "1fr 1fr",
                        gap: 12,
                      }}
                    >
                      <Detail
                        label="MODEL"
                        value={option.model_id}
                      />

                      <Detail
                        label="COST"
                        value={cost.value}
                        hint={cost.basis}
                      />

                      <Detail
                        label="ESTIMATED TIME"
                        value={formatTime(option)}
                      />

                      <Detail
                        label="FIT"
                        value={
                          FIT_LABELS[
                            option.fit_status
                          ] ?? option.fit_status
                        }
                        hint={FIT_HINT}
                      />
                    </div>

                    <div
                      style={{
                        marginTop: 12,
                      }}
                    >
                      <Detail
                        label="EXPLANATION"
                        value={
                          option.rationale ??
                          "No explanation recorded"
                        }
                      />
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent:
                          "flex-end",
                        marginTop: 12,
                      }}
                    >
                      {selected ? (
                        <span
                          style={
                            SELECTED_BADGE_STYLE
                          }
                        >
                          Selected
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            handleSelect(
                              option.id
                            )
                          }
                          style={{
                            ...SELECT_BUTTON_STYLE,
                            cursor: busy
                              ? "default"
                              : "pointer",
                            opacity: busy
                              ? 0.6
                              : 1,
                          }}
                        >
                          {selectingId ===
                          option.id
                            ? "Selecting…"
                            : "Select"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
