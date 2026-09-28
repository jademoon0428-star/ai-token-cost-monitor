"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
} from "react";

/*
 * R3.2 AI Resource management.
 *
 * Resources are read and written exclusively through the R3.1 Planner
 * Resource API:
 *
 *   GET    /api/planner/resources?status=active|archived|all
 *   POST   /api/planner/resources
 *   GET    /api/planner/resources/[id]
 *   PATCH  /api/planner/resources/[id]
 *   POST   /api/planner/resources/[id]/archive
 *
 * Nothing here touches SQLite directly. The tool and model lookup
 * lists arrive as props from the server page, which reads them from
 * the existing registry repositories; this component never constructs
 * a model, a provider, a price or a recommendation.
 */

type ToolOption = {
  id: string;
  name: string;
  category: string;
  status: string;
};

type ModelOption = {
  id: string;
  name: string;
};

type ProviderOption = {
  id: string;
  name: string;
  models: ModelOption[];
};

/*
 * The shape of one resource row, copied from the R3.1 API contract on
 * purpose. No field is invented here: there is no cost, no role, no
 * score, no rank, no tier and no recommendation, so the UI shows none
 * of them. The R3.4-B1 pricing basis is a recorded fact
 * (pricing_basis_kind, an optional pinned pricing_versions id and a
 * checked-at stamp); it is shown as-is and never turned into a price,
 * a saving or a recommendation.
 */
type AiResourceRow = {
  id: string;
  name: string;
  tool_id: string | null;
  model_id: string;
  access_method: AccessMethod;
  channel: Channel;
  entitlement_name: string | null;
  entitlement_source_url: string | null;
  entitlement_checked_at: string | null;
  status: "active" | "archived";
  owner: "user" | "system";
  notes: string | null;
  created_at: string;
  updated_at: string;
  pricing_basis_kind: PricingBasis;
  pricing_version_id: string | null;
  pricing_basis_checked_at: string | null;
};

type AccessMethod =
  | "free_tier"
  | "subscription"
  | "pay_as_you_go"
  | "unknown";

/*
 * channel is the reachability axis, orthogonal to access_method. It is
 * a recorded fact; the form adds no key, URL or credential, and the
 * app never opens a provider connection from it.
 */
type Channel =
  | "own_api"
  | "gateway"
  | "web_only"
  | "unknown";

/*
 * The pricing basis of a resource, from the R3.4-B1 contract: 'none'
 * means no pricing basis has been recorded, 'registry' means it is
 * priced against the registry rate card. It is a neutral fact; the UI
 * offers only these two values, calculates nothing from them and
 * never recommends one over the other.
 */
type PricingBasis = "registry" | "none";

type ResourceView = "active" | "archived";

/*
 * The four access methods are a closed set; the API rejects anything
 * else, so the form only offers these values, and the list renders
 * them as plain English.
 */
const ACCESS_METHOD_LABELS: Record<AccessMethod, string> = {
  free_tier: "Free tier",
  subscription: "Subscription",
  pay_as_you_go: "Pay as you go",
  unknown: "Unknown",
};

const ACCESS_METHOD_ORDER: AccessMethod[] = [
  "free_tier",
  "subscription",
  "pay_as_you_go",
  "unknown",
];

const ACCESS_METHOD_COLORS: Record<AccessMethod, string> = {
  free_tier: "#159570",
  subscription: "#3976cf",
  pay_as_you_go: "#5a4ce1",
  unknown: "#98a2b3",
};

const CHANNEL_LABELS: Record<Channel, string> = {
  own_api: "Own API",
  gateway: "Gateway",
  web_only: "Web only",
  unknown: "Unknown",
};

const CHANNEL_ORDER: Channel[] = [
  "own_api",
  "gateway",
  "web_only",
  "unknown",
];

const CHANNEL_COLORS: Record<Channel, string> = {
  own_api: "#159570",
  gateway: "#3976cf",
  web_only: "#5a4ce1",
  unknown: "#98a2b3",
};

const PRICING_BASIS_LABELS: Record<PricingBasis, string> = {
  registry: "Registry",
  none: "None",
};

const PRICING_BASIS_ORDER: PricingBasis[] = [
  "registry",
  "none",
];

const PRICING_BASIS_COLORS: Record<PricingBasis, string> = {
  registry: "#3976cf",
  none: "#98a2b3",
};

const STATUS_LABELS: Record<ResourceView, string> = {
  active: "Active",
  archived: "Archived",
};

