/*
 * Server startup hook. Next.js calls register() once when a server
 * instance is initiated, before it handles any request.
 *
 * The only thing done here is making sure the AI Registry baseline
 * exists. Until now the registry arrived empty on a fresh install and
 * someone had to run scripts/seed-ai-registry.mjs by hand before any
 * AI option, combination plan or cost estimate had a model to look at.
 *
 * It is a dynamic import on purpose: side effects belong inside
 * register(), not at the top of this file, and nothing here should be
 * loaded in an environment that cannot run it. The Node runtime is
 * checked first because the registry repository opens SQLite; the
 * repository additionally refuses to run during a production build, so
 * a build never touches the real database either.
 *
 * register() must never fail. ensureAiRegistryBaseline() swallows its
 * own errors for exactly that reason: an unseeded registry is a
 * recoverable state, a server that will not start is not.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { ensureAiRegistryBaseline } = await import(
    "./lib/registry/ai-registry-repository"
  );

  ensureAiRegistryBaseline();
}
