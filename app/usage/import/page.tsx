"use client";

import { useState } from "react";

const MAX_ZIP_BYTES = 50 * 1024 * 1024;

type PreviewShape = {
  summary: {
    recordCount: number;
    minTimestamp: string;
    maxTimestamp: string;
    models: string[];
    currency: string;
    totalCost: number;
  };
  hash: string;
};

type ResultShape = {
  imported: number;
  costed: number;
  skipped: number;
  errors: string[];
  summary: {
    recordCount: number;
    totalCost: number;
    currency: string;
  };
};

async function postImport(
  file: File,
  mode: "preview" | "confirm",
  hash?: string
) {
  const form = new FormData();
  form.append("file", file);
  form.append("mode", mode);
  if (hash) form.append("hash", hash);

  const res = await fetch("/api/import/deepseek", {
    method: "POST",
    body: form,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || "Import failed.");
  }

  return data;
}

function money(total: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
  }).format(total)}`;
}

function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export default function UsageImportPage() {
  const [phase, setPhase] = useState<
    "pick" | "parsing" | "preview" | "importing" | "done"
  >("pick");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewShape | null>(null);
  const [result, setResult] = useState<ResultShape | null>(null);
  const [resetKey, setResetKey] = useState(0);

  async function sendPreview(next: File) {
    setError(null);
    setPhase("parsing");
    setPreview(null);
    setResult(null);

    try {
      const data = await postImport(next, "preview");
      setPreview({ summary: data.summary, hash: data.hash });
      setPhase("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse ZIP.");
      setPhase("pick");
    }
  }

  function onPick(picked: File | null) {
    if (!picked) return;
    if (!/\.zip$/i.test(picked.name)) {
      setError("The selected file is not a .zip file.");
      return;
    }
    if (picked.size > MAX_ZIP_BYTES) {
      setError("ZIP exceeds the 50 MB limit.");
      return;
    }
    setFile(picked);
    sendPreview(picked);
  }

  async function confirmImport() {
    if (!file || !preview) return;
    setError(null);
    setPhase("importing");

    try {
      const data = await postImport(file, "confirm", preview.hash);
      setResult(data);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
      setPhase("preview");
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setResetKey((key) => key + 1);
    setPhase("pick");
  }

  const busy = phase === "parsing" || phase === "importing";

  return (
    <main className="usage-page">
      <div className="usage-top">
        <div>
          <small>MONITOR / USAGE / IMPORT</small>
          <h1>Import usage</h1>
          <p>Import an official DeepSeek usage export ZIP into the local SQLite database.</p>
        </div>
        <a className="export" href="/usage">← Back to usage</a>
      </div>

      <section className="usage-card" style={{ padding: 24 }}>
        <div className="card-head">
          <div>
            <h2>DeepSeek ZIP import</h2>
            <p>Pick the usage-data ZIP you downloaded from the DeepSeek platform. No API keys required.</p>
          </div>
        </div>

        {phase === "pick" && (
          <>
            {error && (
              <p style={{ color: "#ef4444", margin: "0 0 16px", whiteSpace: "pre-wrap" }}>{error}</p>
            )}
            <label className="export" style={{ cursor: "pointer", display: "inline-block" }}>
              Choose ZIP file
              <input
                key={resetKey}
                type="file"
                accept=".zip,application/zip"
                hidden
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              />
            </label>
          </>
        )}

        {busy && (
          <p>
            {phase === "parsing" ? "Parsing ZIP…" : "Importing…"}
          </p>
        )}

        {phase === "preview" && preview && (
          <>
            <div className="card-head">
              <div>
                <h2>Preview</h2>
                <p>Nothing has been written yet.</p>
              </div>
            </div>

            <p>
              <strong>{preview.summary.recordCount}</strong> record(s) ·{" "}
              {when(preview.summary.minTimestamp)} → {when(preview.summary.maxTimestamp)} ·{" "}
              total <strong>{money(preview.summary.totalCost, preview.summary.currency)}</strong> ·{" "}
              models: {(preview.summary.models || []).join(", ")}
            </p>

            {error && (
              <p style={{ color: "#ef4444", margin: "0 0 16px", whiteSpace: "pre-wrap" }}>{error}</p>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 16 }}>
              <button className="export" onClick={confirmImport}>
                Confirm import
              </button>
              <button className="export" onClick={reset}>
                Choose another file
              </button>
            </div>
          </>
        )}

        {phase === "done" && result && (
          <>
            <div className="card-head">
              <div>
                <h2>{result.imported > 0 ? "Import complete" : "Nothing new to import"}</h2>
              </div>
            </div>

            <p>
              Imported <strong>{result.imported}</strong> record(s) · costed{" "}
              <strong>{result.costed}</strong> · skipped <strong>{result.skipped}</strong>{" "}
              duplicate(s).
            </p>

            <p>
              Official total:{" "}
              <strong>{money(result.summary.totalCost, result.summary.currency)}</strong>.
            </p>

            {result.errors.length > 0 && (
              <p style={{ color: "#ef4444", whiteSpace: "pre-wrap" }}>
                {result.errors.join("\n")}
              </p>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 16 }}>
              <a className="export" href="/usage">← Back to usage</a>
              <button className="export" onClick={reset}>
                Import another ZIP
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}