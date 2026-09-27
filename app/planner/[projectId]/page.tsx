"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useRouter,
} from "next/navigation";
import {
  useEffect,
  useState,
} from "react";

type ProjectRow = {
  id: string;
  name: string;
  goal: string | null;
  description: string | null;
  preference: string;
  budget_min_micros: number | null;
  budget_max_micros: number | null;
  budget_currency: string | null;
  deadline_days: number | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type ProjectPlanRow = {
  id: string;
  project_id: string;
  version: number;
  strategy: string;
  summary: string | null;
  created_at: string;
};

/*
 * The API only accepts these three values for plan strategy, taken
 * from the contract itself. The select starts on the project's own
 * preference and can only move between the same three.
 */
const STRATEGIES = [
  "cost_first",
  "time_first",
  "balanced",
] as const;

const PREFERENCE_LABELS: Record<string, string> = {
  cost_first: "Cost First",
  time_first: "Time First",
  balanced: "Balanced",
};

const STATUS_LABELS: Record<string, string> = {
  planning: "Planning",
  active: "Active",
  completed: "Completed",
  abandoned: "Abandoned",
};

function formatMicros(micros: number): string {
  const value = micros / 1_000_000;

  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(6)));
}

function formatBudget(project: ProjectRow): string {
  const {
    budget_min_micros,
    budget_max_micros,
    budget_currency,
  } = project;

  if (
    budget_min_micros === null ||
    budget_max_micros === null ||
    budget_currency === null
  ) {
    return "No budget set";
  }

  return `${formatMicros(budget_min_micros)} – ${formatMicros(budget_max_micros)} ${budget_currency}`;
}

function formatDeadline(project: ProjectRow): string {
  if (project.deadline_days === null) {
    return "No deadline";
  }

  return `${project.deadline_days} day${
    project.deadline_days === 1 ? "" : "s"
  }`;
}

