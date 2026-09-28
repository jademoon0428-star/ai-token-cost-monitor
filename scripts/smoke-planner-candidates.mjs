/*
 * R2 Phase 3.3-C1 Planner candidate generation smoke test.
 *
 * Touches no database. The registry, pricing and capability values
 * below are literal fixtures shaped like the rows the AI Registry
 * already holds, and every assertion runs on them in memory. Neither
 * data/ai-token-cost-monitor.db nor any other database is opened,
 * read or created.
 */
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import {
  fileURLToPath,
  pathToFileURL,
} from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

/*
 * The library sources use the project's "@/" alias and extension-less
 * relative imports, which plain Node cannot resolve. The existing
 * shared loader handles both; it only maps specifiers and never opens
 * a database.
 */
register(
  pathToFileURL(
    path.join(DIR, "ts-smoke-loader.mjs")
  ).href,
  import.meta.url
);

const { generatePlannerCandidates } = await import(
  "../lib/planner/candidate-generator.ts"
);
const { estimatePlannerCost } = await import(
  "../lib/planner/cost-estimator.ts"
);
const { estimatePlannerFit } = await import(
  "../lib/planner/fit-estimator.ts"
);
const { estimatePlannerTime } = await import(
  "../lib/planner/time-estimator.ts"
);
const { applyPlannerStrategy } = await import(
  "../lib/planner/strategy-rules.ts"
);

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${JSON.stringify(
        expected
      )}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);

  if (a !== b) {
    throw new Error(
      `${message}: expected ${b}, got ${a}`
    );
  }
}

const PLAN_CREATED_AT = "2026-09-28T09:00:00.000Z";

/*
 * A step that declares what it needs. Token figures are deliberately
 * modest so the 272K ceiling is never in play unless a case asks for
 * it.
 */
const TASK = {
  category: "coding",
  complexity: "medium",
  required_capabilities: '["tools"]',
  estimated_input_tokens_min: 1000,
  estimated_input_tokens_max: 4000,
  estimated_output_tokens_min: 500,
  estimated_output_tokens_max: 2000,
};

function capabilities(overrides = {}) {
  return {
    supports_tools: 1,
    supports_vision: 1,
    supports_reasoning: 1,
    context_window_tokens: 1000000,
    max_output_tokens: 100000,
    source_url: "https://example.invalid/capability",
    source_checked_at: "2026-09-27",
    ...overrides,
  };
}

function pricing(overrides = {}) {
  return {
    id: "fixture_pricing_2026-09-27",
    provider_id: "provider_openai",
    model: "gpt-5.6-sol",
    currency: "USD",
    input_per_million: 4,
    output_per_million: 20,
    cached_per_million: 0.4,
    reasoning_per_million: 20,
    effective_from: "2026-09-27",
    effective_to: null,
    ...overrides,
  };
}

function model(id, overrides = {}) {
  return {
    id,
    provider_id: "provider_openai",
    provider_name: "OpenAI",
    name: "gpt-5.6-sol",
    capabilities: capabilities(),
    pricing: [pricing()],
    ...overrides,
  };
}

/*
 * A model with capabilities but no expressible rate, matching the
 * shape DeepSeek occupies in the registry today.
 */
function unpricedModel(id) {
  return model(id, {
    pricing: [],
  });
}

const MODELS = [
  model("provider_openai_gpt_5_6_sol"),
  unpricedModel("provider_deepseek_deepseek_flash"),
];

function generate(overrides = {}) {
  return generatePlannerCandidates({
    task: TASK,
    planCreatedAt: PLAN_CREATED_AT,
    strategy: "cost_first",
    models: MODELS,
    ...overrides,
  });
}

function byId(result, modelId) {
  const found = result.candidates.find(
    (entry) => entry.modelId === modelId
  );

  if (found === undefined) {
    throw new Error(`no candidate for ${modelId}`);
  }

  return found;
}

console.log("--- generation ---");

check("1: every registered model becomes a candidate", () => {
  const result = generate();

  assertEqual(
    result.candidates.length,
    MODELS.length,
    "one candidate per registered model"
  );
  assertDeepEqual(
    result.candidates
      .map((entry) => entry.modelId)
      .sort(),
    [
      "provider_deepseek_deepseek_flash",
      "provider_openai_gpt_5_6_sol",
    ],
    "model coverage"
  );
});

check("2: every candidate carries a modelId", () => {
  const result = generate();

  for (const candidate of result.candidates) {
    assert(
      typeof candidate.modelId === "string" &&
        candidate.modelId.length > 0,
      "modelId must be present"
    );
  }
});

