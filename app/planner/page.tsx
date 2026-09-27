"use client";

import Link from "next/link";
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

const STATUS_COLORS: Record<string, string> = {
  planning: "#5a4ce1",
  active: "#159570",
  completed: "#3976cf",
  abandoned: "#98a2b3",
};

/*
 * Budget amounts are stored in micro-units, so an unset budget is
 * null and never 0. The currency is shown as written by the user
 * and is never converted or assumed.
 */
function formatMicros(micros: number): string {
  const value = micros / 1_000_000;

  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(6)));
}

function formatBudget(project: ProjectRow): string {
  const { budget_min_micros, budget_max_micros, budget_currency } = project;

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

export default function PlannerPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/planner/projects", {
      cache: "no-store",
    })
      .then((response) =>
        response
          .json()
          .catch(() => null)
          .then((data) => ({ response, data }))
      )
      .then(({ response, data }) => {
        if (cancelled) {
          return;
        }

        if (!response.ok || !data?.ok) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : `Failed to load projects (${response.status})`
          );
        }

        setProjects(
          Array.isArray(data.items)
            ? (data.items as ProjectRow[])
            : []
        );
        setLoading(false);
      })
      .catch((cause) => {
        if (cancelled) {
          return;
        }

        setError(
          cause instanceof Error
            ? cause.message
            : "Failed to load projects"
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function handleRetry() {
    setLoading(true);
    setError(null);
    setReloadKey((key) => key + 1);
  }

  return (
    <main
      style={{
        maxWidth: 1100,
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
          href="/"
          style={{
            color: "#555",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          ← Dashboard
        </Link>
      </div>

      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 20,
          marginBottom: 28,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 32,
              margin: 0,
            }}
          >
            AI Project Planner
          </h1>

          <p
            style={{
              margin: "8px 0 0",
              color: "#666",
              fontSize: 15,
            }}
          >
            Plan your AI work before you start.
          </p>
        </div>

        <Link
          href="/planner/new"
          style={{
            padding: "9px 14px",
            borderRadius: 8,
            background: "#172033",
            color: "#fff",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          New Project
        </Link>
      </header>

      {loading ? (
        <p
          style={{
            color: "#666",
            fontSize: 14,
          }}
        >
          Loading projects…
        </p>
      ) : error ? (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e7ebf0",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h2
            style={{
              fontSize: 16,
              margin: "0 0 8px",
            }}
          >
            Could not load projects
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
      ) : projects.length === 0 ? (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e7ebf0",
            borderRadius: 12,
            padding: 32,
            textAlign: "center",
          }}
        >
          <h2
            style={{
              fontSize: 17,
              margin: "0 0 8px",
            }}
          >
            No projects yet
          </h2>

          <p
            style={{
              margin: "0 0 18px",
              color: "#666",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            Create a project to record its goal,
            budget and deadline before any
            AI work is planned.
          </p>

          <Link
            href="/planner/new"
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
            Create your first project
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 12,
          }}
        >
          {projects.map((project) => (
            <div
              key={project.id}
              style={{
                background: "#fff",
                border: "1px solid #e7ebf0",
                borderRadius: 12,
                padding: 18,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 16,
                  marginBottom: 10,
                }}
              >
                <div>
                  <Link
                    href={`/planner/${project.id}`}
                    style={{
                      color: "#111",
                      fontSize: 16,
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    {project.name}
                  </Link>

                  {project.goal ? (
                    <p
                      style={{
                        margin: "6px 0 0",
                        color: "#666",
                        fontSize: 14,
                        lineHeight: 1.5,
                      }}
                    >
                      {project.goal}
                    </p>
                  ) : null}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexShrink: 0,
                  }}
                >
                  <Badge
                    text={
                      STATUS_LABELS[project.status] ??
                      project.status
                    }
                    color={
                      STATUS_COLORS[project.status] ??
                      "#555"
                    }
                  />

                  <Badge
                    text={
                      PREFERENCE_LABELS[
                        project.preference
                      ] ?? project.preference
                    }
                    color="#555"
                  />
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 20,
                  color: "#666",
                  fontSize: 13,
                }}
              >
                <span>
                  Budget: {formatBudget(project)}
                </span>

                <span>
                  Deadline: {formatDeadline(project)}
                </span>

                <span>
                  Created:{" "}
                  {formatDate(project.created_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
