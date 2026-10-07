"use client";

import { useEffect, useState } from "react";

/*
 * Declared AI resources: the ways the user reaches an AI model that
 * this app cannot see for itself - a web subscription, a gateway, an
 * account somewhere else.
 *
 * A declaration is neither a registry model nor a registered resource,
 * and this component never presents it as either. It records what the
 * user states: a name, optional provider and model wording, a channel,
 * an entitlement, whether a price is known, and capability facts that
 * stay unstated until they are stated. It stores no key, opens no
 * connection and produces no price.
 *
 * Every read and write goes through /api/planner/declarations, which
 * validates in the service before it reaches the repository. Nothing
 * here touches the database directly, and archiving is the only way a
 * declaration leaves the active view - it is never deleted, because a
 * stored AI option that points at one must still resolve afterwards.
 */
type DeclaredChannel =
  | "own_api"
  | "gateway"
  | "web_only"
  | "unknown";

type DeclaredEntitlement = "free" | "paid" | "unknown";

type DeclaredPricingState = "known" | "unknown";

type DeclaredStatus = "active" | "archived";

type DeclaredResource = {
  id: string;
  name: string;
  provider_name: string | null;
  model_name: string | null;
  channel: DeclaredChannel;
  entitlement: DeclaredEntitlement;
  pricing_state: DeclaredPricingState;
  supports_tools: number | null;
  supports_vision: number | null;
  supports_reasoning: number | null;
  context_window_tokens: number | null;
  max_output_tokens: number | null;
  status: DeclaredStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const CHANNEL_LABELS: Record<DeclaredChannel, string> = {
  own_api: "Own API key",
  gateway: "Gateway",
  web_only: "Web only",
  unknown: "Channel not recorded",
};

const ENTITLEMENT_LABELS: Record<
  DeclaredEntitlement,
  string
> = {
  free: "Free",
  paid: "Paid",
  unknown: "Not recorded",
};

const PRICING_LABELS: Record<DeclaredPricingState, string> =
  {
    known: "Price stated by you",
    unknown: "No price stated",
  };

const STATUS_LABELS: Record<DeclaredStatus, string> = {
  active: "Active",
  archived: "Archived",
};

const cardStyle = {
  background: "#fff",
  border: "1px solid #e7ebf0",
  borderRadius: 12,
  padding: 22,
} as const;

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "9px 11px",
  borderRadius: 8,
  border: "1px solid #ddd",
  background: "#fff",
  fontSize: 14,
} as const;

const labelStyle = {
  display: "block",
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 6,
} as const;

const hintStyle = {
  margin: "6px 0 0",
  color: "#666",
  fontSize: 12,
  lineHeight: 1.5,
} as const;

const mutedTextStyle = {
  color: "#666",
  fontSize: 13,
  lineHeight: 1.5,
} as const;

const errorTextStyle = {
  margin: "0 0 10px",
  color: "#b42318",
  fontSize: 13,
  lineHeight: 1.5,
} as const;

const secondaryButtonStyle = {
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#111",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
} as const;

const primaryButtonStyle = {
  padding: "7px 14px",
  borderRadius: 8,
  border: 0,
  background: "#172033",
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
} as const;

const badgeStyle = {
  display: "inline-block",
  padding: "3px 8px",
  borderRadius: 5,
  fontSize: 11,
  fontWeight: 700,
  color: "#334155",
  background: "#f4f5f7",
  marginRight: 6,
  marginBottom: 4,
} as const;

const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
} as const;

/*
 * Three-state capability select. The option labels say stated and not
 * stated rather than supported and unsupported, because a blank entry
 * means the user has said nothing, not that the model cannot do it.
 */
const CAPABILITY_OPTIONS = [
  { value: "", label: "Not stated" },
  { value: "1", label: "Stated yes" },
  { value: "0", label: "Stated no" },
] as const;

const EMPTY_FORM = {
  name: "",
  providerName: "",
  modelName: "",
  channel: "unknown" as DeclaredChannel,
  entitlement: "unknown" as DeclaredEntitlement,
  pricingState: "unknown" as DeclaredPricingState,
  supportsTools: "",
  supportsVision: "",
  supportsReasoning: "",
  contextWindowTokens: "",
  maxOutputTokens: "",
  notes: "",
};

type DeclarationForm = typeof EMPTY_FORM;

