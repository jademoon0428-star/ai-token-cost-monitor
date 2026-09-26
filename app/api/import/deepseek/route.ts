import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { NextResponse } from "next/server";

import { finalizeDeepSeekImport } from "@/lib/import/deepseek-finalize";
import {
  parseDeepSeekExportZip,
  type DeepSeekExportResult,
} from "@/lib/parsers/deepseek-export";

export const runtime = "nodejs";

const MAX_ZIP_BYTES = 50 * 1024 * 1024;
const PREVIEW = "preview";
const CONFIRM = "confirm";

function sha256Bytes(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function persistUpload(
  file: File
): Promise<{ dir: string; zip: string; hash: string }> {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "ai-token-cost-monitor-import-")
  );
  const zip = path.join(dir, "deepseek-usage.zip");
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(zip, buffer);
  return { dir, zip, hash: sha256Bytes(buffer) };
}

export async function POST(request: Request) {
  let uploaded: { dir: string; zip: string; hash: string } | null = null;

  try {
    const form = await request.formData();

    const mode = form.get("mode") === CONFIRM ? CONFIRM : PREVIEW;
    const rawHash = form.get("hash");
    const expectedHash = typeof rawHash === "string" ? rawHash : null;

    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, mode, error: "Field 'file' with a ZIP file is required." },
        { status: 400 }
      );
    }

    if (!/\.zip$/i.test(file.name)) {
      return NextResponse.json(
        { ok: false, mode, error: "The selected file is not a .zip file." },
        { status: 400 }
      );
    }

    if (file.size <= 0) {
      return NextResponse.json(
        { ok: false, mode, error: "The selected ZIP is empty." },
        { status: 400 }
      );
    }

    if (file.size > MAX_ZIP_BYTES) {
      return NextResponse.json(
        { ok: false, mode, error: "ZIP exceeds the 50 MB limit." },
        { status: 413 }
      );
    }

    uploaded = await persistUpload(file);

    let result: DeepSeekExportResult;

    try {
      result = parseDeepSeekExportZip(uploaded.zip);
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          mode,
          error:
            error instanceof Error
              ? error.message
              : "Failed to parse DeepSeek export ZIP.",
        },
        { status: 400 }
      );
    }

    if (mode === PREVIEW) {
      return NextResponse.json({
        ok: true,
        mode: PREVIEW,
        hash: uploaded.hash,
        summary: result.summary,
        records: result.records,
        files: result.files,
      });
    }

    if (expectedHash !== null && expectedHash !== uploaded.hash) {
      return NextResponse.json(
        {
          ok: false,
          mode: CONFIRM,
          error:
            "The ZIP changed since preview. Upload the file again.",
        },
        { status: 409 }
      );
    }

    const finalized = finalizeDeepSeekImport({
      records: result.records,
      summary: result.summary,
      zipSha256: uploaded.hash,
    });

    return NextResponse.json({
      ok: true,
      mode: CONFIRM,
      importId: finalized.importId,
      imported: finalized.imported,
      costed: finalized.costed,
      skipped: finalized.skipped,
      errors: [],
      summary: result.summary,
      hash: uploaded.hash,
    });
  } catch (error) {
    console.error("[Import DeepSeek API] Failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to import DeepSeek usage.",
      },
      { status: 500 }
    );
  } finally {
    if (uploaded !== null) {
      fs.rmSync(uploaded.dir, { recursive: true, force: true });
    }
  }
}