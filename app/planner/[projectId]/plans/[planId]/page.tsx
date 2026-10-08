"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useEffect,
  useState,
} from "react";

import TaskAiOptions from "@/components/planner/task-ai-options";
import PlanProductivity from "@/components/planner/plan-productivity";
import type { PlanProductivityReport } from "@/components/planner/plan-productivity";

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
  stage_id: string | null;
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
 * One stage of the project as GET
 * /api/planner/projects/[id]/stages returns it, in sequence order
 * with both active and archived rows. The plan page only reads the
 * id, the name and the status: archived stages stay in the
 * dropdowns so a historical grouping remains visible and editable,
 * with the status shown as a suffix on the label.
 */
type ProjectStageRow = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  sequence: number;
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
  resource_name: string | null;
  resource_provider: string | null;
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

/*
 * The display label of an assignment's resource. The API's resolved
 * name wins when it has one - a registered resource by its
 * ai_resources name, a registry model by "provider - model" - and the
 * stored id is the fallback when it does not, because a name the API
 * never sent would be an invented fact.
 */
function assignmentResourceLabel(
  assignment: PlanResourceAssignmentRow
): string {
  if (assignment.resource_name !== null) {
    return assignment.resource_provider !== null
      ? `${assignment.resource_provider} · ${assignment.resource_name}`
      : assignment.resource_name;
  }

  return assignment.resource_source === "registry"
    ? `Registry model ${assignment.registry_model_id}`
    : `Registered resource ${assignment.ai_resource_id}`;
}

/*
 * The display label of a task's grouping. A task without a stage is
 * "No stage"; a task pointing at a stage that is not in the loaded
 * list (for example because the stages request failed) says so
 * instead of silently rendering nothing.
 */
function stageLabel(
  stages: ProjectStageRow[],
  stageId: string | null
): string {
  if (stageId === null) {
    return "No stage";
  }

  return (
    stages.find((stage) => stage.id === stageId)?.name ??
    "Unknown stage"
  );
}

/*
 * One display group: a stage of this project, or the "No stage"
 * bucket when stage_id is null. key is the stage id (or "none"),
 * label comes from stageLabel so it always matches the badge shown
 * on each card.
 */
type TaskStageGroup = {
  key: string;
  label: string;
  tasks: ProjectTaskRow[];
};

/*
 * Groups the plan's steps for display (M2-C). Pure derivation from
 * the two arrays: one pass over tasks, so every group keeps the
 * original task order and the groups themselves appear in the order
 * their first member appears in the list - nothing is re-sorted and
 * no stage is ever dropped, even when a stage_id is not in the
 * loaded stages array (stageLabel renders that case as
 * "Unknown stage").
 */