function formatDate(value: string): string {
  return value.slice(0, 10);
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

const cardStyle = {
  background: "#fff",
  border: "1px solid #e7ebf0",
  borderRadius: 12,
  padding: 22,
};

const inputStyle = {
  padding: "9px 11px",
  borderRadius: 8,
  border: "1px solid #ddd",
  background: "#fff",
  fontSize: 14,
};

const readJson = (
  response: Response
): Promise<{
  response: Response;
  data: {
    ok?: boolean;
    error?: string;
    code?: string;
    project?: ProjectRow;
    items?: ProjectPlanRow[];
  } | null;
}> =>
  response
    .json()
    .catch(() => null)
    .then((data) => ({ response, data }));

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId;
  const missingId =
    typeof projectId !== "string" ||
    projectId === "";

  const [project, setProject] = useState<ProjectRow | null>(
    null
  );
  const [plans, setPlans] = useState<ProjectPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plansError, setPlansError] = useState<string | null>(
    null
  );
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  /*
   * Left null so the strategy follows the project's own preference
   * until the user picks something else.
   */
  const [strategyChoice, setStrategyChoice] =
    useState<string | null>(null);

  const [creatingPlan, setCreatingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(
    null
  );

  const strategy =
    strategyChoice ??
    (STRATEGIES.includes(
      project?.preference as (typeof STRATEGIES)[number]
    )
      ? project?.preference
      : "balanced");

  useEffect(() => {
    if (missingId) {
      return;
    }

    let cancelled = false;

    Promise.all([
      fetch(`/api/planner/projects/${projectId}`, {
        cache: "no-store",
      }).then(readJson),
      fetch(`/api/planner/projects/${projectId}/plans`, {
        cache: "no-store",
      }).then(readJson),
    ])
      .then(([projectResult, plansResult]) => {
        if (cancelled) {
          return;
        }

        if (
          !projectResult.response.ok ||
          !projectResult.data?.ok
        ) {
          if (
            projectResult.data?.code ===
              "PROJECT_NOT_FOUND" ||
            projectResult.response.status === 404
          ) {
            setNotFound(true);
            setLoading(false);

            return;
          }

          throw new Error(
            typeof projectResult.data?.error === "string"
              ? projectResult.data.error
              : `Failed to load project (${projectResult.response.status})`
          );
        }

        setProject(
          projectResult.data.project as ProjectRow
        );

        if (
          plansResult.response.ok &&
          plansResult.data?.ok
        ) {
          setPlans(
            Array.isArray(plansResult.data.items)
              ? plansResult.data.items
              : []
          );
        } else {
          setPlansError(
            typeof plansResult.data?.error === "string"
              ? plansResult.data.error
              : "Could not load plan versions"
          );
        }

        setLoading(false);
      })
      .catch((cause) => {
        if (cancelled) {
          return;
        }

        setError(
          cause instanceof Error
            ? cause.message
            : "Failed to load project"
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [missingId, projectId, reloadKey]);

  function handleRetry() {
    setLoading(true);
    setError(null);
    setNotFound(false);
    setPlansError(null);
    setReloadKey((key) => key + 1);
  }

  /*
   * Only `strategy` is sent. The plan version, the plan id, the
   * project id and both timestamps are server-owned, and the API
   * rejects any field that is not on its whitelist, so the body is
   * exactly this one key.
   */
  async function handleCreatePlan() {
    if (creatingPlan) {
      return;
    }

    setCreatingPlan(true);
    setPlanError(null);

    try {
      const response = await fetch(
        `/api/planner/projects/${projectId}/plans`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            strategy,
          }),
        }
      );

      const data = await response
        .json()
        .catch(() => null);

      if (
        !response.ok ||
        !data?.ok ||
        !data?.plan?.id
      ) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : `Failed to create plan (${response.status})`
        );
      }

      router.push(
        `/planner/${projectId}/plans/${data.plan.id}`
      );
    } catch (cause) {
      setPlanError(
        cause instanceof Error
          ? cause.message
          : "Failed to create plan"
      );
      setCreatingPlan(false);
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

      {loading && !missingId ? (
        <p
          style={{
            color: "#666",
            fontSize: 14,
          }}
        >
          Loading project…
        </p>
      ) : missingId || notFound ? (
        <div style={cardStyle}>
          <h2
            style={{
              fontSize: 16,
              margin: "0 0 8px",
            }}
          >
            Project not found
          </h2>

          <p
            style={{
              margin: "0 0 14px",
              color: "#666",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            This project does not exist,
            or it was removed.
          </p>

          <Link
            href="/planner"
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
            Back to Planner
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
            Could not load project
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
      ) : project ? (
        <>
          <header style={{ marginBottom: 22 }}>
            <h1
              style={{
                fontSize: 32,
                margin: 0,
                wordBreak: "break-word",
              }}
            >
              {project.name}
            </h1>

            <p
              style={{
                margin: "8px 0 0",
                color: "#666",
                fontSize: 15,
              }}
            >
              {STATUS_LABELS[project.status] ??
                project.status}
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
              label="GOAL"
              value={project.goal ?? "—"}
            />

            <Field
              label="DESCRIPTION"
              value={project.description ?? "—"}
            />

            <Field
              label="PRIORITY"
              value={
                PREFERENCE_LABELS[project.preference] ??
                project.preference
              }
            />

            <Field
              label="BUDGET"
              value={formatBudget(project)}
            />

            <Field
              label="DEADLINE"
              value={formatDeadline(project)}
            />

            <Field
              label="CREATED"
              value={formatDate(project.created_at)}
            />
          </div>

          <div
            style={{
              ...cardStyle,
              marginBottom: 18,
            }}
          >
            <h2
              style={{
                fontSize: 16,
                margin: "0 0 8px",
              }}
            >
              Plan
            </h2>

            <p
              style={{
                margin: "0 0 14px",
                color: "#666",
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              Creates the next plan version
              for this project. A plan
              version is never edited: each
              new plan is a new version.
            </p>

            <div
              style={{
                marginBottom: 14,
                maxWidth: 260,
              }}
            >
              <label
                htmlFor="strategy"
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                Strategy
              </label>

              <select
                id="strategy"
                value={strategy}
                disabled={creatingPlan}
                onChange={(event) =>
                  setStrategyChoice(
                    event.target.value
                  )
                }
                style={{
                  ...inputStyle,
                  width: "100%",
                }}
              >
                {STRATEGIES.map((value) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {PREFERENCE_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>

            {planError ? (
              <p
                role="alert"
                style={{
                  margin: "0 0 14px",
                  color: "#b42318",
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                {planError}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => void handleCreatePlan()}
              disabled={creatingPlan}
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                border: 0,
                background: "#172033",
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                cursor: creatingPlan
                  ? "default"
                  : "pointer",
                opacity: creatingPlan ? 0.6 : 1,
              }}
            >
              {creatingPlan
                ? "Creating plan…"
                : planError
                  ? "Retry"
                  : "Plan this project"}
            </button>
          </div>

          <div style={cardStyle}>
            <h2
              style={{
                fontSize: 16,
                margin: "0 0 12px",
              }}
            >
              Plan versions
            </h2>

            {plansError ? (
              <>
                <p
                  style={{
                    margin: "0 0 12px",
                    color: "#b42318",
                    fontSize: 14,
                    lineHeight: 1.5,
                  }}
                >
                  {plansError}
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
            ) : plans.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  color: "#666",
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                No plan versions yet.
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 8,
                }}
              >
                {plans.map((plan) => (
                  <div
                    key={plan.id}
                    style={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      alignItems: "center",
                      gap: 12,
                      paddingTop: 8,
                      borderTop: "1px solid #f0f1f4",
                      fontSize: 14,
                    }}
                  >
                    <Link
                      href={`/planner/${projectId}/plans/${plan.id}`}
                      style={{
                        color: "#111",
                        fontWeight: 600,
                        textDecoration: "none",
                      }}
                    >
                      v{plan.version}
                    </Link>

                    <span
                      style={{
                        color: "#666",
                        fontSize: 13,
                      }}
                    >
                      {PREFERENCE_LABELS[
                        plan.strategy
                      ] ?? plan.strategy}{" "}
                      ·{" "}
                      {formatDate(plan.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </main>
  );
}
