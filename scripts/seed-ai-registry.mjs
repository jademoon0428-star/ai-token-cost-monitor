/*
 * Seeds the v1.4-B AI Registry (providers, models, capabilities and
 * official pricing) into the database this process would normally
 * open.
 *
 * Run it explicitly:
 *   npm run seed:registry
 *
 * It is idempotent, so re-running only refreshes the vendor
 * capability facts. It is never called from the app at runtime.
 */
import { register } from "node:module";
import path from "node:path";
import {
  fileURLToPath,
  pathToFileURL,
} from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

register(
  pathToFileURL(path.join(DIR, "ts-smoke-loader.mjs")).href,
  import.meta.url
);

const { dbPath } = await import("../lib/db.ts");
const { seedAiRegistry, listAiRegistry } =
  await import("../lib/registry/ai-registry-repository.ts");

const result = seedAiRegistry();
const providers = listAiRegistry();

console.log(`database: ${dbPath}`);
console.log(
  `seeded: ${result.providers} providers, ${result.models} models, ${result.capabilities} capability rows, ${result.pricing} pricing rows`
);

for (const provider of providers) {
  const withPricing = provider.models.filter(
    (model) => model.pricing.length > 0
  ).length;

  console.log(
    `- ${provider.name} (${provider.id}): ${provider.models.length} models, ${withPricing} with pricing`
  );
}