function groupTasksByStage(
  tasks: ProjectTaskRow[],
  stages: ProjectStageRow[]
): TaskStageGroup[] {
  const groups: TaskStageGroup[] = [];
  const byKey = new Map<string, TaskStageGroup>();

  for (const task of tasks) {
    const key = task.stage_id ?? "none";
    let group = byKey.get(key);

    if (!group) {
      group = {
        key,
        label: stageLabel(stages, task.stage_id),
        tasks: [],
      };

      byKey.set(key, group);
      groups.push(group);
    }

    group.tasks.push(task);
  }

  return groups;
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
  const [stages, setStages] = useState<ProjectStageRow[]>([]);
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
  const [productivity, setProductivity] =
    useState<PlanProductivityReport | null>(null);
  const [productivityError, setProductivityError] = useState<
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
   * M2-B stage binding state. createStageId is the create form's
   * dropdown, "" meaning No stage. The other two maps are per-task
   * edit state: a row is locked while its PATCH is in flight, and a
   * rejected change keeps its server message under that row so the
   * select (still controlled by the stored task.stage_id) snaps back
   * to what is actually persisted.
   */
  const [createStageId, setCreateStageId] = useState("");
  const [pendingStageTaskIds, setPendingStageTaskIds] =
    useState<Record<string, boolean>>({});
  const [stageEditErrors, setStageEditErrors] = useState<
    Record<string, string>
  >({});

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
      fetch(`/api/planner/projects/${projectId}/stages`, {
        cache: "no-store",
      }).then(readJson),
      fetch(`/api/planner/plans/${planId}/tasks`, {
        cache: "no-store",
      }).then(readJson),
      fetch(`/api/planner/plans/${planId}/assignments`, {
        cache: "no-store",
      }).then(readJson),
      /*
       * The productivity report is display-only context. A network
       * failure rejects before readJson ever sees a body, so this
       * one carries its own catch: it degrades to null and the
       * handler below turns that into an inline error with its own
       * Retry instead of failing the whole plan detail.
       */
      fetch(`/api/planner/plans/${planId}/productivity`, {
        cache: "no-store",
      })
        .then(readJson)
        .catch(() => null),
    ])
      .then(
        ([
          planResult,
          projectResult,
          stagesResult,
          tasksResult,
          assignmentsResult,
          productivityResult,
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

          /*
           * The stage list only feeds the two dropdowns, so a failed
           * stages request is not fatal to the page: the selects fall
           * back to "No stage" alone and everything else still loads.
           */
          if (
            stagesResult.response.ok &&
            stagesResult.data?.ok &&
            Array.isArray(stagesResult.data.items)
          ) {
            setStages(
              stagesResult.data
                .items as ProjectStageRow[]
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

          /*
           * Productivity is never fatal to the page: any failure
           * (including the null from the fetch-level catch above)
           * becomes an inline error with its own Retry, exactly
           * like the assignments section above.
           */
          if (
            productivityResult === null ||
            !productivityResult.response.ok ||
            !productivityResult.data?.ok
          ) {
            setProductivity(null);
            setProductivityError(
              productivityResult !== null &&
                typeof productivityResult.data?.error ===
                  "string"
                ? productivityResult.data.error
                : "Could not load productivity"
            );
          } else {
            const payload =
              productivityResult.data as unknown as {
                ok: true;
              } & PlanProductivityReport;

            setProductivity({
              plan: payload.plan,
              tasks: payload.tasks,
              summary: payload.summary,
              context: payload.context,
            });
            setProductivityError(null);
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
    setCreateStageId("");
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
   * than sent as an empty string. The one exception is stageId: it
   * is always present, "" of the dropdown becoming an explicit null
   * so "No stage" is a deliberate ungrouped value rather than an
   * absent key. The task id, the sequence, the status and both
   * timestamps are server-owned: sequence is one more than the plan's
   * highest, and status starts as planned.
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
      stageId: createStageId === "" ? null : createStageId,
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

  /*
   * M2-B: one dropdown per planned step calls the existing PATCH
   * endpoint with stageId as its only field. "" is No stage and is
   * sent as an explicit null to unbind; a string re-groups the step
   * under a stage of this project, and the service refuses a stage
   * of another project (STAGE_PROJECT_MISMATCH) or a missing one
   * (STAGE_NOT_FOUND), whose message lands in stageEditErrors for
   * that row. The select stays controlled by the stored
   * task.stage_id, so a rejected change snaps back to what is really
   * persisted instead of showing a value the server never took.
   */
  async function handleStageChange(
    taskId: string,
    nextStageId: string
  ) {
    if (pendingStageTaskIds[taskId]) {
      return;
    }

    setPendingStageTaskIds((current) => ({
      ...current,
      [taskId]: true,
    }));
    setStageEditErrors((current) => {
      const next = { ...current };

      delete next[taskId];

      return next;
    });

    try {
      const response = await fetch(
        `/api/planner/tasks/${taskId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            stageId:
              nextStageId === "" ? null : nextStageId,
          }),
        }
      );

      const data = await response
        .json()
        .catch(() => null);

      if (!response.ok || !data?.ok || !data?.task) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : `Failed to update stage (${response.status})`
        );
      }

      const updated = data.task as ProjectTaskRow;

      setTasks((current) =>
        current.map((task) =>
          task.id === taskId ? updated : task
        )
      );
    } catch (cause) {
      setStageEditErrors((current) => ({
        ...current,
        [taskId]:
          cause instanceof Error
            ? cause.message
            : "Failed to update stage",
      }));
    } finally {
      setPendingStageTaskIds((current) => ({
        ...current,
        [taskId]: false,
      }));
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
          href={
            projectId
              ? `/planner/${projectId}#compare`
              : "/planner"
          }
          style={{
            color: "#555",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Compare plans →
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
                    htmlFor="taskStage"
                    style={labelStyle}
                  >
                    Stage (optional)
                  </label>

                  <select
                    id="taskStage"
                    value={createStageId}
                    onChange={(event) =>
                      setCreateStageId(event.target.value)
                    }
                    style={inputStyle}
                  >
                    <option value="">No stage</option>
                    {stages.map((stage) => (
                      <option
                        key={stage.id}
                        value={stage.id}
                      >
                        {stage.status === "archived"
                          ? `${stage.name} (Archived)`
                          : stage.name}
                      </option>
                    ))}
                  </select>

                  {stages.length === 0 ? (
                    <p style={hintStyle}>
                      This project has no stages yet.
                      Create one on the project page to
                      group steps.
                    </p>
                  ) : null}
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
                {groupTasksByStage(tasks, stages).map((group) => (
                  <div
                    key={group.key}
                    style={{
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 8,
                        paddingTop: 10,
                        borderTop: "1px solid #f0f1f4",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#444",
                        }}
                      >
                        {group.label}
                      </span>

                      <span
                        style={{
                          fontSize: 12,
                          color: "#999",
                        }}
                      >
                        {group.tasks.length}{" "}
                        {group.tasks.length === 1
                          ? "task"
                          : "tasks"}
                      </span>
                    </div>

                    {group.tasks.map((task) => (
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

                          <Badge
                            text={stageLabel(
                              stages,
                              task.stage_id
                            )}
                            color="#0e7a5f"
                          />
                        </div>

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginTop: 8,
                          }}
                        >
                          <label
                            htmlFor={`taskStage-${task.id}`}
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#666",
                            }}
                          >
                            Stage
                          </label>

                          <select
                            id={`taskStage-${task.id}`}
                            value={task.stage_id ?? ""}
                            disabled={
                              pendingStageTaskIds[task.id] ===
                              true
                            }
                            onChange={(event) =>
                              handleStageChange(
                                task.id,
                                event.target.value
                              )
                            }
                            style={{
                              ...inputStyle,
                              width: "auto",
                              minWidth: 150,
                              padding: "5px 8px",
                              fontSize: 13,
                            }}
                          >
                            <option value="">No stage</option>
                            {stages.map((stage) => (
                              <option
                                key={stage.id}
                                value={stage.id}
                              >
                                {stage.status === "archived"
                                  ? `${stage.name} (Archived)`
                                  : stage.name}
                              </option>
                            ))}
                          </select>

                          {pendingStageTaskIds[task.id] ? (
                            <span
                              style={{
                                color: "#666",
                                fontSize: 12,
                              }}
                            >
                              Saving…
                            </span>
                          ) : null}
                        </div>

                        {stageEditErrors[task.id] ? (
                          <p
                            role="alert"
                            style={{
                              margin: "6px 0 0",
                              color: "#b42318",
                              fontSize: 12,
                              lineHeight: 1.5,
                            }}
                          >
                            {stageEditErrors[task.id]}
                          </p>
                        ) : null}

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
                            planStrategy={
                              plan.strategy
                            }
                            expanded={
                              expandedTaskIds[task.id] ===
                              true
                            }
                          />
                        ) : null}
                      </div>
                    ))}
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
                    assignmentResourceLabel(
                      assignment
                    );

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

          <div style={cardStyle}>
            <PlanProductivity
              report={productivity}
              error={productivityError}
              onRetry={() =>
                setReloadKey((key) => key + 1)
              }
            />
          </div>
        </>
      ) : null}
    </main>
  );
}
