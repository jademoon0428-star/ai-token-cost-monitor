"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useEffect,
  useState,
} from "react";

import TaskAiOptions from "@/components/planner/task-ai-options";

type ProjectPlanRow = {
  id: string;
  project_id: string;
  version: number;
  strategy: string;
  summary: string | null;
  pricing_basis_at: string | null;
  created_at: string;
};

type ProjectTaskRow = {
  id: string;
  plan_id: string;
  task_id: string | null;
  sequence: number;
  name: string;
  category: string;
  complexity: string;
  description: string | null;
  required_capabilities: string | null;
  estimated_input_tokens_min: number | null;
  estimated_input_tokens_max: number | null;
  estimated_output_tokens_min: number | null;
  estimated_output_tokens_max: number | null;
  status: string;
  created_at: string;
  updated_at: string;
};

/*
 * One stored resource assignment of a plan, exactly as the repository
 * returns it. For each step one of ai_resource_id / registry_model_id
 * is set, and is_primary is always 0: these are facts, never a pick.
 */
type PlanResourceAssignmentRow = {
  id: string;
  plan_id: string;
  project_task_id: string;
  ai_resource_id: string | null;
  registry_model_id: string | null;
  resource_source: string;
  role: string;
  role_source: string;
  is_primary: number;
  sequence: number;
  planned_cost_min_micros: number | null;
  planned_cost_max_micros: number | null;
  planned_cost_currency: string | null;
  planned_time_min_minutes: number | null;
  planned_time_max_minutes: number | null;
  fit_status: string;
  cost_basis: string | null;
  rationale: string | null;
  created_at: string;
  updated_at: string;
  /*
   * B2 additive display context: the verified historical usage
   * evidence of the assignment's model, one entry per currency. It is
   * never a nominal price and never participates in planned cost.
   */
  evidenceSummary?: VerifiedUsageEvidence[] | null;
};

/*
 * The verified usage evidence shape, mirroring the API payload. A
 * model can have several entries when its evidence spans several
 * currencies; they are never combined.
 */
type VerifiedUsageEvidence = {
  providerId: string;
  modelId: string;
  currency: string;
  recordCount: number;
  exportCount: number | null;
  firstTimestamp: string;
  lastTimestamp: string;
  totalCostMicros: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  sources: string[];
  provenance: "source_reported";
};

/*
 * These two lists are copied from the contract on purpose: the API
 * rejects anything else, so the form can only offer what the
 * endpoint actually accepts.
 */
const CATEGORIES = [
  "planning",
  "architecture",
  "research",
  "ui_design",
  "coding",
  "debugging",
  "testing",
  "documentation",
  "review",
  "deployment",
] as const;

const COMPLEXITIES = ["low", "medium", "high"] as const;

const CATEGORY_LABELS: Record<string, string> = {
  planning: "Planning",
  architecture: "Architecture",
  research: "Research",
  ui_design: "UI Design",
  coding: "Coding",
  debugging: "Debugging",
  testing: "Testing",
  documentation: "Documentation",
  review: "Review",
  deployment: "Deployment",
};

const COMPLEXITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const TASK_STATUS_LABELS: Record<string, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  done: "Done",
  skipped: "Skipped",
};

const STRATEGY_LABELS: Record<string, string> = {
  cost_first: "Cost First",
  time_first: "Time First",
  balanced: "Balanced",
  existing: "Existing",
  cost_conscious: "Cost Conscious",
  mixed: "Mixed",
  subscription: "Subscription",
  registry_expanded: "Registry Expanded",
};

const ROLE_LABELS: Record<string, string> = {
  implementer: "Implementer",
  reviewer: "Reviewer",
  researcher: "Researcher",
  designer: "Designer",
  assistant: "Assistant",
};

/*
 * fit_status is a capability-fit fact against the step's own
 * requirements, not a verdict on the resource. The labels stay within
 * that meaning.
 */
const FIT_STATUS_LABELS: Record<string, string> = {
  meets: "Meets",
  below_minimum: "Below minimum",
  unknown: "Unknown",
};

function formatMicros(micros: number): string {
  const value = micros / 1_000_000;

  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(6)));
}

const cardStyle = {
  background: "#fff",
  border: "1px solid #e7ebf0",
  borderRadius: 12,
  padding: 22,
};

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