check("3: toolId is null on every candidate", () => {
  const result = generate();

  for (const candidate of result.candidates) {
    assertEqual(
      candidate.toolId,
      null,
      `${candidate.modelId} toolId`
    );
  }
});

check("4: the fit estimator is applied, not reimplemented", () => {
  const result = generate();

  const direct = estimatePlannerFit({
    requiredCapabilitiesJson: TASK.required_capabilities,
    estimatedInputTokensMax: TASK.estimated_input_tokens_max,
    estimatedOutputTokensMax: TASK.estimated_output_tokens_max,
    capabilities: capabilities(),
  });

  const candidate = byId(
    result,
    "provider_openai_gpt_5_6_sol"
  );

  assertEqual(
    candidate.fitStatus,
    direct.fitStatus,
    "fitStatus must match the fit estimator"
  );
  assertEqual(
    candidate.fitReason,
    direct.reason,
    "fitReason must match the fit estimator"
  );
  assertEqual(
    candidate.fitStatus,
    "meets",
    "fixture should meet"
  );
});

check("5: the cost estimator is applied, not reimplemented", () => {
  const result = generate();

  const direct = estimatePlannerCost({
    task: {
      estimatedInputTokensMin: 1000,
      estimatedInputTokensMax: 4000,
      estimatedOutputTokensMin: 500,
      estimatedOutputTokensMax: 2000,
    },
    pricing: {
      id: "fixture_pricing_2026-09-27",
      currency: "USD",
      inputPerMillion: 4,
      outputPerMillion: 20,
      effectiveFrom: "2026-09-27",
      effectiveTo: null,
    },
    planCreatedAt: PLAN_CREATED_AT,
    modelId: "provider_openai_gpt_5_6_sol",
  });

  const candidate = byId(
    result,
    "provider_openai_gpt_5_6_sol"
  );

  assertEqual(
    candidate.costMinMicros,
    direct.costMinMicros,
    "costMinMicros must match the cost estimator"
  );
  assertEqual(
    candidate.costMaxMicros,
    direct.costMaxMicros,
    "costMaxMicros must match the cost estimator"
  );
  assertEqual(
    candidate.costMinMicros,
    1000 * 4 + 500 * 20,
    "costMinMicros arithmetic"
  );
  assertEqual(
    candidate.costMaxMicros,
    4000 * 4 + 2000 * 20,
    "costMaxMicros arithmetic"
  );
});

check("6: the time estimator is applied and is model independent", () => {
  const result = generate();

  const direct = estimatePlannerTime({
    category: "coding",
    complexity: "medium",
  });

  assertEqual(
    direct.minMinutes,
    45,
    "time estimator minimum"
  );

  for (const candidate of result.candidates) {
    assertEqual(
      candidate.timeMinMinutes,
      direct.minMinutes,
      `${candidate.modelId} timeMinMinutes`
    );
    assertEqual(
      candidate.timeMaxMinutes,
      direct.maxMinutes,
      `${candidate.modelId} timeMaxMinutes`
    );
    assertEqual(
      candidate.timeBasis,
      direct.basis,
      `${candidate.modelId} timeBasis`
    );
  }
});

check("7: pricing is resolved at the frozen plan instant", () => {
  const before = generate({
    planCreatedAt: "2026-09-26T00:00:00.000Z",
  });

  assertEqual(
    byId(before, "provider_openai_gpt_5_6_sol")
      .costMinMicros,
    null,
    "before the rate is in force the cost is unknown"
  );

  const after = generate({
    planCreatedAt: "2026-09-28T00:00:00.000Z",
  });

  assert(
    byId(after, "provider_openai_gpt_5_6_sol")
      .costMinMicros !== null,
    "once in force the cost is known"
  );

  assertEqual(
    after.planCreatedAt,
    "2026-09-28T00:00:00.000Z",
    "the instant is echoed for auditing"
  );
});

check("8: an absent rate leaves the cost null, not zero", () => {
  const result = generate();

  const candidate = byId(
    result,
    "provider_deepseek_deepseek_flash"
  );

  assertEqual(
    candidate.costMinMicros,
    null,
    "costMinMicros"
  );
  assertEqual(
    candidate.costMaxMicros,
    null,
    "costMaxMicros"
  );
  assertEqual(
    candidate.costCurrency,
    null,
    "costCurrency"
  );
  assert(
    candidate.pricingBasis.startsWith(
      "unknown cost: "
    ),
    `pricingBasis must explain, got ${candidate.pricingBasis}`
  );
});