const STATUS_COLORS: Record<ResourceView, string> = {
  active: "#159570",
  archived: "#98a2b3",
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

function formatDate(value: string): string {
  return value.slice(0, 10);
}

function Field({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
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

      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: 14,
            lineHeight: 1.5,
            wordBreak: "break-word",
            color: "#3976cf",
          }}
        >
          {value}
        </a>
      ) : (
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.5,
            wordBreak: "break-word",
            color: value === "—" ? "#98a2b3" : "#111",
          }}
        >
          {value}
        </div>
      )}
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

const readJson = (
  response: Response
): Promise<{
  response: Response;
  data: {
    ok?: boolean;
    error?: string;
    code?: string;
    items?: AiResourceRow[];
    resource?: AiResourceRow;
  } | null;
}> =>
  response
    .json()
    .catch(() => null)
    .then((data) => ({ response, data }));

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);

    return (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:"
    );
  } catch {
    return false;
  }
}

type ResourcePayload = {
  name: string;
  modelId: string;
  toolId: string | null;
  accessMethod: AccessMethod;
  channel: Channel;
  entitlementName: string | null;
  entitlementSourceUrl: string | null;
  entitlementCheckedAt: string | null;
  notes: string | null;
  pricingBasisKind: PricingBasis;
  pricingVersionId: string | null | undefined;
};

/*
 * The form is always a full resource description, so the payload is
 * the same for POST and PATCH. Optional fields the user left empty are
 * sent as null (never as empty strings, which the service rejects) and
 * an explicit null is how PATCH clears a value the row already had.
 *
 * The pricing basis is form-owned: it always travels with the record.
 * pricing_version_id is not shown in the form, so it is only sent when
 * the basis is 'none' (as an explicit null, to clear any pinned card
 * the row may carry). Under 'registry' it is omitted entirely, which
 * leaves an existing pin untouched — the UI never guesses a version.
 */
function buildPayload(input: {
  name: string;
  modelId: string;
  toolId: string;
  accessMethod: AccessMethod;
  channel: Channel;
  entitlementName: string;
  entitlementSourceUrl: string;
  entitlementCheckedAt: string;
  notes: string;
  pricingBasisKind: PricingBasis;
}): ResourcePayload {
  const name = input.name.trim();
  const entitlementName = input.entitlementName.trim();
  const entitlementSourceUrl =
    input.entitlementSourceUrl.trim();
  const notes = input.notes.trim();
  const toolId = input.toolId === "" ? null : input.toolId;
  const entitlementCheckedAt =
    input.entitlementCheckedAt === ""
      ? null
      : input.entitlementCheckedAt;

  return {
    name,
    modelId: input.modelId,
    accessMethod: input.accessMethod,
    channel: input.channel,
    toolId,
    entitlementName:
      entitlementName === "" ? null : entitlementName,
    entitlementSourceUrl:
      entitlementSourceUrl === ""
        ? null
        : entitlementSourceUrl,
    entitlementCheckedAt,
    notes: notes === "" ? null : notes,
    pricingBasisKind: input.pricingBasisKind,
    pricingVersionId:
      input.pricingBasisKind === "none" ? null : undefined,
  };
}

const EMPTY_FORM = {
  name: "",
  modelId: "",
  toolId: "",
  accessMethod: "unknown" as AccessMethod,
  channel: "unknown" as Channel,
  entitlementName: "",
  entitlementSourceUrl: "",
  entitlementCheckedAt: "",
  notes: "",
  pricingBasisKind: "none" as PricingBasis,
};