function formatDate(value: string): string {
  return value.slice(0, 10);
}

function capabilityLabel(
  value: number | null
): string {
  if (value === null) {
    return "Not stated";
  }

  return value === 1 ? "Stated yes" : "Stated no";
}

function tokenLabel(value: number | null): string {
  return value === null ? "Not stated" : String(value);
}

function parseTokenCount(
  raw: string
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim();

  if (trimmed === "") {
    return { ok: true, value: null };
  }

  if (!/^\d+$/.test(trimmed)) {
    return { ok: false };
  }

  return { ok: true, value: Number(trimmed) };
}

function readJson(response: Response): Promise<{
  response: Response;
  data: {
    ok?: boolean;
    error?: string;
    items?: DeclaredResource[];
    declaration?: DeclaredResource;
  } | null;
}> {
  return response
    .json()
    .catch(() => null)
    .then((data) => ({ response, data }));
}

/*
 * The form is always a full description, so one payload serves both
 * POST and PATCH. Empty text and empty counts travel as explicit null:
 * that is how a value the row already carried gets cleared, and the
 * service rejects an empty string rather than storing it.
 */
function buildPayload(form: DeclarationForm): Record<
  string,
  string | number | null
> {
  const text = (value: string): string | null => {
    const trimmed = value.trim();

    return trimmed === "" ? null : trimmed;
  };

  const contextWindow = parseTokenCount(
    form.contextWindowTokens
  );
  const maxOutput = parseTokenCount(
    form.maxOutputTokens
  );

  return {
    name: form.name.trim(),
    providerName: text(form.providerName),
    modelName: text(form.modelName),
    channel: form.channel,
    entitlement: form.entitlement,
    pricingState: form.pricingState,
    supportsTools:
      form.supportsTools === ""
        ? null
        : Number(form.supportsTools),
    supportsVision:
      form.supportsVision === ""
        ? null
        : Number(form.supportsVision),
    supportsReasoning:
      form.supportsReasoning === ""
        ? null
        : Number(form.supportsReasoning),
    contextWindowTokens: contextWindow.ok
      ? contextWindow.value
      : null,
    maxOutputTokens: maxOutput.ok ? maxOutput.value : null,
    notes: text(form.notes),
  };
}

