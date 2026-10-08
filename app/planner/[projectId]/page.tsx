"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useRouter,
} from "next/navigation";
import {
  Fragment,
  useEffect,
  useState,
} from "react";

import {
  costRangeText,
  minutesRangeText,
} from "@/components/planner/plan-productivity";
import type {
  PlanProductivityReport,
  TaskProductivityRow,
} from "@/components/planner/plan-productivity";
import ProjectStages from "@/components/planner/project-stages";

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
  pricing_basis_at: string | null;
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

/*
 * The five combination strategies come from the R2 3.3-A rules and are
 * neutral names, not judgements. A plan's strategy is either one of the
 * three manual preferences above or one of these five; there is no
 * overlap, so the value alone tells manual and combination plans apart.
 */
const COMBINATION_STRATEGIES = [
  "existing",
  "cost_conscious",
  "mixed",
  "subscription",
  "registry_expanded",
] as const;

const COMBINATION_STRATEGY_LABELS: Record<string, string> = {
  existing: "Existing",
  cost_conscious: "Cost Conscious",
  mixed: "Mixed",
  subscription: "Subscription",
  registry_expanded: "Registry Expanded",
};

const PLAN_STRATEGY_LABELS: Record<string, string> = {
  ...PREFERENCE_LABELS,
  ...COMBINATION_STRATEGY_LABELS,
};

function isCombinationPlan(plan: {
  strategy: string;
}): boolean {
  return COMBINATION_STRATEGIES.includes(
    plan.strategy as (typeof COMBINATION_STRATEGIES)[number]
  );
}

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

const tableHeaderCellStyle = {
  textAlign: "left" as const,
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 700,
  color: "#666",
  borderBottom: "1px solid #e7ebf0",
  whiteSpace: "nowrap" as const,
};

const tableCellStyle = {
  padding: "10px",
  verticalAlign: "top" as const,
  borderBottom: "1px solid #f0f1f4",
};

type ComparisonAssignmentRow = {
  project_task_id: string;
  resource_name: string | null;
  resource_provider: string | null;
  resource_source: string;
  registry_model_id: string | null;
  ai_resource_id: string | null;
};

type ComparisonEntry = {
  report: PlanProductivityReport;
  assignments: ComparisonAssignmentRow[];
};

type ComparisonReportResponse = PlanProductivityReport & {
  ok?: boolean;
  error?: string;
};

type ComparisonAssignmentsResponse = {
  ok?: boolean;
  error?: string;
  items?: ComparisonAssignmentRow[];
};

function readComparisonJson<T>(
  pending: Promise<Response>
): Promise<{ response: Response; data: T | null }> {
  return pending.then((response) =>
    response
      .json()
      .catch(() => null)
      .then((data) => ({
        response,
        data: data as T | null,
      }))
  );
}

function latestVersionPerStrategy(
  plans: ProjectPlanRow[]
): ProjectPlanRow[] {
  const latest = new Map<string, ProjectPlanRow>();

  for (const plan of plans) {
    const current = latest.get(plan.strategy);

    if (!current || plan.version > current.version) {
      latest.set(plan.strategy, plan);
    }
  }

  return plans.filter(
    (plan) => latest.get(plan.strategy) === plan
  );
}

function orderedComparisonPlans(
  plans: ProjectPlanRow[]
): ProjectPlanRow[] {
  return [
    ...plans.filter((plan) => !isCombinationPlan(plan)),
    ...plans.filter((plan) => isCombinationPlan(plan)),
  ];
}

function comparisonResourceLabel(
  row: ComparisonAssignmentRow
): string {
  if (row.resource_name !== null) {
    return row.resource_provider !== null
      ? `${row.resource_provider} · ${row.resource_name}`
      : row.resource_name;
  }

  return row.resource_source === "registry"
    ? `Registry model ${row.registry_model_id}`
    : `Registered resource ${row.ai_resource_id}`;
}

