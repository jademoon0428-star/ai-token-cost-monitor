"use client";

import {
  useEffect,
  useState,
} from "react";

type Provider = {
  id:
    | "openai"
    | "anthropic"
    | "openrouter";
  name: string;
  description: string;
  keyPlaceholder: string;
  requiresAdminKey: boolean;
};

export default function ConnectPage() {
  const [
    providers,
    setProviders,
  ] = useState<Provider[]>([]);

  const [
    selectedProvider,
    setSelectedProvider,
  ] = useState<string>("");

  const [
    apiKey,
    setApiKey,
  ] = useState("");

  const [
    testing,
    setTesting,
  ] = useState(false);

  const [
    result,
    setResult,
  ] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/providers", {
      cache: "no-store",
    })
      .then((response) =>
        response.json()
      )
      .then((data) => {
        if (
          data?.success &&
          Array.isArray(
            data.providers
          )
        ) {
          setProviders(
            data.providers
          );

          if (data.providers[0]) {
            setSelectedProvider(
              data.providers[0].id
            );
          }
        }
      });
  }, []);

  const selected =
    providers.find(
      (item) =>
        item.id === selectedProvider
    );

  async function testConnection() {
    if (!selectedProvider) {
      return;
    }

    if (!apiKey.trim()) {
      setResult({
        success: false,
        message:
          "Please enter an API key.",
      });
      return;
    }

    setTesting(true);
    setResult(null);

    try {
      const response =
        await fetch(
          "/api/providers/test",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              provider:
                selectedProvider,
              apiKey:
                apiKey.trim(),
            }),
          }
        );

      const data =
        await response.json();

      setResult({
        success:
          Boolean(data?.success),
        message:
          data?.message ??
          "Connection test completed.",
      });
    } catch {
      setResult({
        success: false,
        message:
          "Unable to contact the connector API.",
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f5f7fb",
        padding: 40,
        fontFamily:
          "Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            marginBottom: 30,
          }}
        >
          <small
            style={{
              color: "#64748b",
              fontWeight: 700,
              letterSpacing: 1,
            }}
          >
            AI COST MONITOR
          </small>

          <h1
            style={{
              margin:
                "8px 0",
              fontSize: 36,
            }}
          >
            Connect AI Provider
          </h1>

          <p
            style={{
              color: "#64748b",
            }}
          >
            Connect your AI providers
            and bring verified usage and
            cost data into one dashboard.
          </p>
        </div>

        <section
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: 28,
            boxShadow:
              "0 4px 20px rgba(15,23,42,0.06)",
          }}
        >
          <h2
            style={{
              marginTop: 0,
            }}
          >
            1. Select Provider
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(200px,1fr))",
              gap: 14,
              marginTop: 18,
            }}
          >
            {providers.map(
              (provider) => {
                const active =
                  selectedProvider ===
                  provider.id;

                return (
                  <button
                    key={
                      provider.id
                    }
                    type="button"
                    onClick={() => {
                      setSelectedProvider(
                        provider.id
                      );
                      setResult(null);
                    }}
                    style={{
                      textAlign: "left",
                      padding: 18,
                      borderRadius: 12,
                      border: active
                        ? "2px solid #2563eb"
                        : "1px solid #e2e8f0",
                      background: active
                        ? "#eff6ff"
                        : "#fff",
                      cursor:
                        "pointer",
                    }}
                  >
                    <strong>
                      {provider.name}
                    </strong>

                    <p
                      style={{
                        margin:
                          "8px 0 0",
                        color:
                          "#64748b",
                        fontSize: 13,
                        lineHeight: 1.5,
                      }}
                    >
                      {
                        provider.description
                      }
                    </p>
                  </button>
                );
              }
            )}
          </div>

          <h2
            style={{
              marginTop: 35,
            }}
          >
            2. API Key
          </h2>

          {selected && (
            <>
              <p
                style={{
                  color:
                    "#64748b",
                  fontSize: 14,
                }}
              >
                {selected.requiresAdminKey
                  ? "This connector requires an organization/admin-level key."
                  : "Use the API key associated with this provider."}
              </p>

              <input
                type="password"
                value={apiKey}
                onChange={(event) =>
                  setApiKey(
                    event.target.value
                  )
                }
                placeholder={
                  selected.keyPlaceholder
                }
                autoComplete="off"
                style={{
                  width: "100%",
                  boxSizing:
                    "border-box",
                  padding: 14,
                  borderRadius: 10,
                  border:
                    "1px solid #cbd5e1",
                  fontSize: 15,
                }}
              />

              <button
                type="button"
                onClick={
                  testConnection
                }
                disabled={testing}
                style={{
                  marginTop: 18,
                  padding:
                    "12px 22px",
                  borderRadius: 10,
                  border: "none",
                  background:
                    testing
                      ? "#94a3b8"
                      : "#2563eb",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: testing
                    ? "default"
                    : "pointer",
                }}
              >
                {testing
                  ? "Testing..."
                  : "Test Connection"}
              </button>
            </>
          )}

          {result && (
            <div
              style={{
                marginTop: 20,
                padding: 16,
                borderRadius: 10,
                background:
                  result.success
                    ? "#f0fdf4"
                    : "#fef2f2",
                color:
                  result.success
                    ? "#166534"
                    : "#991b1b",
                border:
                  result.success
                    ? "1px solid #bbf7d0"
                    : "1px solid #fecaca",
              }}
            >
              {result.message}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}