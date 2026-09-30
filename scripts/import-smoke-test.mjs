const base = "http://localhost:3000";
const usage = [{
  provider: "OpenAI", model: "gpt-test", timestamp: new Date().toISOString(),
  inputTokens: 900000, outputTokens: 100000, cachedTokens: 0, reasoningTokens: 0,
  source: "official_export", accuracy: "verified", application: "smoke-test", project: "mvp"
}];
const pricing = { "OpenAI:gpt-test": { inputPerMillion: 1, outputPerMillion: 2, version: "smoke-v1", currency: "USD" } };
const res = await fetch(`${base}/api/import`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ usage, pricing }) });
if (res.status !== 410) throw new Error(`generic import endpoint must stay closed (expected 410, got ${res.status})`);
console.log("Generic /api/import endpoint closed: PASS");