function planCostTotals(report: PlanProductivityReport): {
  unknown: boolean;
  ranges: { currency: string; min: number; max: number }[];
} {
  const byCurrency = new Map<
    string,
    { min: number; max: number }
  >();

  for (const task of report.tasks) {
    const assignment = task.planned.assignment;
    const selectedOption = task.planned.selectedOption;

    const min =
      assignment !== null
        ? assignment.plannedCostMicros.min
        : selectedOption !== null
          ? selectedOption.estimatedCostMicros.min
          : null;
    const max =
      assignment !== null
        ? assignment.plannedCostMicros.max
        : selectedOption !== null
          ? selectedOption.estimatedCostMicros.max
          : null;
    const currency =
      assignment !== null
        ? assignment.plannedCostCurrency
        : selectedOption !== null
          ? selectedOption.estimatedCostCurrency
          : null;

    if (
      min === null ||
      max === null ||
      currency === null
    ) {
      return { unknown: true, ranges: [] };
    }

    const current = byCurrency.get(currency) ?? {
      min: 0,
      max: 0,
    };

    current.min += min;
    current.max += max;
    byCurrency.set(currency, current);
  }

  return {
    unknown: false,
    ranges: [...byCurrency.entries()]
      .sort(([left], [right]) =>
        left.localeCompare(right)
      )
      .map(([currency, range]) => ({
        currency,
        min: range.min,
        max: range.max,
      })),
  };
}