export function DeclaredResources() {
  const [view, setView] = useState<
    "active" | "archived"
  >("active");
  const [items, setItems] = useState<
    DeclaredResource[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(
    null
  );
  const [reloadKey, setReloadKey] = useState(0);

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] =
    useState<DeclaredResource | null>(null);
  const [form, setForm] =
    useState<DeclarationForm>(EMPTY_FORM);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<
    string | null
  >(null);

  useEffect(() => {
    let cancelled = false;

    fetch(
      `/api/planner/declarations?status=${view}`,
      { cache: "no-store" }
    )
      .then(readJson)
      .then(({ response, data }) => {
        if (cancelled) {
          return;
        }

        if (!response.ok || !data?.ok) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : `Failed to load declarations (${response.status})`
          );
        }

        setItems(
          Array.isArray(data.items)
            ? (data.items as DeclaredResource[])
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
            : "Failed to load declarations"
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [view, reloadKey]);

  function handleRetry() {
    setLoading(true);
    setError(null);
    setReloadKey((key) => key + 1);
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowCreate(true);
  }

  function openEdit(declaration: DeclaredResource) {
    setShowCreate(false);
    setFormError(null);
    setEditing(declaration);
    setForm({
      name: declaration.name,
      providerName: declaration.provider_name ?? "",
      modelName: declaration.model_name ?? "",
      channel: declaration.channel,
      entitlement: declaration.entitlement,
      pricingState: declaration.pricing_state,
      supportsTools:
        declaration.supports_tools === null
          ? ""
          : String(declaration.supports_tools),
      supportsVision:
        declaration.supports_vision === null
          ? ""
          : String(declaration.supports_vision),
      supportsReasoning:
        declaration.supports_reasoning === null
          ? ""
          : String(declaration.supports_reasoning),
      contextWindowTokens:
        declaration.context_window_tokens === null
          ? ""
          : String(declaration.context_window_tokens),
      maxOutputTokens:
        declaration.max_output_tokens === null
          ? ""
          : String(declaration.max_output_tokens),
      notes: declaration.notes ?? "",
    });
  }

  function closeForm() {
    setShowCreate(false);
    setEditing(null);
    setFormError(null);
  }

  function switchView(
    nextView: "active" | "archived"
  ) {
    if (nextView === view) {
      return;
    }

    setLoading(true);
    setView(nextView);
    closeForm();
  }

  function validateForm(): string | null {
    if (form.name.trim() === "") {
      return "Name is required.";
    }

    if (!parseTokenCount(form.contextWindowTokens).ok) {
      return "Context window must be a whole number of tokens.";
    }

    if (!parseTokenCount(form.maxOutputTokens).ok) {
      return "Maximum output must be a whole number of tokens.";
    }

    return null;
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (formBusy) {
      return;
    }

    const problem = validateForm();

    if (problem !== null) {
      setFormError(problem);
      return;
    }

    setFormBusy(true);
    setFormError(null);

    try {
      const payload = buildPayload(form);
      const editingId = editing?.id ?? null;

      const response = await fetch(
        editingId === null
          ? "/api/planner/declarations"
          : `/api/planner/declarations/${editingId}`,
        {
          method: editingId === null ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const { response: done, data } =
        await readJson(response);

      if (!done.ok || !data?.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : `Failed to save declaration (${done.status})`
        );
      }

      closeForm();
      setReloadKey((key) => key + 1);
    } catch (cause) {
      setFormError(
        cause instanceof Error
          ? cause.message
          : "Failed to save declaration"
      );
    } finally {
      setFormBusy(false);
    }
  }

  /*
   * Archiving is the only exit from the active view. The row is kept,
   * so any AI option already stored against it keeps resolving.
   */
  async function handleArchive(
    declaration: DeclaredResource
  ) {
    if (formBusy) {
      return;
    }

    setFormBusy(true);
    setFormError(null);

    try {
      const response = await fetch(
        `/api/planner/declarations/${declaration.id}/archive`,
        { method: "POST" }
      );

      const { response: done, data } =
        await readJson(response);

      if (!done.ok || !data?.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : `Failed to archive declaration (${done.status})`
        );
      }

      closeForm();
      setReloadKey((key) => key + 1);
    } catch (cause) {
      setFormError(
        cause instanceof Error
          ? cause.message
          : "Failed to archive declaration"
      );
    } finally {
      setFormBusy(false);
    }
  }

  return (
    <section
      style={{
        marginTop: 28,
        padding: 22,
        border: "1px solid #e7ebf0",
        borderRadius: 12,
        background: "#fcfdfe",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            Declared resources
          </div>

          <p
            style={{
              ...mutedTextStyle,
              margin: "6px 0 0",
              maxWidth: 640,
            }}
          >
            Ways you reach an AI model this app cannot
            see for itself. A declaration is recorded as
            what you state about it: it is not added to
            the registry and it is not treated as a
            resource you have verified here, and it never
            stores a key.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          style={primaryButtonStyle}
        >
          New declaration
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 16,
        }}
      >
        {(
          [
            "active",
            "archived",
          ] as const
        ).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => switchView(option)}
            style={{
              ...secondaryButtonStyle,
              background:
                view === option ? "#172033" : "#fff",
              color: view === option ? "#fff" : "#111",
              border:
                view === option
                  ? "1px solid #172033"
                  : "1px solid #ddd",
            }}
          >
            {STATUS_LABELS[option]}
          </button>
        ))}
      </div>

      {formError ? (
        <p role="alert" style={errorTextStyle}>
          {formError}
        </p>
      ) : null}

      {showCreate || editing !== null ? (
        <form
          onSubmit={handleSubmit}
          style={{
            ...cardStyle,
            marginTop: 16,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              marginBottom: 14,
            }}
          >
            {editing === null
              ? "New declaration"
              : "Edit declaration"}
          </div>

          <div style={formGridStyle}>
            <div>
              <label
                htmlFor="declared-name"
                style={labelStyle}
              >
                Name
              </label>

              <input
                id="declared-name"
                style={inputStyle}
                value={form.name}
                onChange={(event) =>
                  setForm({
                    ...form,
                    name: event.target.value,
                  })
                }
              />
            </div>

            <div>
              <label
                htmlFor="declared-provider"
                style={labelStyle}
              >
                Provider
              </label>

              <input
                id="declared-provider"
                style={inputStyle}
                placeholder="Your own wording"
                value={form.providerName}
                onChange={(event) =>
                  setForm({
                    ...form,
                    providerName: event.target.value,
                  })
                }
              />

              <p style={hintStyle}>
                Free text. It is not matched against the
                registry.
              </p>
            </div>

            <div>
              <label
                htmlFor="declared-model"
                style={labelStyle}
              >
                Model
              </label>

              <input
                id="declared-model"
                style={inputStyle}
                placeholder="Your own wording"
                value={form.modelName}
                onChange={(event) =>
                  setForm({
                    ...form,
                    modelName: event.target.value,
                  })
                }
              />
            </div>

            <div>
              <label
                htmlFor="declared-channel"
                style={labelStyle}
              >
                Channel
              </label>

              <select
                id="declared-channel"
                style={inputStyle}
                value={form.channel}
                onChange={(event) =>
                  setForm({
                    ...form,
                    channel: event.target
                      .value as DeclaredChannel,
                  })
                }
              >
                {(
                  Object.keys(
                    CHANNEL_LABELS
                  ) as DeclaredChannel[]
                ).map((value) => (
                  <option key={value} value={value}>
                    {CHANNEL_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="declared-entitlement"
                style={labelStyle}
              >
                Entitlement
              </label>

              <select
                id="declared-entitlement"
                style={inputStyle}
                value={form.entitlement}
                onChange={(event) =>
                  setForm({
                    ...form,
                    entitlement: event.target
                      .value as DeclaredEntitlement,
                  })
                }
              >
                {(
                  Object.keys(
                    ENTITLEMENT_LABELS
                  ) as DeclaredEntitlement[]
                ).map((value) => (
                  <option key={value} value={value}>
                    {ENTITLEMENT_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="declared-pricing"
                style={labelStyle}
              >
                Price
              </label>

              <select
                id="declared-pricing"
                style={inputStyle}
                value={form.pricingState}
                onChange={(event) =>
                  setForm({
                    ...form,
                    pricingState: event.target
                      .value as DeclaredPricingState,
                  })
                }
              >
                {(
                  Object.keys(
                    PRICING_LABELS
                  ) as DeclaredPricingState[]
                ).map((value) => (
                  <option key={value} value={value}>
                    {PRICING_LABELS[value]}
                  </option>
                ))}
              </select>

              <p style={hintStyle}>
                Only whether a price is known is recorded.
                No amount is stored or derived here.
              </p>
            </div>

            {(
              [
                [
                  "supportsTools",
                  "Tools",
                ],
                [
                  "supportsVision",
                  "Vision",
                ],
                [
                  "supportsReasoning",
                  "Reasoning",
                ],
              ] as const
            ).map(([key, labelText]) => (
              <div key={key}>
                <label
                  htmlFor={`declared-${key}`}
                  style={labelStyle}
                >
                  {labelText}
                </label>

                <select
                  id={`declared-${key}`}
                  style={inputStyle}
                  value={form[key]}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      [key]: event.target.value,
                    })
                  }
                >
                  {CAPABILITY_OPTIONS.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}

            <div>
              <label
                htmlFor="declared-context"
                style={labelStyle}
              >
                Context window (tokens)
              </label>

              <input
                id="declared-context"
                style={inputStyle}
                inputMode="numeric"
                placeholder="Not stated"
                value={form.contextWindowTokens}
                onChange={(event) =>
                  setForm({
                    ...form,
                    contextWindowTokens:
                      event.target.value,
                  })
                }
              />
            </div>

            <div>
              <label
                htmlFor="declared-output"
                style={labelStyle}
              >
                Maximum output (tokens)
              </label>

              <input
                id="declared-output"
                style={inputStyle}
                inputMode="numeric"
                placeholder="Not stated"
                value={form.maxOutputTokens}
                onChange={(event) =>
                  setForm({
                    ...form,
                    maxOutputTokens:
                      event.target.value,
                  })
                }
              />
            </div>

            <div>
              <label
                htmlFor="declared-notes"
                style={labelStyle}
              >
                Notes
              </label>

              <input
                id="declared-notes"
                style={inputStyle}
                value={form.notes}
                onChange={(event) =>
                  setForm({
                    ...form,
                    notes: event.target.value,
                  })
                }
              />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 16,
            }}
          >
            <button
              type="submit"
              disabled={formBusy}
              style={{
                ...primaryButtonStyle,
                cursor: formBusy
                  ? "default"
                  : "pointer",
                opacity: formBusy ? 0.6 : 1,
              }}
            >
              {formBusy
                ? "Saving…"
                : editing === null
                  ? "Add declaration"
                  : "Save changes"}
            </button>

            <button
              type="button"
              disabled={formBusy}
              onClick={closeForm}
              style={secondaryButtonStyle}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p style={{ ...mutedTextStyle, marginTop: 16 }}>
          Loading declarations…
        </p>
      ) : error && items.length === 0 ? (
        <div style={{ marginTop: 16 }}>
          <p role="alert" style={errorTextStyle}>
            {error}
          </p>

          <button
            type="button"
            onClick={handleRetry}
            style={secondaryButtonStyle}
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <p style={{ ...mutedTextStyle, marginTop: 16 }}>
          No {view} declarations.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 14,
            marginTop: 16,
          }}
        >
          {/*
            Rendered in the order the endpoint returned,
            which is insertion order. Nothing here compares
            one declaration against another.
          */}
          {items.map((declaration) => (
            <article
              key={declaration.id}
              style={cardStyle}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                    }}
                  >
                    {declaration.name}
                  </div>

                  <div
                    style={{
                      ...mutedTextStyle,
                      marginTop: 4,
                    }}
                  >
                    {[
                      declaration.provider_name,
                      declaration.model_name,
                    ]
                      .filter(
                        (part): part is string =>
                          typeof part === "string" &&
                          part !== ""
                      )
                      .join(" · ") || "No provider or model stated"}
                  </div>
                </div>

                <div>
                  <span style={badgeStyle}>
                    {STATUS_LABELS[declaration.status]}
                  </span>

                  <span style={badgeStyle}>
                    {CHANNEL_LABELS[declaration.channel]}
                  </span>

                  <span style={badgeStyle}>
                    {
                      ENTITLEMENT_LABELS[
                        declaration.entitlement
                      ]
                    }
                  </span>

                  <span style={badgeStyle}>
                    {
                      PRICING_LABELS[
                        declaration.pricing_state
                      ]
                    }
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: 14,
                  marginTop: 16,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#666",
                      marginBottom: 5,
                    }}
                  >
                    TOOLS
                  </div>

                  <div style={{ fontSize: 14 }}>
                    {capabilityLabel(
                      declaration.supports_tools
                    )}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#666",
                      marginBottom: 5,
                    }}
                  >
                    VISION
                  </div>

                  <div style={{ fontSize: 14 }}>
                    {capabilityLabel(
                      declaration.supports_vision
                    )}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#666",
                      marginBottom: 5,
                    }}
                  >
                    REASONING
                  </div>

                  <div style={{ fontSize: 14 }}>
                    {capabilityLabel(
                      declaration.supports_reasoning
                    )}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#666",
                      marginBottom: 5,
                    }}
                  >
                    CONTEXT WINDOW
                  </div>

                  <div style={{ fontSize: 14 }}>
                    {tokenLabel(
                      declaration.context_window_tokens
                    )}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#666",
                      marginBottom: 5,
                    }}
                  >
                    MAX OUTPUT
                  </div>

                  <div style={{ fontSize: 14 }}>
                    {tokenLabel(
                      declaration.max_output_tokens
                    )}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#666",
                      marginBottom: 5,
                    }}
                  >
                    RECORDED
                  </div>

                  <div style={{ fontSize: 14 }}>
                    {formatDate(
                      declaration.created_at
                    )}
                  </div>
                </div>
              </div>

              {declaration.notes ? (
                <p
                  style={{
                    ...mutedTextStyle,
                    marginTop: 14,
                  }}
                >
                  {declaration.notes}
                </p>
              ) : null}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 16,
                }}
              >
                <button
                  type="button"
                  disabled={formBusy}
                  onClick={() =>
                    openEdit(declaration)
                  }
                  style={secondaryButtonStyle}
                >
                  Edit
                </button>

                {declaration.status === "active" ? (
                  <button
                    type="button"
                    disabled={formBusy}
                    onClick={() =>
                      handleArchive(declaration)
                    }
                    style={{
                      ...secondaryButtonStyle,
                      cursor: formBusy
                        ? "default"
                        : "pointer",
                      opacity: formBusy ? 0.6 : 1,
                    }}
                  >
                    Archive
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