export function AiResources({
  tools,
  providers,
}: {
  tools: ToolOption[];
  providers: ProviderOption[];
}) {
  const [view, setView] = useState<ResourceView>("active");
  const [resources, setResources] = useState<AiResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<AiResourceRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/planner/resources?status=${view}`, {
      cache: "no-store",
    })
      .then(readJson)
      .then(({ response, data }) => {
        if (cancelled) {
          return;
        }

        if (!response.ok || !data?.ok) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : `Failed to load resources (${response.status})`
          );
        }

        setResources(
          Array.isArray(data.items)
            ? (data.items as AiResourceRow[])
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
            : "Failed to load resources"
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [view, reloadKey]);

  const activeTools = tools.filter(
    (tool) => tool.status === "active"
  );
  const toolByName = new Map(
    tools.map((tool) => [tool.id, tool.name])
  );
  const modelByName = new Map(
    providers.flatMap((provider) =>
      provider.models.map((model) => [model.id, model.name])
    )
  );
  const providerByModel = new Map(
    providers.flatMap((provider) =>
      provider.models.map((model) => [model.id, provider.name])
    )
  );
  const hasModels = providers.some(
    (provider) => provider.models.length > 0
  );

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

  function openEdit(resource: AiResourceRow) {
    setShowCreate(false);
    setFormError(null);
    setEditing(resource);
    setForm({
      name: resource.name,
      modelId: resource.model_id,
      toolId: resource.tool_id ?? "",
      accessMethod: resource.access_method,
      channel: resource.channel,
      entitlementName: resource.entitlement_name ?? "",
      entitlementSourceUrl:
        resource.entitlement_source_url ?? "",
      entitlementCheckedAt: (resource.entitlement_checked_at ?? "").slice(
        0,
        10
      ),
      notes: resource.notes ?? "",
      pricingBasisKind: resource.pricing_basis_kind,
    });
  }

  function closeForm() {
    setShowCreate(false);
    setEditing(null);
    setFormError(null);
  }

  function switchView(nextView: ResourceView) {
    if (nextView === view) {
      return;
    }

    setLoading(true);
    setView(nextView);
    closeForm();
  }

  function validateForm(): string | null {
    if (form.name.trim() === "") {
      return "Resource name is required.";
    }

    if (form.modelId === "") {
      return "Model is required.";
    }

    if (
      form.entitlementSourceUrl.trim() !== "" &&
      !isAbsoluteHttpUrl(form.entitlementSourceUrl.trim())
    ) {
      return "Entitlement source URL must be an absolute http(s) URL.";
    }

    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (formBusy) {
      return;
    }

    const validationError = validateForm();

    if (validationError) {
      setFormError(validationError);

      return;
    }

    setFormError(null);
    setFormBusy(true);

    const payload = buildPayload(form);
    const isEdit = editing !== null;
    const url = isEdit
      ? `/api/planner/resources/${editing!.id}`
      : "/api/planner/resources";

    try {
      const response = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response
        .json()
        .catch(() => null);

      if (!response.ok || !data?.ok || !data?.resource) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : `Failed to save resource (${response.status})`
        );
      }

      closeForm();
      setFormBusy(false);
      setLoading(true);
      setReloadKey((key) => key + 1);
    } catch (cause) {
      setFormError(
        cause instanceof Error
          ? cause.message
          : "Failed to save resource"
      );
      setFormBusy(false);
    }
  }

  async function handleArchive(resource: AiResourceRow) {
    if (
      !window.confirm(
        "Archive this AI resource? It will move out of the active " +
          "list and stay readable in the archived list."
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `/api/planner/resources/${resource.id}/archive`,
        {
          method: "POST",
        }
      );

      const data = await response
        .json()
        .catch(() => null);

      if (!response.ok || !data?.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : `Failed to archive resource (${response.status})`
        );
      }

      setLoading(true);
      setReloadKey((key) => key + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Failed to archive resource"
      );
    }
  }

  function modelLabel(resource: AiResourceRow): string {
    const modelName = modelByName.get(resource.model_id);
    const providerName = providerByModel.get(resource.model_id);

    if (modelName && providerName) {
      return `${providerName} · ${modelName}`;
    }

    return modelName ?? resource.model_id;
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
      <div style={{ marginBottom: 14 }}>
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

      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 20,
          marginBottom: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 32, margin: 0 }}>
            AI Resources
          </h1>

          <p style={{ margin: "8px 0 0", color: "#666", fontSize: 15 }}>
            Your registered AI resources.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          style={{
            padding: "9px 14px",
            borderRadius: 8,
            border: 0,
            background: "#172033",
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          + Add AI Resource
        </button>
      </header>

      <p style={{ margin: "0 0 24px", ...mutedTextStyle }}>
        This page only manages resources you have registered. A model
        or tool absent from this list is simply not registered yet —
        that absence does not mean free, unavailable or zero cost, and
        it is never ranked, scored or recommended here.
      </p>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 18,
        }}
      >
        {(["active", "archived"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => switchView(value)}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: view === value ? "#172033" : "#fff",
              color: view === value ? "#fff" : "#555",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {value === "active" ? "Active" : "Archived"}
          </button>
        ))}
      </div>

      {showCreate || editing ? (
        <form
          onSubmit={handleSubmit}
          style={{
            display: "grid",
            gap: 16,
            padding: 18,
            marginBottom: 18,
            border: "1px solid #e7ebf0",
            borderRadius: 10,
            background: "#fbfcfe",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h2 style={{ fontSize: 16, margin: 0 }}>
              {editing ? "Edit AI Resource" : "Add AI Resource"}
            </h2>

            <button
              type="button"
              onClick={closeForm}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #ddd",
                background: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>

          <div>
            <label htmlFor="resourceName" style={labelStyle}>
              Name
            </label>

            <input
              id="resourceName"
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="DeepSeek API access"
              style={inputStyle}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            <div>
              <label htmlFor="resourceModel" style={labelStyle}>
                Model
              </label>

              <select
                id="resourceModel"
                value={form.modelId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    modelId: event.target.value,
                  }))
                }
                style={inputStyle}
              >
                <option value="">Select a model</option>

                {hasModels
                  ? providers.map((provider) => (
                      <optgroup
                        key={provider.id}
                        label={provider.name}
                      >
                        {provider.models.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name}
                          </option>
                        ))}
                      </optgroup>
                    ))
                  : null}
              </select>

              {!hasModels ? (
                <p style={hintStyle}>
                  No models in the registry yet.
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="resourceTool" style={labelStyle}>
                Tool (optional)
              </label>

              <select
                id="resourceTool"
                value={form.toolId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    toolId: event.target.value,
                  }))
                }
                style={inputStyle}
              >
                <option value="">
                  Direct API — no tool
                </option>

                {activeTools.map((tool) => (
                  <option key={tool.id} value={tool.id}>
                    {tool.name}
                  </option>
                ))}
              </select>

              <p style={hintStyle}>
                Leave as “Direct API” when this resource is accessed
                without a registered tool.
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="resourceAccessMethod" style={labelStyle}>
              Access method
            </label>

            <select
              id="resourceAccessMethod"
              value={form.accessMethod}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  accessMethod: event.target
                    .value as AccessMethod,
                }))
              }
              style={inputStyle}
            >
              {ACCESS_METHOD_ORDER.map((value) => (
                <option key={value} value={value}>
                  {ACCESS_METHOD_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="resourceChannel" style={labelStyle}>
              Channel
            </label>

            <select
              id="resourceChannel"
              value={form.channel}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  channel: event.target.value as Channel,
                }))
              }
              style={inputStyle}
            >
              {CHANNEL_ORDER.map((value) => (
                <option key={value} value={value}>
                  {CHANNEL_LABELS[value]}
                </option>
              ))}
            </select>

            <p style={hintStyle}>
              How this resource is reached. A recorded fact only: no
              key, URL or provider connection is stored here.
            </p>
          </div>

          <div>
            <label htmlFor="resourcePricingBasis" style={labelStyle}>
              Pricing basis
            </label>

            <select
              id="resourcePricingBasis"
              value={form.pricingBasisKind}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  pricingBasisKind: event.target
                    .value as PricingBasis,
                }))
              }
              style={inputStyle}
            >
              {PRICING_BASIS_ORDER.map((value) => (
                <option key={value} value={value}>
                  {PRICING_BASIS_LABELS[value]}
                </option>
              ))}
            </select>

            <p style={hintStyle}>
              The pricing basis your plans should assume for this
              resource. A recorded fact only: no price is calculated,
              shown or recommended here.
            </p>
          </div>

          <div>
            <label
              htmlFor="resourceEntitlementName"
              style={labelStyle}
            >
              Entitlement name (optional)
            </label>

            <input
              id="resourceEntitlementName"
              value={form.entitlementName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  entitlementName: event.target.value,
                }))
              }
              placeholder="Team subscription"
              style={inputStyle}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            <div>
              <label
                htmlFor="resourceEntitlementUrl"
                style={labelStyle}
              >
                Entitlement source URL (optional)
              </label>

              <input
                id="resourceEntitlementUrl"
                value={form.entitlementSourceUrl}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    entitlementSourceUrl: event.target.value,
                  }))
                }
                placeholder="https://platform.example.com/usage"
                style={inputStyle}
              />
            </div>

            <div>
              <label
                htmlFor="resourceEntitlementCheckedAt"
                style={labelStyle}
              >
                Entitlement checked at (optional)
              </label>

              <input
                id="resourceEntitlementCheckedAt"
                type="date"
                value={form.entitlementCheckedAt}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    entitlementCheckedAt: event.target.value,
                  }))
                }
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label htmlFor="resourceNotes" style={labelStyle}>
              Notes (optional)
            </label>

            <textarea
              id="resourceNotes"
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              rows={3}
              style={{
                ...inputStyle,
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
          </div>

          {formError ? (
            <p
              role="alert"
              style={{
                margin: 0,
                color: "#b42318",
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              {formError}
            </p>
          ) : null}

          <div>
            <button
              type="submit"
              disabled={formBusy}
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                border: 0,
                background: "#172033",
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                cursor: formBusy ? "default" : "pointer",
                opacity: formBusy ? 0.6 : 1,
              }}
            >
              {formBusy
                ? editing
                  ? "Saving…"
                  : "Adding…"
                : editing
                  ? "Save Changes"
                  : "Add Resource"}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p style={{ color: "#666", fontSize: 14 }}>
          Loading resources…
        </p>
      ) : error ? (
        <div style={cardStyle}>
          <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>
            Could not load resources
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
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      ) : resources.length === 0 ? (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e7ebf0",
            borderRadius: 12,
            padding: 32,
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: 17, margin: "0 0 8px" }}>
            {view === "active"
              ? "No AI resources registered yet."
              : "No archived AI resources yet."}
          </h2>

          <p style={{ margin: 0, ...mutedTextStyle }}>
            {view === "active"
              ? "Register the AI resources you already own — how you " +
                "access a model, and the entitlement behind it."
              : "Archived resources stay readable here; they can still " +
                "be referenced later."}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {resources.map((resource) => (
            <div
              key={resource.id}
              style={{
                ...cardStyle,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 16,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                >
                  {resource.name}
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
                      STATUS_LABELS[resource.status] ??
                      resource.status
                    }
                    color={
                      STATUS_COLORS[resource.status] ??
                      "#555"
                    }
                  />

                  <Badge
                    text={
                      ACCESS_METHOD_LABELS[
                        resource.access_method
                      ] ?? resource.access_method
                    }
                    color={
                      ACCESS_METHOD_COLORS[
                        resource.access_method
                      ] ?? "#555"
                    }
                  />

                  <Badge
                    text={
                      CHANNEL_LABELS[resource.channel] ??
                      resource.channel
                    }
                    color={
                      CHANNEL_COLORS[resource.channel] ??
                      "#555"
                    }
                  />

                  <Badge
                    text={
                      PRICING_BASIS_LABELS[
                        resource.pricing_basis_kind
                      ] ?? resource.pricing_basis_kind
                    }
                    color={
                      PRICING_BASIS_COLORS[
                        resource.pricing_basis_kind
                      ] ?? "#555"
                    }
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                }}
              >
                <Field
                  label="TOOL"
                  value={
                    resource.tool_id === null
                      ? "Direct API"
                      : (toolByName.get(resource.tool_id) ??
                        resource.tool_id)
                  }
                />

                <Field
                  label="MODEL"
                  value={modelLabel(resource)}
                />

                <Field
                  label="ENTITLEMENT"
                  value={resource.entitlement_name ?? "—"}
                />

                <Field
                  label="ENTITLEMENT SOURCE"
                  value={
                    resource.entitlement_source_url ?? "—"
                  }
                  href={
                    resource.entitlement_source_url ?? undefined
                  }
                />

                <Field
                  label="ENTITLEMENT CHECKED"
                  value={
                    resource.entitlement_checked_at
                      ? formatDate(
                          resource.entitlement_checked_at
                        )
                      : "—"
                  }
                />

                <Field
                  label="UPDATED"
                  value={formatDate(resource.updated_at)}
                />
              </div>

              {resource.notes ? (
                <Field
                  label="NOTES"
                  value={resource.notes}
                />
              ) : null}

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: "1px solid #f0f1f4",
                }}
              >
                <div style={{ ...mutedTextStyle, fontSize: 12 }}>
                  Created {formatDate(resource.created_at)}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => openEdit(resource)}
                    style={{
                      padding: "7px 12px",
                      borderRadius: 8,
                      border: "1px solid #ddd",
                      background: "#fff",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Edit
                  </button>

                  {resource.status === "active" ? (
                    <button
                      type="button"
                      onClick={() => handleArchive(resource)}
                      style={{
                        padding: "7px 12px",
                        borderRadius: 8,
                        border: "1px solid #ddd",
                        background: "#fff",
                        color: "#b42318",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Archive
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}