check("9: a model with no expressible rate is kept, never filtered out", () => {
  const result = generate();

  assert(
    result.candidates.some(
      (entry) =>
        entry.modelId ===
        "provider_deepseek_deepseek_flash"
    ),
    "an unpriced model must still appear as a candidate"
  );

  const priced = byId(
    result,
    "provider_openai_gpt_5_6_sol"
  );

  assert(
    priced.costMinMicros !== null,
    "a priced model in the same run must still be priced, so the unpriced one was not dropped to tidy the list"
  );
});

check("10: currency is carried through with no conversion", () => {
  const result = generate({
    models: [
      model("provider_openai_gpt_5_6_sol", {
        pricing: [pricing({ currency: "JPY" })],
      }),
    ],
  });

  const candidate = byId(
    result,
    "provider_openai_gpt_5_6_sol"
  );

  assertEqual(
    candidate.costCurrency,
    "JPY",
    "the pricing currency survives untouched"
  );
});

check("11: an unrecorded capability stays unknown", () => {
  const result = generate({
    models: [
      model("model-no-tools", {
        name: "no-tools",
        capabilities: capabilities({
          supports_tools: null,
        }),
      }),
    ],
  });

  const candidate = byId(result, "model-no-tools");

  assertEqual(
    candidate.fitStatus,
    "unknown",
    "a null capability must not read as a pass"
  );
  assert(
    candidate.rationale.includes("unknown"),
    `rationale should say unknown, got ${candidate.rationale}`
  );
});

check("12: a model with no capability row at all is unknown", () => {
  const result = generate({
    models: [
      model("model-no-row", {
        name: "no-row",
        capabilities: null,
      }),
    ],
  });

  assertEqual(
    byId(result, "model-no-row").fitStatus,
    "unknown",
    "fitStatus"
  );
});

check("13: a model lacking a required capability is below_minimum", () => {
  const result = generate({
    models: [
      model("model-no-vision", {
        name: "no-vision",
        capabilities: capabilities({
          supports_vision: 0,
        }),
      }),
    ],
    task: {
      ...TASK,
      required_capabilities: '["vision"]',
    },
  });

  assertEqual(
    byId(result, "model-no-vision").fitStatus,
    "below_minimum",
    "fitStatus"
  );
});

check("14: a cheap below_minimum candidate never leads", () => {
  const result = generate({
    strategy: "cost_first",
    models: [
      model("model-blocked", {
        name: "blocked",
        capabilities: capabilities({
          supports_vision: 0,
        }),
        pricing: [
          pricing({
            id: "blocked_pricing",
            input_per_million: 0.01,
            output_per_million: 0.01,
          }),
        ],
      }),
      model("model-usable", { name: "usable" }),
    ],
    task: {
      ...TASK,
      required_capabilities: '["vision"]',
    },
  });

  const first = result.candidates[0];

  assertEqual(
    first.modelId,
    "model-usable",
    "the viable candidate leads"
  );
  assert(
    first.fitStatus === "meets",
    "the leading candidate must be a confirmed match"
  );
  assert(
    byId(result, "model-blocked").fitStatus ===
      "below_minimum",
    "the blocked candidate is still present, just not first"
  );
});

console.log("--- strategy integration ---");

const STRATEGY_MODELS = [
  model("model-a", { name: "a" }),
  model("model-b", {
    name: "b",
    pricing: [
      pricing({
        id: "b_pricing",
        input_per_million: 1,
        output_per_million: 1,
      }),
    ],
  }),
  model("model-c", { name: "c", pricing: [] }),
];

function expectedOrder(strategy) {
  /*
   * Recomputed independently through strategy-rules, so a change in
   * this generator that quietly reordered candidates would be caught.
   */
  const built = STRATEGY_MODELS.map((entry) => ({
    modelId: entry.id,
    fitStatus: estimatePlannerFit({
      requiredCapabilitiesJson: TASK.required_capabilities,
      estimatedInputTokensMax: TASK.estimated_input_tokens_max,
      estimatedOutputTokensMax: TASK.estimated_output_tokens_max,
      capabilities: entry.capabilities,
    }).fitStatus,
    cost: estimatePlannerCost({
      task: {
        estimatedInputTokensMin: 1000,
        estimatedInputTokensMax: 4000,
        estimatedOutputTokensMin: 500,
        estimatedOutputTokensMax: 2000,
      },
      pricing:
        entry.pricing[0] === undefined
          ? null
          : {
              id: entry.pricing[0].id,
              currency: entry.pricing[0].currency,
              inputPerMillion:
                entry.pricing[0].input_per_million,
              outputPerMillion:
                entry.pricing[0].output_per_million,
              effectiveFrom:
                entry.pricing[0].effective_from,
              effectiveTo: entry.pricing[0].effective_to,
            },
      planCreatedAt: PLAN_CREATED_AT,
      modelId: entry.id,
    }),
    time: estimatePlannerTime({
      category: "coding",
      complexity: "medium",
    }),
  }));

  return applyPlannerStrategy({
    strategy,
    candidates: built,
  });
}

