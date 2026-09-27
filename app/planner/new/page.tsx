"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useState,
} from "react";

type Preference = "cost_first" | "time_first" | "balanced";

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "9px 11px",
  borderRadius: 8,
  border: "1px solid #ddd",
  background: "#fff",
  fontSize: 14,
};

const labelStyle = {
  display: "block",
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 6,
};

const hintStyle = {
  margin: "6px 0 0",
  color: "#666",
  fontSize: 12,
  lineHeight: 1.5,
};

/*
 * Amounts are entered in the currency the user types, then sent as
 * micro-units. An empty amount is left out of the request entirely
 * so the server stores NULL; 0 would mean "zero budget" and is
 * never used as a stand-in for "not set".
 */
function toMicros(
  input: string
): number | null {
  const trimmed = input.trim();

  if (trimmed === "") {
    return null;
  }

  const value = Number(trimmed);

  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.round(value * 1_000_000);
}

export default function NewProjectPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [description, setDescription] = useState("");
  const [preference, setPreference] =
    useState<Preference>("balanced");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [budgetCurrency, setBudgetCurrency] =
    useState("");
  const [deadlineDays, setDeadlineDays] =
    useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedGoal = goal.trim();

    if (trimmedName === "") {
      setError("Project name is required.");

      return;
    }

    if (trimmedGoal === "") {
      setError("Goal is required.");

      return;
    }

    /*
     * The API accepts a budget only as min + max + currency
     * together, so a partially filled budget is refused here
     * instead of being sent and rejected.
     */
    const hasMin = budgetMin.trim() !== "";
    const hasMax = budgetMax.trim() !== "";
    const hasCurrency = budgetCurrency.trim() !== "";

    if (hasMin !== hasMax || hasMin !== hasCurrency) {
      setError(
        "Enter a budget minimum, maximum and currency, or leave all three empty."
      );

      return;
    }

    const minMicros = toMicros(budgetMin);
    const maxMicros = toMicros(budgetMax);

    if (hasMin && (minMicros === null || maxMicros === null)) {
      setError(
        "Budget amounts must be non-negative numbers."
      );

      return;
    }

    if (
      minMicros !== null &&
      maxMicros !== null &&
      minMicros > maxMicros
    ) {
      setError(
        "Budget minimum cannot be greater than the maximum."
      );

      return;
    }

    const trimmedDeadline = deadlineDays.trim();
    const parsedDeadline = trimmedDeadline === ""
      ? null
      : Number(trimmedDeadline);

    if (
      parsedDeadline !== null &&
      (!Number.isInteger(parsedDeadline) ||
        parsedDeadline < 0)
    ) {
      setError(
        "Deadline must be a whole number of days."
      );

      return;
    }

    /*
     * Only writable contract fields are sent. id, status,
     * created_at, updated_at, version, sequence, plan_id,
     * task_id and is_selected are all server-owned.
     */
    const body: Record<string, unknown> = {
      name: trimmedName,
      goal: trimmedGoal,
      description:
        description.trim() === ""
          ? null
          : description.trim(),
      preference,
    };

    if (minMicros !== null && maxMicros !== null) {
      body.budgetMinMicros = minMicros;
      body.budgetMaxMicros = maxMicros;
      body.budgetCurrency =
        budgetCurrency.trim().toUpperCase();
    }

    if (parsedDeadline !== null) {
      body.deadlineDays = parsedDeadline;
    }

    setSubmitting(true);

    try {
      const response = await fetch(
        "/api/planner/projects",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      const data = await response
        .json()
        .catch(() => null);

      if (!response.ok || !data?.ok || !data?.project?.id) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : `Failed to create project (${response.status})`
        );
      }

      router.push(`/planner/${data.project.id}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Failed to create project"
      );

      setSubmitting(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "40px 28px 80px",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        color: "#111",
      }}
    >
      <div
        style={{
          marginBottom: 14,
        }}
      >
        <Link
          href="/planner"
          style={{
            color: "#555",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          ← Planner
        </Link>
      </div>

      <h1
        style={{
          fontSize: 32,
          margin: 0,
        }}
      >
        New Project
      </h1>

      <p
        style={{
          margin: "8px 0 24px",
          color: "#666",
          fontSize: 15,
        }}
      >
        Plan your AI work before you start.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          background: "#fff",
          border: "1px solid #e7ebf0",
          borderRadius: 12,
          padding: 22,
          display: "grid",
          gap: 20,
        }}
      >
        <div>
          <label
            htmlFor="name"
            style={labelStyle}
          >
            Project Name
          </label>

          <input
            id="name"
            value={name}
            onChange={(event) =>
              setName(event.target.value)
            }
            placeholder="Customer support rewrite"
            style={inputStyle}
          />
        </div>

        <div>
          <label
            htmlFor="goal"
            style={labelStyle}
          >
            Goal
          </label>

          <input
            id="goal"
            value={goal}
            onChange={(event) =>
              setGoal(event.target.value)
            }
            placeholder="What should this project achieve?"
            style={inputStyle}
          />
        </div>

        <div>
          <label
            htmlFor="description"
            style={labelStyle}
          >
            Description (optional)
          </label>

          <textarea
            id="description"
            value={description}
            onChange={(event) =>
              setDescription(event.target.value)
            }
            rows={4}
            placeholder="Any extra context for this project."
            style={{
              ...inputStyle,
              resize: "vertical",
            }}
          />
        </div>

        <div>
          <label
            htmlFor="preference"
            style={labelStyle}
          >
            Priority
          </label>

          <select
            id="preference"
            value={preference}
            onChange={(event) =>
              setPreference(
                event.target.value as Preference
              )
            }
            style={inputStyle}
          >
            <option value="cost_first">
              Cost First
            </option>

            <option value="time_first">
              Time First
            </option>

            <option value="balanced">
              Balanced
            </option>
          </select>

          <p style={hintStyle}>
            Balanced is the default. This
            records your intent only; it
            does not choose anything for
            you.
          </p>
        </div>

        <fieldset
          style={{
            border: "1px solid #e7ebf0",
            borderRadius: 10,
            padding: 16,
            margin: 0,
          }}
        >
          <legend
            style={{
              fontSize: 14,
              fontWeight: 600,
              padding: "0 6px",
            }}
          >
            Budget (optional)
          </legend>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "1fr 1fr 120px",
              gap: 12,
            }}
          >
            <div>
              <label
                htmlFor="budgetMin"
                style={{
                  ...labelStyle,
                  fontSize: 13,
                }}
              >
                Min
              </label>

              <input
                id="budgetMin"
                value={budgetMin}
                onChange={(event) =>
                  setBudgetMin(event.target.value)
                }
                inputMode="decimal"
                placeholder="0"
                style={inputStyle}
              />
            </div>

            <div>
              <label
                htmlFor="budgetMax"
                style={{
                  ...labelStyle,
                  fontSize: 13,
                }}
              >
                Max
              </label>

              <input
                id="budgetMax"
                value={budgetMax}
                onChange={(event) =>
                  setBudgetMax(event.target.value)
                }
                inputMode="decimal"
                placeholder="0"
                style={inputStyle}
              />
            </div>

            <div>
              <label
                htmlFor="budgetCurrency"
                style={{
                  ...labelStyle,
                  fontSize: 13,
                }}
              >
                Currency
              </label>

              <input
                id="budgetCurrency"
                value={budgetCurrency}
                onChange={(event) =>
                  setBudgetCurrency(
                    event.target.value
                  )
                }
                placeholder="CNY"
                style={inputStyle}
              />
            </div>
          </div>

          <p style={hintStyle}>
            Leave all three empty for no
            budget. If you fill one, fill
            all three; there is no default
            currency and no conversion.
          </p>
        </fieldset>

        <div>
          <label
            htmlFor="deadlineDays"
            style={labelStyle}
          >
            Deadline in days (optional)
          </label>

          <input
            id="deadlineDays"
            value={deadlineDays}
            onChange={(event) =>
              setDeadlineDays(event.target.value)
            }
            inputMode="numeric"
            placeholder="14"
            style={inputStyle}
          />
        </div>

        {error ? (
          <p
            role="alert"
            style={{
              margin: 0,
              color: "#b42318",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            {error}
          </p>
        ) : null}

        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: 0,
              background: "#172033",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: submitting
                ? "default"
                : "pointer",
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting
              ? "Creating…"
              : "Create Project"}
          </button>

          <Link
            href="/planner"
            style={{
              color: "#555",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Cancel
          </Link>
        </div>

        {/*
          Available AI Tools is intentionally not rendered yet.
          The Planner API has no endpoint that lists the tools in
          user_ai_tools, and a project has no tool column to
          store a choice, so any control here would be a field
          the API rejects. Tools are chosen per planned step in a
          later step, not at project creation.
        */}
        <p
          style={{
            ...hintStyle,
            margin: 0,
            paddingTop: 4,
            borderTop: "1px solid #eef0f3",
          }}
        >
          AI tools are not selected here. A
          project has no tool choice yet —
          tools are picked per planned step
          after a plan exists.
        </p>
      </form>
    </main>
  );
}
