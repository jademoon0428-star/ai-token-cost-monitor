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
 * added to it. The stored fields are snake_case; the state fields
 * beside them are the API's description of what this candidate refers
 * to now (source, registration, channel, entitlement, availability,
 * pricing, capabilities, display name), read from the inventories at
 * request time rather than from the row.
 *
 * There is no score, no rank and no recommendation in the payload, so
 * this component shows none of them. A model with no display name
 * falls back to the raw model_id it was stored with, because a name
 * the API never sent would be an invented fact.
 */
type ProjectTaskAiOption = {
  id: string;
  project_task_id: string;
  model_id: string | null;
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
  display_name: string;
  provider_name: string | null;
  model_name: string | null;
  resource_source: "registered" | "registry";
  registration_state: "registered" | "not_registered";
  channel: "own_api" | "gateway" | "web_only" | "unknown";
  entitlement: "free" | "paid" | "unknown";
  availability:
    | "callable"
    | "needs_configuration"
    | "external"
    | "unknown";
  pricing_state: "known" | "unknown";
  capability_state: "known" | "unknown";
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

/*
 * State labels. Each one says what the app holds about a resource,
 * never how good it is. Nothing here is comparative: no option is
 * called better, cheaper to pick or preferred, and an unknown stays
 * unknown instead of being shown as a zero, a negative or a default.
 */
const SOURCE_LABELS: Record<string, string> = {
  registered: "Registered resource",
  registry: "Registry model",
};

const REGISTRATION_LABELS: Record<string, string> = {
  registered: "Active registration held",
  not_registered: "No active registration",
};

const CHANNEL_LABELS: Record<string, string> = {
  own_api: "Own API key",
  gateway: "Gateway",
  web_only: "Web only",
  unknown: "Channel unknown",
};

const ENTITLEMENT_LABELS: Record<string, string> = {
  free: "Free entitlement",
  paid: "Paid entitlement",
  unknown: "Entitlement unknown",
};

const AVAILABILITY_LABELS: Record<string, string> = {
  callable: "Callable",
  needs_configuration: "Needs configuration",
  external: "Used outside this app",
  unknown: "Availability unknown",
};

const CAPABILITY_LABELS: Record<string, string> = {
  known: "Capabilities stated",
  unknown: "Capabilities unknown",
};

/*
 * Pricing is a fact about this app's own rate card at the plan's
 * frozen instant. A model with no recorded rate is reported as
 * unknown, never as free.
 */
function pricingLabel(
  option: ProjectTaskAiOption
): string {
  return option.pricing_state === "known"
    ? "Price recorded"
    : "Price unknown";
}

const STATE_CHIP_STYLE = {
  display: "inline-block",
  padding: "3px 8px",
  marginRight: 5,
  marginBottom: 4,
  borderRadius: 5,
  fontSize: 11,
  fontWeight: 600,
  color: "#334155",
  background: "#eef1f6",
} as const;

const STATE_UNKNOWN_CHIP_STYLE = {
  ...STATE_CHIP_STYLE,
  color: "#666",
  background: "#f4f4f5",
} as const;

function StateChip({
  label,
  known,
}: {
  label: string;
  known: boolean;
}) {
  return (
    <span
      style={
        known ? STATE_CHIP_STYLE : STATE_UNKNOWN_CHIP_STYLE
      }
    >
      {label}
    </span>
  );
}

/*
 * What this candidate refers to, as read now. Six independent facts
 * laid side by side: they are never combined into one judgement, and
 * nothing here adds them up or weighs them against each other.
 */
function ResourceState({
  option,
}: {
  option: ProjectTaskAiOption;
}) {
  return (
    <div
      aria-label="Resource state"
      style={{ marginTop: 12 }}
    >
      <div style={LABEL_STYLE}>RESOURCE</div>

      <div>
        <StateChip
          label={
            SOURCE_LABELS[option.resource_source] ??
            option.resource_source
          }
          known
        />

        <StateChip
          label={
            REGISTRATION_LABELS[
              option.registration_state
            ] ?? option.registration_state
          }
          known={option.registration_state === "registered"}
        />

        <StateChip
          label={
            CHANNEL_LABELS[option.channel] ??
            option.channel
          }
          known={option.channel !== "unknown"}
        />

        <StateChip
          label={
            ENTITLEMENT_LABELS[option.entitlement] ??
            option.entitlement
          }
          known={option.entitlement !== "unknown"}
        />

        <StateChip
          label={
            AVAILABILITY_LABELS[option.availability] ??
            option.availability
          }
          known={option.availability !== "unknown"}
        />

        <StateChip
          label={pricingLabel(option)}
          known={option.pricing_state === "known"}
        />

        <StateChip
          label={
            CAPABILITY_LABELS[option.capability_state] ??
            option.capability_state
          }
          known={option.capability_state === "known"}
        />
      </div>

      <div style={HINT_TEXT_STYLE}>
        Read from your current registrations and the
        registry.
      </div>
    </div>
  );
}

/*
 * The name to show: the display name the API sent, falling back to
 * the stored identifier when there is none. The hint carries the
 * provider for a registry model.
 */
function describeModel(option: ProjectTaskAiOption): {
  value: string;
  hint?: string;
} {
  const value =
    option.display_name !== ""
      ? option.display_name
      : (option.model_id ?? "Unknown resource");

  const hint = option.provider_name ?? "";

  return hint === "" ? { value } : { value, hint };
}

/*
 * The three preference plan strategies are the only plans whose steps
 * generate AI options: generateProjectTaskAiOptions accepts exactly
 * planner-service's PROJECT_PREFERENCES and rejects every combination
 * strategy. The list is copied from that contract on purpose and must
 * stay in sync with it, following the same convention as the strategy
 * labels on the plan page.
 */
const PREFERENCE_PLAN_STRATEGIES = [
  "cost_first",
  "time_first",
  "balanced",
] as const;

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
  planStrategy,
  expanded,
}: {
  taskId: string;
  planStrategy: string;
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
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<
    string | null
  >(null);
  const [generationLocked, setGenerationLocked] =
    useState(false);
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

  /*
   * Generation only exists for the three preference strategies; the
   * generate endpoint rejects every combination strategy with
   * INVALID_STRATEGY. When the plan is not one of them the panel does
   * not offer the button at all, so the error can never be shown.
   */
  const generationEligible = (
    PREFERENCE_PLAN_STRATEGIES as readonly string[]
  ).includes(planStrategy);

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
        setGenerating(false);
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
        setGenerating(false);
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

  /*
   * Replaces this planned step's candidate set with the generated
   * batch. There is no body: the service decides from the task, the
   * plan's frozen basis, the AI Registry and the user's active
   * registrations. On success the list
   * is read again rather than patched, because the response carries
   * the whole set and only the server knows the storage order.
   *
   * Nothing here chooses on the user's behalf. Regeneration resets
   * every row to is_selected = 0, so selection stays a separate,
   * explicit user action made through the select flow.
   */
  async function handleGenerate() {
    if (generating) {
      return;
    }

    setGenerating(true);
    setGenerateError(null);

    try {
      const response = await fetch(
        `/api/planner/tasks/${taskId}/ai-options/generate`,
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
        /*
         * The commercial lifecycle can refuse generation after the
         * 90-day full-access window. That refusal is a stable code,
         * not a message string, so the panel switches to a locked
         * notice instead of the generic error line. Every other
         * failure keeps the existing error path.
         */
        if (
          typeof data?.code === "string" &&
          data.code === "PLANNER_ADVANCED_LOCKED"
        ) {
          setGenerationLocked(true);
          setGenerating(false);
          return;
        }

        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Failed to generate AI options."
        );
      }

      setReloadKey((key) => key + 1);
    } catch (cause) {
      setGenerateError(
        cause instanceof Error
          ? cause.message
          : "Failed to generate AI options."
      );
      setGenerating(false);
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
            <>
              <p style={MUTED_TEXT_STYLE}>
                No AI options recorded for this
                task.
              </p>

              {generateError ? (
                <p
                  role="alert"
                  style={ERROR_TEXT_STYLE}
                >
                  {generateError}
                </p>
              ) : null}

              {generationLocked ? (
                <p
                  role="alert"
                  style={ERROR_TEXT_STYLE}
                >
                  Planner advanced features
                  require a paid plan after the
                  90-day full-access period.
                </p>
              ) : generationEligible ? (
                <button
                  type="button"
                  disabled={generating}
                  onClick={handleGenerate}
                  style={{
                    ...SECONDARY_BUTTON_STYLE,
                    marginTop: 10,
                    cursor: generating
                      ? "default"
                      : "pointer",
                    opacity: generating ? 0.6 : 1,
                  }}
                >
                  {generating
                    ? "Generating…"
                    : "Generate AI Options"}
                </button>
              ) : (
                <p style={HINT_TEXT_STYLE}>
                  AI option generation is
                  unavailable for this plan
                  strategy.
                </p>
              )}
            </>
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
                const model = describeModel(option);
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
                        value={model.value}
                        hint={model.hint}
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

                    <ResourceState option={option} />

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