check("15: cost_first order matches strategy-rules exactly", () => {
  const result = generate({
    strategy: "cost_first",
    models: STRATEGY_MODELS,
  });

  assertDeepEqual(
    result.candidates.map((entry) => entry.modelId),
    expectedOrder("cost_first").order.map(
      (entry) => entry.modelId
    ),
    "cost_first order"
  );
  assertDeepEqual(
    result.strategyBasis,
    expectedOrder("cost_first").basis,
    "cost_first basis"
  );
});

check("16: time_first order matches strategy-rules exactly", () => {
  const result = generate({
    strategy: "time_first",
    models: STRATEGY_MODELS,
  });

  assertDeepEqual(
    result.candidates.map((entry) => entry.modelId),
    expectedOrder("time_first").order.map(
      (entry) => entry.modelId
    ),
    "time_first order"
  );
});

check("17: balanced order matches strategy-rules exactly", () => {
  const result = generate({
    strategy: "balanced",
    models: STRATEGY_MODELS,
  });

  assertDeepEqual(
    result.candidates.map((entry) => entry.modelId),
    expectedOrder("balanced").order.map(
      (entry) => entry.modelId
    ),
    "balanced order"
  );
});

check("18: representative flags match strategy-rules representatives", () => {
  for (const strategy of [
    "cost_first",
    "time_first",
    "balanced",
  ]) {
    const result = generate({
      strategy,
      models: STRATEGY_MODELS,
    });

    const expected = new Set(
      expectedOrder(strategy).representatives.map(
        (entry) => entry.modelId
      )
    );

    for (const candidate of result.candidates) {
      assertEqual(
        candidate.isStrategyRepresentative,
        expected.has(candidate.modelId),
        `${strategy}/${candidate.modelId} representative flag`
      );
    }
  }
});

check("19: an unpriced model is never a strategy representative under cost_first", () => {
  const result = generate({
    strategy: "cost_first",
    models: STRATEGY_MODELS,
  });

  const unpriced = byId(result, "model-c");

  assertEqual(
    unpriced.costMinMicros,
    null,
    "fixture precondition"
  );
  assertEqual(
    unpriced.isStrategyRepresentative,
    false,
    "an unknown cost must not stand in as the cheap end"
  );
});

check("20: generation is deterministic across repeated calls", () => {
  const models = structuredClone(STRATEGY_MODELS);
  const snapshot = JSON.stringify(models);

  for (const strategy of [
    "cost_first",
    "time_first",
    "balanced",
  ]) {
    const first = generate({
      strategy,
      models,
    });
    const second = generate({
      strategy,
      models,
    });

    assertDeepEqual(
      first,
      second,
      `${strategy} must be reproducible`
    );
  }

  assertEqual(
    JSON.stringify(models),
    snapshot,
    "the supplied models must not be mutated"
  );
});

check("21: a different pricing instant changes the answer, as it must", () => {
  const early = generate({
    planCreatedAt: "2026-01-01T00:00:00.000Z",
    models: STRATEGY_MODELS,
  });
  const late = generate({
    planCreatedAt: "2026-09-28T00:00:00.000Z",
    models: STRATEGY_MODELS,
  });

  assertDeepEqual(
    early.candidates.map(
      (entry) => entry.costMinMicros
    ),
    [null, null, null],
    "nothing is priced before the rate exists"
  );
  assert(
    late.candidates.some(
      (entry) => entry.costMinMicros !== null
    ),
    "the rate is in force later"
  );
});

check("22: an empty registry produces an empty result, not an error", () => {
  const result = generate({ models: [] });

  assertEqual(
    result.candidates.length,
    0,
    "no models means no candidates"
  );
  assert(
    typeof result.strategyBasis === "string",
    "a basis is still returned"
  );
});

check("23: an injected pricing resolver is honoured", () => {
  const result = generate({
    models: [model("model-a", { name: "a" })],
    pricingResolver: () => null,
  });

  const candidate = byId(result, "model-a");

  assertEqual(
    candidate.costMinMicros,
    null,
    "a resolver returning null means unknown"
  );
});

