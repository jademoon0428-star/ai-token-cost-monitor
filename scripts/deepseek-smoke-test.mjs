import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixture = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/deepseek-response.json"), "utf8"));

const deepseek = await import(pathToFileURL(path.join(root, "providers/deepseek.ts")).href);
const engine = await import(pathToFileURL(path.join(root, "lib/cost-engine.ts")).href);

const usage = deepseek.normalizeDeepSeekResponse(fixture);
const pricing = deepseek.getDeepSeekPricing(usage.timestamp, usage.model);
const cost = engine.calculateCost(usage, pricing);

if (usage.provider !== "deepseek") throw new Error("provider mismatch");
if (usage.inputTokens !== 1_000_000) throw new Error("input token mismatch");
if (usage.cachedTokens !== 200_000) throw new Error("cached token mismatch");
if (usage.outputTokens !== 500_000) throw new Error("output token mismatch");
if (usage.reasoningTokens !== 100_000) throw new Error("reasoning token mismatch");
if (cost.reasoningCostMicros !== 0) throw new Error("reasoning must not be double billed");

console.log("DeepSeek connector smoke test: PASS");
console.log(JSON.stringify({ usage, pricing, cost }, null, 2));
