const base = "http://localhost:3000";
const usage = [{
  provider: "OpenAI", model: "gpt-test", timestamp: new Date().toISOString(),
  inputTokens: 900000, outputTokens: 100000, cachedTokens: 0, reasoningTokens: 0,
  source: "official_export", accuracy: "verified", application: "smoke-test", project: "mvp"
}];
const pricing = { "OpenAI:gpt-test": { inputPerMillion: 1, outputPerMillion: 2, version: "smoke-v1", currency: "USD" } };
const res = await fetch(`${base}/api/import`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ usage, pricing }) });
if (!res.ok) throw new Error(`import failed: ${res.status}`);
console.log(JSON.stringify(await res.json(), null, 2));
const costs = await fetch(`${base}/api/costs`).then(r => r.json());
const hit = costs.costs.find(x => x.model === "gpt-test");
if (!hit || Number(hit.total_cost_micros) !== 1100000) throw new Error("cost verification failed");
console.log("Import + Cost Engine smoke test: PASS");