check("24: an expired rate is not used", () => {
  const result = generate({
    models: [
      model("model-a", {
        name: "a",
        pricing: [
          pricing({
            effective_from: "2026-01-01",
            effective_to: "2026-02-01",
          }),
        ],
      }),
    ],
  });

  assertEqual(
    byId(result, "model-a").costMinMicros,
    null,
    "an expired rate must not price a later plan"
  );
});

check("25: an estimate past the declared 272K scope stays unknown", () => {
  const result = generate({
    models: [
      model("provider_openai_gpt_5_6_sol", {
        name: "gpt-5.6-sol",
      }),
    ],
    task: {
      ...TASK,
      estimated_input_tokens_max: 300000,
    },
  });

  const candidate = byId(
    result,
    "provider_openai_gpt_5_6_sol"
  );

  assertEqual(
    candidate.costMinMicros,
    null,
    "a short-context rate must not price a longer estimate"
  );
  assert(
    candidate.pricingBasis.includes("272000"),
    `the reason should quote the ceiling, got ${candidate.pricingBasis}`
  );
});

check("26: rationale states facts and carries no judgement", () => {
  const result = generate({
    models: [
      model("model-a", { name: "a" }),
      model("model-b", { name: "b", pricing: [] }),
    ],
  });

  for (const candidate of result.candidates) {
    assert(
      typeof candidate.rationale === "string" &&
        candidate.rationale.length > 0,
      `${candidate.modelId} needs a rationale`
    );
    assert(
      candidate.rationale.includes("capability:"),
      `${candidate.modelId} rationale should cover capability`
    );
    assert(
      candidate.rationale.includes("pricing:"),
      `${candidate.modelId} rationale should cover pricing`
    );
    assert(
      candidate.rationale.includes("time:"),
      `${candidate.modelId} rationale should cover time`
    );

    const lowered = candidate.rationale.toLowerCase();

    for (const forbidden of [
      "best",
      "recommend",
      "winner",
      "highest",
      "most efficient",
      "quality",
    ]) {
      assert(
        !lowered.includes(forbidden),
        `${candidate.modelId} rationale must not contain "${forbidden}"`
      );
    }
  }
});

console.log("--- source integrity ---");

const SOURCE = readFileSync(
  path.join(
    DIR,
    "..",
    "lib",
    "planner",
    "candidate-generator.ts"
  ),
  "utf8"
);

const CODE = SOURCE
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

check("27: the business code introduces no grading vocabulary", () => {
  for (const forbidden of [
    "score",
    "rank",
    "ranking",
    "winner",
    "best",
    "quality",
    "confidence",
    "tier",
    "weight",
    "pareto",
    "leaderboard",
    "auto-select",
    "autoSelect",
    "apiKey",
    "credential",
  ]) {
    assert(
      !CODE.toLowerCase().includes(forbidden.toLowerCase()),
      `candidate-generator must not introduce "${forbidden}"`
    );
  }
});

check("28: no database, clock, network or model call in the business code", () => {
  for (const forbidden of [
    "getDb",
    "initDb",
    "@/lib/db",
    "@/lib/schema",
    "insert into",
    "update ",
    "delete from",
    "project_task_ai_options",
    "usage_records",
    "cost_records",
    "task_sessions",
    "task_usage_records",
    "is_selected =",
    "Date.now",
    "Math.random",
    "new Date(",
    "fetch(",
    "listAiRegistry",
    "resolveRegistryPricing(",
    "createUserAiTool",
    "listUserAiTools",
  ]) {
    assert(
      !CODE.includes(forbidden),
      `candidate-generator must not reference ${forbidden}`
    );
  }
});

check("29: the registry is used as data, never as a live handle", () => {
  /*
   * Every import of the registry module must be type-only, so loading
   * this file cannot reach the database through it. The statement is
   * matched across lines because the import is written multi-line.
   */
  const statements = SOURCE.match(
    /import\s+(type\s+)?\{[\s\S]*?\}\s*from\s*["']@\/lib\/registry\/ai-registry-repository["']/g
  );

  assert(
    Array.isArray(statements) &&
      statements.length > 0,
    "the registry shape should still be referenced"
  );

  for (const statement of statements) {
    assert(
      statement.startsWith("import type"),
      `registry import must be type-only, got: ${statement}`
    );
  }
});

check("30: the four existing estimators are the only estimation source", () => {
  for (const required of [
    "estimatePlannerFit",
    "estimatePlannerCost",
    "estimatePlannerTime",
    "applyPlannerStrategy",
  ]) {
    assert(
      CODE.includes(required),
      `candidate-generator must call ${required}`
    );
  }
});

console.log(
  `\nplanner candidates smoke: ${passed} passed, ${failed} failed`
);

if (failed > 0) {
  process.exitCode = 1;
}