function planTimeTotals(report: PlanProductivityReport): {
  unknown: boolean;
  min: number;
  max: number;
} {
  let min = 0;
  let max = 0;

  for (const task of report.tasks) {
    const assignment = task.planned.assignment;
    const selectedOption = task.planned.selectedOption;

    const range =
      assignment !== null
        ? assignment.plannedTimeMinutes
        : selectedOption !== null
          ? selectedOption.estimatedTimeMinutes
          : null;

    if (
      range === null ||
      range.min === null ||
      range.max === null
    ) {
      return { unknown: true, min: 0, max: 0 };
    }

    min += range.min;
    max += range.max;
  }

  return { unknown: false, min, max };
}

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

  const [generatingCombinations, setGeneratingCombinations] =
    useState(false);
  const [combinationError, setCombinationError] = useState<
    string | null
  >(null);

  const [compareRequested, setCompareRequested] =
    useState(false);
  const [comparisonReloadKey, setComparisonReloadKey] =
    useState(0);
  const [comparison, setComparison] = useState<
    Record<string, ComparisonEntry> | null
  >(null);
  const [comparisonLoading, setComparisonLoading] =
    useState(false);
  const [comparisonError, setComparisonError] = useState<
    string | null
  >(null);
  const [showHistorical, setShowHistorical] = useState(false);
  const [expandedPlanId, setExpandedPlanId] = useState<
    string | null
  >(null);
  const [selectedOptionNames, setSelectedOptionNames] =
    useState<Record<string, string | null>>({});
  const [optionNamesLoading, setOptionNamesLoading] =
    useState(false);

  const strategy =
    strategyChoice ??
    (STRATEGIES.includes(
      project?.preference as (typeof STRATEGIES)[number]
    )
      ? project?.preference
      : "balanced");

  const manualPlans = plans.filter(
    (plan) => !isCombinationPlan(plan)
  );
  const combinationPlans = plans.filter(
    (plan) => isCombinationPlan(plan)
  );

  const comparisonPlans = orderedComparisonPlans(
    showHistorical
      ? plans
      : latestVersionPerStrategy(plans)
  );

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

  function planVersionRow(plan: ProjectPlanRow) {
    return (
      <div
        key={plan.id}
        style={{
          display: "flex",
          justifyContent: "space-between",
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
            textAlign: "right",
          }}
        >
          {PLAN_STRATEGY_LABELS[plan.strategy] ??
            plan.strategy}{" "}
          · {formatDate(plan.created_at)}
          {plan.pricing_basis_at
            ? ` · basis ${formatDate(
                plan.pricing_basis_at
              )}`
            : ""}
        </span>
      </div>
    );
  }

  /*
   * Generates the combination plans of the project. There is no body
   * and no client input: the pricing instant, the versions and the
   * strategies are all decided server-side. On success the plan list is
   * reloaded so the new versions appear in their own group.
   */
  async function handleGenerateCombinations() {
    if (generatingCombinations) {
      return;
    }

    setGeneratingCombinations(true);
    setCombinationError(null);

    try {
      const response = await fetch(
        `/api/planner/projects/${projectId}/combinations`,
        {
          method: "POST",
        }
      );

      const data = await response
        .json()
        .catch(() => null);

      if (
        !response.ok ||
        !data?.ok ||
        !data?.generation
      ) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : `Failed to generate combination plans (${response.status})`
        );
      }

      setReloadKey((key) => key + 1);
    } catch (cause) {
      setCombinationError(
        cause instanceof Error
          ? cause.message
          : "Failed to generate combination plans"
      );
    } finally {
      setGeneratingCombinations(false);
    }
  }

  useEffect(() => {
    if (!compareRequested || missingId) {
      return;
    }

    let cancelled = false;
    const targets = showHistorical
      ? plans
      : latestVersionPerStrategy(plans);

    Promise.all(
      targets.map(async (plan) => {
        const [reportResult, assignmentsResult] =
          await Promise.all([
            readComparisonJson<ComparisonReportResponse>(
              fetch(
                `/api/planner/plans/${plan.id}/productivity`,
                { cache: "no-store" }
              )
            ),
            readComparisonJson<ComparisonAssignmentsResponse>(
              fetch(
                `/api/planner/plans/${plan.id}/assignments`,
                { cache: "no-store" }
              )
            ),
          ]);

        if (
          !reportResult.response.ok ||
          !reportResult.data?.ok ||
          !reportResult.data.plan ||
          !Array.isArray(reportResult.data.tasks)
        ) {
          throw new Error(
            typeof reportResult.data?.error === "string"
              ? reportResult.data.error
              : `Failed to load plan v${plan.version} (${reportResult.response.status})`
          );
        }

        if (
          !assignmentsResult.response.ok ||
          !assignmentsResult.data?.ok ||
          !Array.isArray(assignmentsResult.data.items)
        ) {
          throw new Error(
            typeof assignmentsResult.data?.error ===
              "string"
              ? assignmentsResult.data.error
              : `Failed to load plan v${plan.version} assignments (${assignmentsResult.response.status})`
          );
        }

        return [
          plan.id,
          {
            report: reportResult.data,
            assignments: assignmentsResult.data.items,
          },
        ] as const;
      })
    )
      .then((entries) => {
        if (cancelled) {
          return;
        }

        setComparison(Object.fromEntries(entries));
        setSelectedOptionNames({});
        setExpandedPlanId(null);
        setComparisonError(null);
      })
      .catch((cause) => {
        if (cancelled) {
          return;
        }

        setComparisonError(
          cause instanceof Error
            ? cause.message
            : "Failed to load plan comparison"
        );
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        setComparisonLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    compareRequested,
    missingId,
    plans,
    showHistorical,
    comparisonReloadKey,
  ]);

  function handleCompare() {
    setComparisonLoading(true);
    setComparisonError(null);

    if (compareRequested) {
      setComparisonReloadKey((key) => key + 1);
    } else {
      setCompareRequested(true);
    }
  }

  function loadSelectedOptionNames(
    planId: string,
    report: PlanProductivityReport
  ) {
    const missing = report.tasks.filter(
      (task) =>
        task.planned.selectedOption !== null &&
        !(`${planId}:${task.projectTaskId}` in
          selectedOptionNames)
    );

    if (missing.length === 0) {
      return;
    }

    setOptionNamesLoading(true);

    Promise.all(
      missing.map(async (task) => {
        try {
          const response = await fetch(
            `/api/planner/tasks/${task.projectTaskId}/ai-options`,
            { cache: "no-store" }
          );
          const data = await response
            .json()
            .catch(() => null);

          if (
            !response.ok ||
            !data?.ok ||
            !Array.isArray(data.items)
          ) {
            return [task.projectTaskId, null] as const;
          }

          const selected = data.items.find(
            (item: { is_selected?: number }) =>
              item.is_selected === 1
          );
          const name =
            selected &&
            typeof selected.display_name === "string" &&
            selected.display_name !== ""
              ? selected.display_name
              : null;

          return [task.projectTaskId, name] as const;
        } catch {
          return [task.projectTaskId, null] as const;
        }
      })
    ).then((entries) => {
      setSelectedOptionNames((previous) => {
        const next = { ...previous };

        for (const [taskId, name] of entries) {
          next[`${planId}:${taskId}`] = name;
        }

        return next;
      });
      setOptionNamesLoading(false);
    });
  }

  function toggleComparisonRow(
    plan: ProjectPlanRow,
    entry: ComparisonEntry
  ) {
    if (expandedPlanId === plan.id) {
      setExpandedPlanId(null);

      return;
    }

    setExpandedPlanId(plan.id);

    if (!isCombinationPlan(plan)) {
      loadSelectedOptionNames(plan.id, entry.report);
    }
  }

  function taskResourceLabel(
    plan: ProjectPlanRow,
    task: TaskProductivityRow,
    assignments: ComparisonAssignmentRow[]
  ): string {
    if (isCombinationPlan(plan)) {
      const row = assignments.find(
        (item) =>
          item.project_task_id === task.projectTaskId
      );

      return row === undefined
        ? "—"
        : comparisonResourceLabel(row);
    }

    if (task.planned.selectedOption === null) {
      return "—";
    }

    const key = `${plan.id}:${task.projectTaskId}`;

    if (!(key in selectedOptionNames)) {
      return optionNamesLoading ? "…" : "—";
    }

    return selectedOptionNames[key] ?? "—";
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

          <ProjectStages projectId={projectId} />

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
                margin: "0 0 8px",
              }}
            >
              Combination plans
            </h2>

            <p
              style={{
                margin: "0 0 14px",
                color: "#666",
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              Generates one plan per combination strategy from the
              project&apos;s latest plan that owns tasks, priced at one
              shared instant. Every plan is presented as facts; nothing
              is selected or recommended.
            </p>

            {combinationError ? (
              <p
                role="alert"
                style={{
                  margin: "0 0 14px",
                  color: "#b42318",
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                {combinationError}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() =>
                void handleGenerateCombinations()
              }
              disabled={generatingCombinations}
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                border: 0,
                background: "#172033",
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                cursor: generatingCombinations
                  ? "default"
                  : "pointer",
                opacity: generatingCombinations
                  ? 0.6
                  : 1,
              }}
            >
              {generatingCombinations
                ? "Generating…"
                : combinationError
                  ? "Retry"
                  : "Generate combination plans"}
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
                  gap: 18,
                }}
              >
                {manualPlans.length > 0 ? (
                  <div>
                    <h3
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        margin: "0 0 8px",
                      }}
                    >
                      Manual plans
                    </h3>

                    <div
                      style={{
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      {manualPlans.map(planVersionRow)}
                    </div>
                  </div>
                ) : null}

                {combinationPlans.length > 0 ? (
                  <div>
                    <h3
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        margin: "0 0 8px",
                      }}
                    >
                      Combination plans
                    </h3>

                    <p
                      style={{
                        margin: "0 0 8px",
                        color: "#666",
                        fontSize: 13,
                        lineHeight: 1.5,
                      }}
                    >
                      Generated viewpoints, priced at one shared
                      instant. Nothing here is selected or
                      recommended.
                    </p>

                    <div
                      style={{
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      {combinationPlans.map(planVersionRow)}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div
            id="compare"
            style={{
              ...cardStyle,
              marginTop: 18,
            }}
          >
            <h2
              style={{
                fontSize: 16,
                margin: "0 0 8px",
              }}
            >
              Compare plans
            </h2>

            <p
              style={{
                margin: "0 0 14px",
                color: "#666",
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              Side-by-side facts from the plan versions:
              tasks, AI resources, estimated time and
              planned cost. Nothing is ranked, scored or
              recommended, and no currency is ever
              converted.
            </p>

            {plans.length === 0 ? (
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
              <>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 14,
                    alignItems: "center",
                    marginBottom: 14,
                  }}
                >
                  <button
                    type="button"
                    onClick={handleCompare}
                    disabled={comparisonLoading}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 8,
                      border: 0,
                      background: "#172033",
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: comparisonLoading
                        ? "default"
                        : "pointer",
                      opacity: comparisonLoading
                        ? 0.6
                        : 1,
                    }}
                  >
                    {comparisonLoading
                      ? "Loading comparison…"
                      : comparisonError
                        ? "Retry"
                        : compareRequested
                          ? "Refresh comparison"
                          : "Compare plans"}
                  </button>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      fontSize: 13,
                      color: "#444",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={showHistorical}
                      disabled={comparisonLoading}
                      onChange={(event) => {
                        setShowHistorical(
                          event.target.checked
                        );

                        if (compareRequested) {
                          setComparisonLoading(true);
                          setExpandedPlanId(null);
                        }
                      }}
                    />
                    Show historical versions
                  </label>
                </div>

                {comparisonError ? (
                  <p
                    role="alert"
                    style={{
                      margin: "0 0 12px",
                      color: "#b42318",
                      fontSize: 14,
                      lineHeight: 1.5,
                    }}
                  >
                    {comparisonError}
                  </p>
                ) : null}

                {compareRequested &&
                comparison !== null &&
                comparisonError === null &&
                !comparisonLoading ? (
                  comparisonPlans.length === 0 ? (
                    <p
                      style={{
                        margin: 0,
                        color: "#666",
                        fontSize: 14,
                        lineHeight: 1.5,
                      }}
                    >
                      Nothing to compare yet.
                    </p>
                  ) : (
                    <>
                      <div
                        style={{
                          overflowX: "auto",
                        }}
                      >
                        <table
                          style={{
                            width: "100%",
                            minWidth: 680,
                            borderCollapse: "collapse",
                            fontSize: 14,
                          }}
                        >
                          <thead>
                            <tr>
                              <th
                                style={
                                  tableHeaderCellStyle
                                }
                              >
                                Plan
                              </th>
                              <th
                                style={
                                  tableHeaderCellStyle
                                }
                              >
                                Tasks
                              </th>
                              <th
                                style={
                                  tableHeaderCellStyle
                                }
                              >
                                AI resources
                              </th>
                              <th
                                style={
                                  tableHeaderCellStyle
                                }
                              >
                                Estimated time
                              </th>
                              <th
                                style={
                                  tableHeaderCellStyle
                                }
                              >
                                Planned cost
                              </th>
                              <th
                                style={
                                  tableHeaderCellStyle
                                }
                              >
                                Efficiency
                              </th>
                            </tr>
                          </thead>

                          <tbody>
                            {comparisonPlans.map(
                              (plan) => {
                                const entry =
                                  comparison[plan.id];

                                if (!entry) {
                                  return null;
                                }

                                const cost =
                                  planCostTotals(
                                    entry.report
                                  );
                                const time =
                                  planTimeTotals(
                                    entry.report
                                  );
                                const taskCount =
                                  entry.report.summary
                                    .taskCount;
                                const isExpanded =
                                  expandedPlanId ===
                                  plan.id;
                                const resourceLabels = [
                                  ...new Set(
                                    entry.assignments.map(
                                      comparisonResourceLabel
                                    )
                                  ),
                                ];

                                return (
                                  <Fragment
                                    key={plan.id}
                                  >
                                    <tr
                                      onClick={() =>
                                        toggleComparisonRow(
                                          plan,
                                          entry
                                        )
                                      }
                                      style={{
                                        cursor:
                                          "pointer",
                                      }}
                                    >
                                      <td
                                        style={
                                          tableCellStyle
                                        }
                                      >
                                        <Link
                                          href={`/planner/${projectId}/plans/${plan.id}`}
                                          onClick={(
                                            event
                                          ) =>
                                            event.stopPropagation()
                                          }
                                          style={{
                                            color:
                                              "#111",
                                            fontWeight: 600,
                                            textDecoration:
                                              "none",
                                          }}
                                        >
                                          v
                                          {
                                            plan.version
                                          }
                                        </Link>

                                        <div
                                          style={{
                                            fontSize: 12,
                                            color: "#666",
                                            marginTop: 3,
                                          }}
                                        >
                                          {PLAN_STRATEGY_LABELS[
                                            plan
                                              .strategy
                                          ] ??
                                            plan.strategy}
                                          {" · "}
                                          {formatDate(
                                            plan.created_at
                                          )}
                                        </div>
                                      </td>

                                      <td
                                        style={
                                          tableCellStyle
                                        }
                                      >
                                        {taskCount}
                                      </td>

                                      <td
                                        style={
                                          tableCellStyle
                                        }
                                      >
                                        {resourceLabels.length >
                                        0
                                          ? resourceLabels.join(
                                              ", "
                                            )
                                          : "—"}
                                      </td>

                                      <td
                                        style={
                                          tableCellStyle
                                        }
                                      >
                                        {taskCount ===
                                        0
                                          ? "—"
                                          : time.unknown
                                            ? "Unknown"
                                            : `${time.min} – ${time.max} min`}
                                      </td>

                                      <td
                                        style={
                                          tableCellStyle
                                        }
                                      >
                                        {taskCount ===
                                        0 ? (
                                          "—"
                                        ) : cost.unknown ? (
                                          "Unknown"
                                        ) : (
                                          <div
                                            style={{
                                              display:
                                                "grid",
                                              gap: 3,
                                            }}
                                          >
                                            {cost.ranges.map(
                                              (
                                                range
                                              ) => (
                                                <span
                                                  key={
                                                    range.currency
                                                  }
                                                >
                                                  {`${range.currency}: ${formatMicros(range.min)} – ${formatMicros(range.max)}`}
                                                </span>
                                              )
                                            )}
                                          </div>
                                        )}
                                      </td>

                                      <td
                                        style={
                                          tableCellStyle
                                        }
                                      >
                                        —
                                      </td>
                                    </tr>

                                    {isExpanded ? (
                                      <tr>
                                        <td
                                          colSpan={6}
                                          style={{
                                            ...tableCellStyle,
                                            background:
                                              "#fafbfc",
                                          }}
                                        >
                                          <div
                                            style={{
                                              display:
                                                "grid",
                                              gap: 8,
                                            }}
                                          >
                                            {entry.report.tasks.map(
                                              (
                                                task
                                              ) => {
                                                const assignment =
                                                  task
                                                    .planned
                                                    .assignment;
                                                const selectedOption =
                                                  task
                                                    .planned
                                                    .selectedOption;

                                                const costText =
                                                  assignment !==
                                                  null
                                                    ? costRangeText(
                                                        assignment.plannedCostMicros.min,
                                                        assignment.plannedCostMicros.max,
                                                        assignment.plannedCostCurrency
                                                      )
                                                    : selectedOption !==
                                                        null
                                                      ? costRangeText(
                                                          selectedOption.estimatedCostMicros.min,
                                                          selectedOption.estimatedCostMicros.max,
                                                          selectedOption.estimatedCostCurrency
                                                        )
                                                      : "Unknown";

                                                const timeText =
                                                  assignment !==
                                                  null
                                                    ? minutesRangeText(
                                                        assignment.plannedTimeMinutes.min,
                                                        assignment.plannedTimeMinutes.max
                                                      )
                                                    : selectedOption !==
                                                        null
                                                      ? minutesRangeText(
                                                          selectedOption.estimatedTimeMinutes.min,
                                                          selectedOption.estimatedTimeMinutes.max
                                                        )
                                                      : "Unknown";

                                                return (
                                                  <div
                                                    key={
                                                      task.projectTaskId
                                                    }
                                                    style={{
                                                      display:
                                                        "flex",
                                                      flexWrap:
                                                        "wrap",
                                                      gap: 12,
                                                      fontSize: 13,
                                                      color:
                                                        "#333",
                                                    }}
                                                  >
                                                    <span
                                                      style={{
                                                        fontWeight: 600,
                                                      }}
                                                    >
                                                      {
                                                        task.sequence
                                                      }
                                                      .{" "}
                                                      {
                                                        task.name
                                                      }
                                                    </span>

                                                    <span
                                                      style={{
                                                        color:
                                                          "#666",
                                                      }}
                                                    >
                                                      AI:{" "}
                                                      {taskResourceLabel(
                                                        plan,
                                                        task,
                                                        entry.assignments
                                                      )}
                                                    </span>

                                                    <span
                                                      style={{
                                                        color:
                                                          "#666",
                                                      }}
                                                    >
                                                      Cost:{" "}
                                                      {costText}
                                                    </span>

                                                    <span
                                                      style={{
                                                        color:
                                                          "#666",
                                                      }}
                                                    >
                                                      Time:{" "}
                                                      {timeText}
                                                    </span>
                                                  </div>
                                                );
                                              }
                                            )}

                                            {isCombinationPlan(
                                              plan
                                            ) ? null : (
                                              <p
                                                style={{
                                                  margin: 0,
                                                  fontSize: 12,
                                                  color:
                                                    "#666",
                                                  lineHeight: 1.5,
                                                }}
                                              >
                                                AI names
                                                come
                                                from
                                                each
                                                step&apos;s
                                                selected
                                                option;
                                                “—”
                                                means no
                                                selected
                                                option
                                                exists
                                                for that
                                                step.
                                              </p>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    ) : null}
                                  </Fragment>
                                );
                              }
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div
                        style={{
                          marginTop: 12,
                          display: "grid",
                          gap: 6,
                          fontSize: 12,
                          color: "#666",
                          lineHeight: 1.6,
                        }}
                      >
                        <span>
                          Planned cost is an estimate,
                          not actual spend. Costs are
                          summed per currency and never
                          converted. “Unknown” means at
                          least one task in the plan has
                          no price.
                        </span>

                        <span>
                          Estimated time is a task-level
                          estimate; the current
                          estimator does not
                          distinguish model speed, so
                          time does not compare AI
                          models.
                        </span>

                        <span>
                          Efficiency shows “—”: there is
                          no reliable efficiency data
                          yet (cost/task, time/task,
                          completion rate).
                        </span>

                        <span>
                          Facts only — no
                          recommendation, no ranking,
                          no automatic selection.
                        </span>
                      </div>
                    </>
                  )
                ) : compareRequested &&
                  comparisonLoading ? (
                  <p
                    style={{
                      margin: 0,
                      color: "#666",
                      fontSize: 14,
                      lineHeight: 1.5,
                    }}
                  >
                    Loading comparison…
                  </p>
                ) : null}
              </>
            )}
          </div>
        </>
      ) : null}
    </main>
  );
}
