/*
 * Minimal Node ESM resolve hook for running TypeScript library
 * modules out of a plain `node --experimental-strip-types` script.
 *
 * Maps the project "@/" path alias to the repository root and adds
 * ".ts" / "index.ts" resolution to the extension-less relative
 * imports used by the existing lib/*.ts sources (which Next's
 * bundler resolves but plain Node does not).
 *
 * The loader is self-registered by scripts/smoke-tasks.mjs via
 * `node:module`'s register(); it never touches the production or
 * project-local database.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(
  path.dirname(fileURLToPath(import.meta.url))
);

const TS_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  "/index.ts",
  "/index.js",
];

function tryResolve(base) {
  for (const extension of TS_EXTENSIONS) {
    const candidate = base + extension;

    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export async function resolve(specifier, context, nextResolve) {
  const parentURL = context.parentURL ?? "";

  if (specifier.startsWith("@/")) {
    const resolved = tryResolve(
      path.join(root, specifier.slice(2))
    );

    if (resolved !== null) {
      return nextResolve(
        pathToFileURL(resolved).href,
        context
      );
    }
  }

  if (
    specifier.startsWith(".") &&
    path.extname(specifier) === ""
  ) {
    const base = parentURL
      ? path.dirname(fileURLToPath(new URL(parentURL)))
      : root;

    const resolved = tryResolve(
      path.resolve(base, specifier)
    );

    if (resolved !== null) {
      return nextResolve(
        pathToFileURL(resolved).href,
        context
      );
    }
  }

  return nextResolve(specifier, context);
}