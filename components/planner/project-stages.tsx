"use client";

import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

/*
 * Project Stage management block (M1-E,
 * PLANNER_STAGE_AND_TASK_MODEL_DESIGN.md).
 *
 * Stages belong to the project, not to a plan, which is why this
 * component takes only a projectId and hangs on the project detail
 * page. It talks to the three stage routes and nothing else:
 *
 *   GET    /api/planner/projects/[id]/stages
 *   POST   /api/planner/projects/[id]/stages
 *   PATCH  /api/planner/stages/[id]
 *   POST   /api/planner/stages/[id]/archive
 *   DELETE /api/planner/stages/[id]
 *
 * The two service-refused outcomes get their own copy:
 * STAGE_HAS_TASKS means the stage still has planned steps pointing
 * at it, so it can only be archived; STAGE_NOT_FOUND means the row
 * is already gone. Sequence is server-assigned and not editable
 * here, status is not edited either - archiving is its own button.
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

type ErrorPayload = {
  code?: string;
  error?: string;
};

const cardStyle = {
  background: "#fff",
  border: "1px solid #e7ebf0",
  borderRadius: 12,
  padding: 22,
  marginBottom: 18,
};

const inputStyle = {
  padding: "9px 11px",
  borderRadius: 8,
  border: "1px solid #ddd",
  background: "#fff",
  fontSize: 14,
};

const primaryButtonStyle = {
  padding: "10px 16px",
  borderRadius: 8,
  border: 0,
  background: "#172033",
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid #ddd",
  background: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const mutedStyle = {
  margin: "0 0 12px",
  color: "#666",
  fontSize: 14,
  lineHeight: 1.5,
};

const errorStyle = {
  margin: "0 0 12px",
  color: "#b42318",
  fontSize: 14,
  lineHeight: 1.5,
};

/*
 * Turns the shared { error, code } body into the text the user
 * sees. The two stage-specific codes are answered in Chinese as
 * specified for M1-E; everything else falls back to the API's own
 * message and then to a generic one.
 */
function messageFromPayload(
  data: ErrorPayload | null,
  fallback: string
): string {
  if (data?.code === "STAGE_HAS_TASKS") {
    return "该阶段仍被任务引用，请使用归档。";
  }

  if (data?.code === "STAGE_NOT_FOUND") {
    return "阶段不存在。";
  }

  if (
    typeof data?.error === "string" &&
    data.error.length > 0
  ) {
    return data.error;
  }

  return fallback;
}