function formatDate(value: string): string {
  return value.slice(0, 10);
}

function currencySymbol(currency: string): string {
  if (currency === "CNY") {
    return "¥";
  }

  if (currency === "USD") {
    return "$";
  }

  return `${currency} `;
}

/*
 * Compact token total for the evidence line (for example 176.2M).
 * Input and output tokens are the counted ask; cached and reasoning
 * tokens are sub-buckets of those, so they are never added again.
 */
function formatTokenTotal(evidence: VerifiedUsageEvidence): string {
  const total =
    evidence.inputTokens + evidence.outputTokens;

  if (total >= 1_000_000_000) {
    return `${Number((total / 1_000_000_000).toFixed(1))}B`;
  }

  if (total >= 1_000_000) {
    return `${Number((total / 1_000_000).toFixed(1))}M`;
  }

  if (total >= 1_000) {
    return `${Number((total / 1_000).toFixed(1))}K`;
  }

  return String(total);
}

function Field({
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

/*
 * A token estimate is optional and must be a whole number, so a
 * blank field is left out of the request instead of being sent as
 * 0 or as an empty string.
 */
function parseEstimate(
  input: string
): {
  value: number | null;
  error: string | null;
} {
  const trimmed = input.trim();

  if (trimmed === "") {
    return { value: null, error: null };
  }

  const value = Number(trimmed);

  if (!Number.isInteger(value) || value < 0) {
    return {
      value: null,
      error: "must be a whole number of tokens",
    };
  }

  return { value, error: null };
}

const readJson = (
  response: Response
): Promise<{
  response: Response;
  data: {
    ok?: boolean;
    error?: string;
    code?: string;
    plan?: ProjectPlanRow;
    project?: { name: string };
    items?: unknown[];
  } | null;
}> =>
  response
    .json()
    .catch(() => null)
    .then((data) => ({ response, data }));

export default function PlanDetailPage() {
  const params = useParams<{
    projectId: string;
    planId: string;
  }>();

  const projectId = params?.projectId;
  const planId = params?.planId;
  const missingId =
    typeof projectId !== "string" ||
    projectId === "" ||
    typeof planId !== "string" ||
    planId === "";

  const [plan, setPlan] = useState<ProjectPlanRow | null>(
    null
  );
  const [projectName, setProjectName] = useState<string | null>(
    null
  );
  const [tasks, setTasks] = useState<ProjectTaskRow[]>([]);
  const [assignments, setAssignments] = useState<
    PlanResourceAssignmentRow[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasksError, setTasksError] = useState<string | null>(
    null
  );
  const [assignmentsError, setAssignmentsError] = useState<
    string | null
  >(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] =
    useState<(typeof CATEGORIES)[number]>("coding");
  const [complexity, setComplexity] =
    useState<(typeof COMPLEXITIES)[number]>("medium");
  const [description, setDescription] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [inputTokensMin, setInputTokensMin] =
    useState("");
  const [inputTokensMax, setInputTokensMax] =
    useState("");
  const [outputTokensMin, setOutputTokensMin] =
    useState("");
  const [outputTokensMax, setOutputTokensMax] =
    useState("");

  const [creatingTask, setCreatingTask] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(
    null
  );

  /*
   * Which task panels are open, and which have been opened at least
   * once. A panel is mounted only after its first opening, so a task
   * never requests its AI options before the user asks to see them,
   * and a second opening reuses what was already read.
   *
   * Nothing here is persisted and nothing here is a decision: opening
   * a panel neither selects an option nor compares cost, time, fit or
   * the plan strategy. The options component owns its own loading,
   * error and selection state so choosing an option on one task
   * never reloads the plan, the project or the task list.
   */
  const [expandedTaskIds, setExpandedTaskIds] = useState<
    Record<string, boolean>
  >({});
  const [loadedTaskIds, setLoadedTaskIds] = useState<
    Record<string, boolean>
  >({});

  function toggleTaskAiOptions(taskId: string) {
    setExpandedTaskIds((current) => ({
      ...current,
      [taskId]: !current[taskId],
    }));
    setLoadedTaskIds((current) =>
      current[taskId]
        ? current
        : { ...current, [taskId]: true }
    );
  }

  useEffect(() => {
    if (missingId) {
      return;
    }

    let cancelled = false;

    Promise.all([
      fetch(`/api/planner/plans/${planId}`, {
        cache: "no-store",
      }).then(readJson),
      fetch(`/api/planner/projects/${projectId}`, {
        cache: "no-store",
      }).then(readJson),
      fetch(`/api/planner/plans/${planId}/tasks`, {
        cache: "no-store",
      }).then(readJson),
      fetch(`/api/planner/plans/${planId}/assignments`, {
        cache: "no-store",
      }).then(readJson),
    ])
      .then(
        ([
          planResult,
          projectResult,
          tasksResult,
          assignmentsResult,
        ]) => {
          if (cancelled) {
            return;
          }

          if (
            !planResult.response.ok ||
            !planResult.data?.ok
          ) {
            if (
              planResult.data?.code ===
                "PLAN_NOT_FOUND" ||
              planResult.response.status === 404
            ) {
              setNotFound(true);
              setLoading(false);

              return;
            }

            throw new Error(
              typeof planResult.data?.error === "string"
                ? planResult.data.error
                : `Failed to load plan (${planResult.response.status})`
            );
          }

          setPlan(planResult.data.plan as ProjectPlanRow);

          if (
            projectResult.response.ok &&
            projectResult.data?.ok &&
            projectResult.data.project
          ) {
            setProjectName(
              projectResult.data.project.name
            );
          }

          if (
            tasksResult.response.ok &&
            tasksResult.data?.ok
          ) {
            setTasks(
              Array.isArray(tasksResult.data.items)
                ? (tasksResult.data.items as ProjectTaskRow[])
                : []
            );
          } else {
            setTasksError(
              typeof tasksResult.data?.error ===
                "string"
                ? tasksResult.data.error
                : "Could not load tasks"
            );
          }

          if (
            assignmentsResult.response.ok &&
            assignmentsResult.data?.ok &&
            Array.isArray(assignmentsResult.data.items)
          ) {
            setAssignments(
              assignmentsResult.data.items as PlanResourceAssignmentRow[]
            );
            setAssignmentsError(null);
          } else {
            setAssignments([]);
            setAssignmentsError(
              typeof assignmentsResult.data?.error ===
                "string"
                ? assignmentsResult.data.error
                : "Could not load assignments"
            );
          }

          setLoading(false);
        }
      )
      .catch((cause) => {
        if (cancelled) {
          return;
        }

        setError(
          cause instanceof Error
            ? cause.message
            : "Failed to load plan"
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [missingId, planId, projectId, reloadKey]);

  function handleRetry() {
    setLoading(true);
    setError(null);
    setNotFound(false);
    setTasksError(null);
    setReloadKey((key) => key + 1);
  }

  function clearTaskForm() {
    setName("");
    setCategory("coding");
    setComplexity("medium");
    setDescription("");
    setCapabilities("");
    setInputTokensMin("");
    setInputTokensMax("");
    setOutputTokensMin("");
    setOutputTokensMax("");
  }

  /*
   * Only the fields on the endpoint whitelist are sent, and an
   * optional field the user left empty is omitted entirely rather
   * than sent as an empty string. The task id, the sequence, the
   * status and both timestamps are server-owned: sequence is one
   * more than the plan's highest, and status starts as planned.
   */
  async function handleCreateTask(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (creatingTask) {
      return;
    }

    setTaskError(null);

    if (name.trim() === "") {
      setTaskError("Task name is required.");

      return;
    }

    const inputMin = parseEstimate(inputTokensMin);
    const inputMax = parseEstimate(inputTokensMax);
    const outputMin = parseEstimate(outputTokensMin);
    const outputMax = parseEstimate(outputTokensMax);

    for (const estimate of [
      inputMin,
      inputMax,
      outputMin,
      outputMax,
    ]) {
      if (estimate.error) {
        setTaskError(
          `Token estimates ${estimate.error}.`
        );

        return;
      }
    }

    if (
      inputMin.value !== null &&
      inputMax.value !== null &&
      inputMin.value > inputMax.value
    ) {
      setTaskError(
        "Estimated input tokens minimum cannot be greater than the maximum."
      );

      return;
    }

    if (
      outputMin.value !== null &&
      outputMax.value !== null &&
      outputMin.value > outputMax.value
    ) {
      setTaskError(
        "Estimated output tokens minimum cannot be greater than the maximum."
      );

      return;
    }

    const body: Record<string, unknown> = {
      name: name.trim(),
      category,
      complexity,
    };

    if (description.trim() !== "") {
      body.description = description.trim();
    }

    /*
     * required_capabilities is a JSON array string, so a
     * comma-separated list is turned into one here rather than sent
     * as free text.
     */
    const capabilityList = capabilities
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry !== "");

    if (capabilityList.length > 0) {
      body.requiredCapabilities = JSON.stringify(
        capabilityList
      );
    }

    if (inputMin.value !== null) {
      body.estimatedInputTokensMin = inputMin.value;
    }

    if (inputMax.value !== null) {
      body.estimatedInputTokensMax = inputMax.value;
    }

    if (outputMin.value !== null) {
      body.estimatedOutputTokensMin = outputMin.value;
    }

    if (outputMax.value !== null) {
      body.estimatedOutputTokensMax = outputMax.value;
    }

    setCreatingTask(true);

    try {
      const response = await fetch(
        `/api/planner/plans/${planId}/tasks`,
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

      if (!response.ok || !data?.ok || !data?.task) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : `Failed to add task (${response.status})`
        );
      }

      clearTaskForm();
      setCreatingTask(false);
      setTasksError(null);
      setReloadKey((key) => key + 1);
    } catch (cause) {
      setTaskError(
        cause instanceof Error
          ? cause.message
          : "Failed to add task"
      );
      setCreatingTask(false);
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
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 14,
        }}
      >
        <Link
          href={projectId ? `/planner/${projectId}` : "/planner"}
          style={{
            color: "#555",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          ← Project Detail
        </Link>

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

      {loading && !missingId ? (
        <p
          style={{
            color: "#666",
            fontSize: 14,
          }}
        >
          Loading plan…
        </p>
      ) : missingId || notFound ? (
        <div style={cardStyle}>
          <h2
            style={{
              fontSize: 16,
              margin: "0 0 8px",
            }}
          >
            Plan not found
          </h2>

          <p
            style={{
              margin: "0 0 14px",
              color: "#666",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            This plan does not exist, or
            it was removed.
          </p>

          <Link
            href={projectId ? `/planner/${projectId}` : "/planner"}
            style={{
              display: "inline-block",
              padding: "9px 14px",
              borderRadius: 8,
              background: "#172033",
              color: "#fff",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            Back to Project
          </Link>
        </div>
      ) : error ? (
        <div style={cardStyle}>
          <h2
            style={{
              fontSize: 16,
              margin: "0 0 8px",
            }}
          >
            Could not load plan
          </h2>

          <p
            style={{
              margin: "0 0 14px",
              color: "#b42318",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            {error}
          </p>

          <button
            onClick={handleRetry}
            style={{
              padding: "9px 14px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fff",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Retry
          </button>
        </div>
      ) : plan ? (
        <>
          <header style={{ marginBottom: 22 }}>
            <h1
              style={{
                fontSize: 32,
                margin: 0,
              }}
            >
              AI Project Plan
            </h1>

            <p
              style={{
                margin: "8px 0 0",
                color: "#666",
                fontSize: 15,
              }}
            >
              {projectName ?? "Project"} · v
              {plan.version}
            </p>
          </header>

          <div
            style={{
              ...cardStyle,
              display: "grid",
              gap: 18,
              marginBottom: 18,
            }}
          >
            <Field
              label="PROJECT"
              value={projectName ?? "—"}
            />

            <Field
              label="PLAN VERSION"
              value={`v${plan.version}`}
            />

            <Field
              label="STRATEGY"
              value={
                STRATEGY_LABELS[plan.strategy] ??
                plan.strategy
              }
            />

            <Field
              label="SUMMARY"
              value={plan.summary ?? "—"}
            />

            <Field
              label="CREATED"
              value={formatDate(plan.created_at)}
            />

            <Field
              label="PRICING BASIS"
              value={
                plan.pricing_basis_at
                  ? formatDate(plan.pricing_basis_at)
                  : "—"
              }
            />
          </div>

          <div style={cardStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                marginBottom: showForm
                  ? 18
                  : 12,
              }}
            >
              <h2
                style={{
                  fontSize: 16,
                  margin: 0,
                }}
              >
                Tasks
              </h2>

              <button
                type="button"
                onClick={() =>
                  setShowForm((open) => !open)
                }
                style={{
                  padding: "9px 14px",
                  borderRadius: 8,
                  border: 0,
                  background: "#172033",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {showForm ? "Cancel" : "Add Task"}
              </button>
            </div>

            {showForm ? (
              <form
                onSubmit={handleCreateTask}
                style={{
                  display: "grid",
                  gap: 16,
                  padding: 18,
                  marginBottom: 18,
                  border: "1px solid #e7ebf0",
                  borderRadius: 10,
                }}
              >
                <div>
                  <label
                    htmlFor="taskName"
                    style={labelStyle}
                  >
                    Name
                  </label>

                  <input
                    id="taskName"
                    value={name}
                    onChange={(event) =>
                      setName(event.target.value)
                    }
                    placeholder="Draft the data model"
                    style={inputStyle}
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <div>
                    <label
                      htmlFor="taskCategory"
                      style={labelStyle}
                    >
                      Category
                    </label>

                    <select
                      id="taskCategory"
                      value={category}
                      onChange={(event) =>
                        setCategory(
                          event.target
                            .value as (typeof CATEGORIES)[number]
                        )
                      }
                      style={inputStyle}
                    >
                      {CATEGORIES.map((value) => (
                        <option
                          key={value}
                          value={value}
                        >
                          {CATEGORY_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="taskComplexity"
                      style={labelStyle}
                    >
                      Complexity
                    </label>

                    <select
                      id="taskComplexity"
                      value={complexity}
                      onChange={(event) =>
                        setComplexity(
                          event.target
                            .value as (typeof COMPLEXITIES)[number]
                        )
                      }
                      style={inputStyle}
                    >
                      {COMPLEXITIES.map((value) => (
                        <option
                          key={value}
                          value={value}
                        >
                          {COMPLEXITY_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="taskDescription"
                    style={labelStyle}
                  >
                    Description (optional)
                  </label>

                  <textarea
                    id="taskDescription"
                    value={description}
                    onChange={(event) =>
                      setDescription(event.target.value)
                    }
                    rows={3}
                    style={{
                      ...inputStyle,
                      resize: "vertical",
                    }}
                  />
                </div>

                <div>
                  <label
                    htmlFor="taskCapabilities"
                    style={labelStyle}
                  >
                    Required capabilities
                    (optional)
                  </label>

                  <input
                    id="taskCapabilities"
                    value={capabilities}
                    onChange={(event) =>
                      setCapabilities(event.target.value)
                    }
                    placeholder="long_context, tool_use"
                    style={inputStyle}
                  />

                  <p style={hintStyle}>
                    Comma separated. Stored as a
                    list of capability names.
                  </p>
                </div>

                <fieldset
                  style={{
                    border: "1px solid #e7ebf0",
                    borderRadius: 10,
                    padding: 14,
                    margin: 0,
                  }}
                >
                  <legend
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      padding: "0 6px",
                    }}
                  >
                    Token estimates
                    (optional)
                  </legend>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "1fr 1fr",
                      gap: 12,
                    }}
                  >
                    <div>
                      <label
                        htmlFor="inputTokensMin"
                        style={{
                          ...labelStyle,
                          fontSize: 13,
                        }}
                      >
                        Input min
                      </label>

                      <input
                        id="inputTokensMin"
                        value={inputTokensMin}
                        onChange={(event) =>
                          setInputTokensMin(
                            event.target.value
                          )
                        }
                        inputMode="numeric"
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="inputTokensMax"
                        style={{
                          ...labelStyle,
                          fontSize: 13,
                        }}
                      >
                        Input max
                      </label>

                      <input
                        id="inputTokensMax"
                        value={inputTokensMax}
                        onChange={(event) =>
                          setInputTokensMax(
                            event.target.value
                          )
                        }
                        inputMode="numeric"
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="outputTokensMin"
                        style={{
                          ...labelStyle,
                          fontSize: 13,
                        }}
                      >
                        Output min
                      </label>

                      <input
                        id="outputTokensMin"
                        value={outputTokensMin}
                        onChange={(event) =>
                          setOutputTokensMin(
                            event.target.value
                          )
                        }
                        inputMode="numeric"
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="outputTokensMax"
                        style={{
                          ...labelStyle,
                          fontSize: 13,
                        }}
                      >
                        Output max
                      </label>

                      <input
                        id="outputTokensMax"
                        value={outputTokensMax}
                        onChange={(event) =>
                          setOutputTokensMax(
                            event.target.value
                          )
                        }
                        inputMode="numeric"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </fieldset>

                {taskError ? (
                  <p
                    role="alert"
                    style={{
                      margin: 0,
                      color: "#b42318",
                      fontSize: 14,
                      lineHeight: 1.5,
                    }}
                  >
                    {taskError}
                  </p>
                ) : null}

                <div>
                  <button
                    type="submit"
                    disabled={creatingTask}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 8,
                      border: 0,
                      background: "#172033",
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: creatingTask
                        ? "default"
                        : "pointer",
                      opacity: creatingTask
                        ? 0.6
                        : 1,
                    }}
                  >
                    {creatingTask
                      ? "Adding…"
                      : taskError
                        ? "Retry"
                        : "Add Task"}
                  </button>
                </div>
              </form>
            ) : null}

            {tasksError ? (
              <>
                <p
                  style={{
                    margin: "0 0 12px",
                    color: "#b42318",
                    fontSize: 14,
                    lineHeight: 1.5,
                  }}
                >
                  {tasksError}
                </p>

                <button
                  onClick={handleRetry}
                  style={{
                    padding: "9px 14px",
                    borderRadius: 8,
                    border: "1px solid #ddd",
                    background: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  Retry
                </button>
              </>
            ) : tasks.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  color: "#666",
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                No tasks yet.
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 10,
                }}
              >
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    style={{
                      paddingTop: 10,
                      borderTop: "1px solid #f0f1f4",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent:
                          "space-between",
                        alignItems: "flex-start",
                        gap: 12,
                        marginBottom: 6,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                        }}
                      >
                        {task.sequence}. {task.name}
                      </div>

                      <Badge
                        text={
                          TASK_STATUS_LABELS[
                            task.status
                          ] ?? task.status
                        }
                        color="#555"
                      />
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                      }}
                    >
                      <Badge
                        text={
                          CATEGORY_LABELS[
                            task.category
                          ] ?? task.category
                        }
                        color="#5a4ce1"
                      />

                      <Badge
                        text={
                          COMPLEXITY_LABELS[
                            task.complexity
                          ] ?? task.complexity
                        }
                        color="#3976cf"
                      />
                    </div>

                    {task.description ? (
                      <p
                        style={{
                          margin: "8px 0 0",
                          color: "#666",
                          fontSize: 13,
                          lineHeight: 1.5,
                        }}
                      >
                        {task.description}
                      </p>
                    ) : null}

                    <div
                      style={{
                        marginTop: 10,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          toggleTaskAiOptions(task.id)
                        }
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: "1px solid #ddd",
                          background: "#fff",
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        {expandedTaskIds[task.id]
                          ? "Hide AI options"
                          : "Show AI options"}
                      </button>
                    </div>

                    {loadedTaskIds[task.id] ? (
                      <TaskAiOptions
                        taskId={task.id}
                        expanded={
                          expandedTaskIds[task.id] ===
                          true
                        }
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={cardStyle}>
            <h2
              style={{
                fontSize: 16,
                margin: "0 0 8px",
              }}
            >
              Assignments
            </h2>

            <p
              style={{
                margin: "0 0 14px",
                color: "#666",
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              The resource, role, cost and planned time stored for
              each step of this plan. These are recorded facts;
              nothing here is selected or recommended.
            </p>

            {assignmentsError ? (
              <div>
                <p
                  style={{
                    margin: "0 0 14px",
                    color: "#b42318",
                    fontSize: 14,
                    lineHeight: 1.5,
                  }}
                >
                  {assignmentsError}
                </p>

                <button
                  type="button"
                  onClick={() => setReloadKey((key) => key + 1)}
                  style={{
                    padding: "9px 14px",
                    borderRadius: 8,
                    border: "1px solid #ddd",
                    background: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Retry
                </button>
              </div>
            ) : assignments.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  color: "#666",
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                No assignments recorded for this plan yet.
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 14,
                }}
              >
                {assignments.map((assignment) => {
                  const resource =
                    assignment.resource_source ===
                    "registry"
                      ? `Registry model ${assignment.registry_model_id}`
                      : `Registered resource ${assignment.ai_resource_id}`;

                  const cost =
                    assignment.planned_cost_min_micros !==
                      null &&
                    assignment.planned_cost_max_micros !==
                      null &&
                    assignment.planned_cost_currency !==
                      null
                      ? `${formatMicros(assignment.planned_cost_min_micros)} – ${formatMicros(assignment.planned_cost_max_micros)} ${assignment.planned_cost_currency}`
                      : "Unknown";

                  const costUnknown =
                    assignment.planned_cost_min_micros ===
                      null ||
                    assignment.planned_cost_max_micros ===
                      null ||
                    assignment.planned_cost_currency ===
                      null;

                  const time =
                    assignment.planned_time_min_minutes !==
                      null &&
                    assignment.planned_time_max_minutes !==
                      null
                      ? `${assignment.planned_time_min_minutes}–${assignment.planned_time_max_minutes} min`
                      : "Unknown";

                  return (
                    <div
                      key={assignment.id}
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
                          justifyContent:
                            "space-between",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 600,
                          }}
                        >
                          {assignment.sequence}.{" "}
                          {ROLE_LABELS[assignment.role] ??
                            assignment.role}
                        </span>

                        <Badge
                          text={
                            FIT_STATUS_LABELS[
                              assignment.fit_status
                            ] ?? assignment.fit_status
                          }
                          color="#555"
                        />
                      </div>

                      <div
                        style={{
                          color: "#333",
                        }}
                      >
                        Resource:{" "}
                        <code
                          style={{
                            wordBreak: "break-all",
                          }}
                        >
                          {resource}
                        </code>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gap: 2,
                          color: "#666",
                          fontSize: 13,
                        }}
                      >
                        <span>
                          Cost: {cost}
                        </span>
                        <span>
                          Time: {time}
                        </span>
                      </div>

                      {assignment.cost_basis ? (
                        <p
                          style={{
                            margin: 0,
                            color: "#666",
                            fontSize: 12,
                            lineHeight: 1.5,
                          }}
                        >
                          Basis:{" "}
                          {assignment.cost_basis}
                        </p>
                      ) : null}

                      {assignment.evidenceSummary &&
                      assignment.evidenceSummary.length > 0 ? (
                        <div
                          style={{
                            display: "grid",
                            gap: 4,
                            color: "#666",
                            fontSize: 12,
                            lineHeight: 1.5,
                          }}
                        >
                          {costUnknown ? (
                            <div>
                              <span
                                style={{
                                  fontWeight: 600,
                                }}
                              >
                                Nominal price:
                              </span>{" "}
                              No registry pricing
                              available.
                            </div>
                          ) : null}

                          <div>
                            <span
                              style={{
                                fontWeight: 600,
                              }}
                            >
                              Verified usage
                              evidence:
                            </span>
                          </div>

                          {assignment.evidenceSummary.map(
                            (evidence) => {
                              const sourceLabel =
                                evidence.sources.length >
                                0
                                  ? evidence.sources.join(
                                      " / "
                                    )
                                  : "verified";

                              return (
                                <div
                                  key={evidence.currency}
                                >
                                  {evidence.recordCount}{" "}
                                  records ·{" "}
                                  {currencySymbol(
                                    evidence.currency
                                  )}
                                  {formatMicros(
                                    evidence.totalCostMicros
                                  )}{" "}
                                  ·{" "}
                                  {formatTokenTotal(
                                    evidence
                                  )}{" "}
                                  tokens
                                  <br />
                                  {formatDate(
                                    evidence.firstTimestamp
                                  )}{" "}
                                  →{" "}
                                  {formatDate(
                                    evidence.lastTimestamp
                                  )}
                                  <br />
                                  Source:{" "}
                                  {sourceLabel} /{" "}
                                  {evidence.provenance}
                                </div>
                              );
                            }
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}
    </main>
  );
}