export default function ProjectStages({
  projectId,
}: {
  projectId: string;
}) {
  const [stages, setStages] = useState<ProjectStageRow[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(
    null
  );
  const [reloadKey, setReloadKey] = useState(0);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<
    string | null
  >(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(
    null
  );

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<
    string | null
  >(null);

  useEffect(() => {
    let cancelled = false;

    fetch(
      `/api/planner/projects/${projectId}/stages`,
      { cache: "no-store" }
    )
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

        setLoading(false);

        if (!response.ok || !data?.ok) {
          setLoadError(
            messageFromPayload(
              data,
              `Failed to load stages (${response.status})`
            )
          );

          return;
        }

        setLoadError(null);
        setStages(
          Array.isArray(data.items) ? data.items : []
        );
      })
      .catch((cause) => {
        if (cancelled) {
          return;
        }

        setLoading(false);
        setLoadError(
          cause instanceof Error
            ? cause.message
            : "Failed to load stages"
        );
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, reloadKey]);

  function reload() {
    setReloadKey((key) => key + 1);
  }

  /*
   * A retry is an event, not the effect itself: the loading flag
   * flips here so the effect only performs the fetch. Mutations call
   * reload() instead, which refreshes the list in the background
   * without hiding it.
   */
  function handleRetry() {
    setLoading(true);
    setLoadError(null);
    setReloadKey((key) => key + 1);
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();

    if (creating) {
      return;
    }

    const trimmed = name.trim();

    if (trimmed === "") {
      setCreateError("Stage name is required.");

      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const response = await fetch(
        `/api/planner/projects/${projectId}/stages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: trimmed,
            ...(description.trim() === ""
              ? {}
              : { description: description.trim() }),
          }),
        }
      );

      const data = await response
        .json()
        .catch(() => null);

      if (!response.ok || !data?.ok) {
        setCreateError(
          messageFromPayload(
            data,
            `Failed to create stage (${response.status})`
          )
        );

        return;
      }

      setName("");
      setDescription("");
      reload();
    } catch (cause) {
      setCreateError(
        cause instanceof Error
          ? cause.message
          : "Failed to create stage"
      );
    } finally {
      setCreating(false);
    }
  }

  function startEdit(stage: ProjectStageRow) {
    setEditId(stage.id);
    setEditName(stage.name);
    setEditDescription(stage.description ?? "");
    setEditError(null);
    setActionError(null);
  }

  async function handleSaveEdit(event: FormEvent) {
    event.preventDefault();

    if (editId === null || savingEdit) {
      return;
    }

    const trimmed = editName.trim();

    if (trimmed === "") {
      setEditError("Stage name is required.");

      return;
    }

    setSavingEdit(true);
    setEditError(null);

    try {
      const response = await fetch(
        `/api/planner/stages/${editId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: trimmed,
            description:
              editDescription.trim() === ""
                ? null
                : editDescription.trim(),
          }),
        }
      );

      const data = await response
        .json()
        .catch(() => null);

      if (!response.ok || !data?.ok) {
        setEditError(
          messageFromPayload(
            data,
            `Failed to update stage (${response.status})`
          )
        );

        return;
      }

      setEditId(null);
      reload();
    } catch (cause) {
      setEditError(
        cause instanceof Error
          ? cause.message
          : "Failed to update stage"
      );
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleArchive(stage: ProjectStageRow) {
    if (busyId !== null) {
      return;
    }

    setBusyId(stage.id);
    setActionError(null);

    try {
      const response = await fetch(
        `/api/planner/stages/${stage.id}/archive`,
        { method: "POST" }
      );

      const data = await response
        .json()
        .catch(() => null);

      if (!response.ok || !data?.ok) {
        setActionError(
          messageFromPayload(
            data,
            `Failed to archive stage (${response.status})`
          )
        );

        return;
      }

      if (editId === stage.id) {
        setEditId(null);
      }

      reload();
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Failed to archive stage"
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(stage: ProjectStageRow) {
    if (busyId !== null) {
      return;
    }

    setBusyId(stage.id);
    setActionError(null);

    try {
      const response = await fetch(
        `/api/planner/stages/${stage.id}`,
        { method: "DELETE" }
      );

      const data = await response
        .json()
        .catch(() => null);

      if (!response.ok || !data?.ok) {
        setActionError(
          messageFromPayload(
            data,
            `Failed to delete stage (${response.status})`
          )
        );

        return;
      }

      if (editId === stage.id) {
        setEditId(null);
      }

      reload();
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Failed to delete stage"
      );
    } finally {
      setBusyId(null);
    }
  }

  function stageRow(stage: ProjectStageRow) {
    if (editId === stage.id) {
      return (
        <form
          key={stage.id}
          onSubmit={(event) => void handleSaveEdit(event)}
          style={{
            display: "grid",
            gap: 10,
            paddingTop: 8,
            borderTop: "1px solid #f0f1f4",
          }}
        >
          <input
            value={editName}
            onChange={(event) =>
              setEditName(event.target.value)
            }
            placeholder="Stage name"
            style={inputStyle}
          />

          <input
            value={editDescription}
            onChange={(event) =>
              setEditDescription(event.target.value)
            }
            placeholder="Description (optional)"
            style={inputStyle}
          />

          {editError ? (
            <p role="alert" style={errorStyle}>
              {editError}
            </p>
          ) : null}

          <div
            style={{
              display: "flex",
              gap: 8,
            }}
          >
            <button
              type="submit"
              disabled={savingEdit}
              style={{
                ...primaryButtonStyle,
                opacity: savingEdit ? 0.6 : 1,
              }}
            >
              {savingEdit ? "Saving…" : "Save"}
            </button>

            <button
              type="button"
              onClick={() => setEditId(null)}
              style={secondaryButtonStyle}
            >
              Cancel
            </button>
          </div>
        </form>
      );
    }

    return (
      <div
        key={stage.id}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          paddingTop: 8,
          borderTop: "1px solid #f0f1f4",
          fontSize: 14,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#666",
              }}
            >
              #{stage.sequence}
            </span>

            <span style={{ fontWeight: 600 }}>
              {stage.name}
            </span>

            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: 999,
                background:
                  stage.status === "active"
                    ? "#ecfdf3"
                    : "#f4f5f7",
                color:
                  stage.status === "active"
                    ? "#067647"
                    : "#666",
              }}
            >
              {stage.status}
            </span>
          </div>

          {stage.description ? (
            <p
              style={{
                margin: "4px 0 0",
                color: "#666",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {stage.description}
            </p>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => startEdit(stage)}
            style={secondaryButtonStyle}
          >
            Edit
          </button>

          <button
            type="button"
            onClick={() => void handleArchive(stage)}
            disabled={busyId !== null}
            style={{
              ...secondaryButtonStyle,
              opacity: busyId !== null ? 0.6 : 1,
            }}
          >
            {busyId === stage.id
              ? "Working…"
              : "Archive"}
          </button>

          <button
            type="button"
            onClick={() => void handleDelete(stage)}
            disabled={busyId !== null}
            style={{
              ...secondaryButtonStyle,
              color: "#b42318",
              opacity: busyId !== null ? 0.6 : 1,
            }}
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <section style={cardStyle}>
      <h2
        style={{
          fontSize: 16,
          margin: "0 0 8px",
        }}
      >
        Stages
      </h2>

      <p style={mutedStyle}>
        The project&apos;s stages in planned order. A
        stage that planned steps still reference can only
        be archived, never deleted.
      </p>

      {loading ? (
        <p style={mutedStyle}>Loading stages…</p>
      ) : loadError ? (
        <div>
          <p role="alert" style={errorStyle}>
            {loadError}
          </p>

          <button
            type="button"
            onClick={handleRetry}
            style={secondaryButtonStyle}
          >
            Retry
          </button>
        </div>
      ) : stages.length === 0 ? (
        <p style={mutedStyle}>No stages yet.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 8,
            marginBottom: 6,
          }}
        >
          {stages.map(stageRow)}
        </div>
      )}

      {actionError ? (
        <p role="alert" style={errorStyle}>
          {actionError}
        </p>
      ) : null}

      <form
        onSubmit={(event) => void handleCreate(event)}
        style={{
          display: "grid",
          gap: 10,
          maxWidth: 360,
          marginTop: 14,
        }}
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Stage name"
          style={inputStyle}
        />

        <input
          value={description}
          onChange={(event) =>
            setDescription(event.target.value)
          }
          placeholder="Description (optional)"
          style={inputStyle}
        />

        {createError ? (
          <p role="alert" style={errorStyle}>
            {createError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={creating}
          style={{
            ...primaryButtonStyle,
            opacity: creating ? 0.6 : 1,
          }}
        >
          {creating ? "Adding…" : "Add stage"}
        </button>
      </form>
    </section>
  );
}
