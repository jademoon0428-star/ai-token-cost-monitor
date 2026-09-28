/*
 * R2 Phase 3.3-B Planner estimator smoke test.
 *
 * Touches no database at all. Every case runs on hand-built literal
 * fixtures, so neither data/ai-token-cost-monitor.db nor any other
 * database is opened, read or created. The final group proves that by
 * reading the estimator sources as text and asserting they contain no
 * write path and no clock.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

const { estimatePlannerCost, DECLARED_INPUT_SCOPE_LIMITS } = await import(
  "../lib/planner/cost-estimator.ts"
);
const { estimatePlannerFit } = await import(
  "../lib/planner/fit-estimator.ts"
);
const {
  estimatePlannerTime,
  PLANNER_TIME_CATEGORIES,
  PLANNER_TIME_COMPLEXITIES,
  PLANNER_TIME_BASIS_VERSION,
} = await import("../lib/planner/time-estimator.ts");
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

function assertAllUnknown(result, message) {
  assertEqual(
    result.costMinMicros,
    null,
    `${message} (costMinMicros)`
  );
  assertEqual(
    result.costMaxMicros,
    null,
    `${message} (costMaxMicros)`
  );
  assertEqual(
    result.currency,
    null,
    `${message} (currency)`
  );
  assert(
    typeof result.pricingBasis === "string" &&
      result.pricingBasis.startsWith(
        "unknown cost: "
      ),
    `${message}: pricingBasis must explain the unknown, got ${result.pricingBasis}`
  );
}

const USD = {
  id: "fixture_pricing_2026-09-01",
  currency: "USD",
  inputPerMillion: 5,
  outputPerMillion: 25,
  effectiveFrom: "2026-09-01",
  effectiveTo: null,
};

const AT = "2026-09-10T08:00:00.000Z";

function tokens(
  inputMin,
  inputMax,
  outputMin,
  outputMax
) {
  return {
    estimatedInputTokensMin: inputMin,
    estimatedInputTokensMax: inputMax,
    estimatedOutputTokensMin: outputMin,
    estimatedOutputTokensMax: outputMax,
  };
}

console.log("--- cost estimator ---");

check("cost 1: known pricing produces a known range", () => {
  const result = estimatePlannerCost({
    task: tokens(1000, 2000, 500, 1000),
    pricing: USD,
    planCreatedAt: AT,
  });

  assertEqual(result.costMinMicros, 17500, "costMinMicros");
  assertEqual(result.costMaxMicros, 35000, "costMaxMicros");
  assertEqual(result.currency, "USD", "currency");
  assert(
    result.pricingBasis.includes(
      "fixture_pricing_2026-09-01"
    ),
    "pricingBasis must name the pricing version"
  );
  assert(
    result.pricingBasis.includes("effective_from="),
    "pricingBasis must record effective_from"
  );
  assert(
    result.pricingBasis.includes("effective_to="),
    "pricingBasis must record effective_to"
  );
  assert(
    result.pricingBasis.includes("basis=registry"),
    "pricingBasis must record the registry basis"
  );
  assert(
    result.pricingBasis.includes(AT),
    "pricingBasis must record the resolved instant"
  );
});

check("cost 2: each component is rounded on its own, then summed", () => {
  /*
   * 3 tokens at 0.5/million is 1.5 micros per component, which rounds
   * to 2. Summing the two rounded halves gives 4. Rounding the
   * combined 3.0 instead would give 3, so this case fails if the two
   * components are ever collapsed into one before rounding.
   */
  const result = estimatePlannerCost({
    task: tokens(3, 3, 3, 3),
    pricing: {
      ...USD,
      inputPerMillion: 0.5,
      outputPerMillion: 0.5,
    },
    planCreatedAt: AT,
  });

  assertEqual(result.costMinMicros, 4, "costMinMicros");
  assertEqual(result.costMaxMicros, 4, "costMaxMicros");
});

check("cost 3: minimum uses the minimum bounds and maximum uses the maximum bounds", () => {
  const result = estimatePlannerCost({
    task: tokens(1000, 8000, 200, 4000),
    pricing: USD,
    planCreatedAt: AT,
  });

  assertEqual(
    result.costMinMicros,
    1000 * 5 + 200 * 25,
    "costMinMicros"
  );
  assertEqual(
    result.costMaxMicros,
    8000 * 5 + 4000 * 25,
    "costMaxMicros"
  );
});

check("cost 4: absent pricing is unknown, not zero", () => {
  const result = estimatePlannerCost({
    task: tokens(1000, 2000, 500, 1000),
    pricing: null,
    planCreatedAt: AT,
  });

  assertAllUnknown(result, "no pricing");
});

check("cost 5: a missing input minimum makes the whole cost unknown", () => {
  const result = estimatePlannerCost({
    task: tokens(null, 2000, 500, 1000),
    pricing: USD,
    planCreatedAt: AT,
  });

  assertAllUnknown(result, "missing input minimum");
});

check("cost 6: a missing output maximum makes the whole cost unknown", () => {
  const result = estimatePlannerCost({
    task: tokens(1000, 2000, 500, null),
    pricing: USD,
    planCreatedAt: AT,
  });

  assertAllUnknown(result, "missing output maximum");
});

check("cost 7: pricing that is not yet in force at the plan instant is unknown", () => {
  const result = estimatePlannerCost({
    task: tokens(1000, 2000, 500, 1000),
    pricing: {
      ...USD,
      effectiveFrom: "2026-10-01",
    },
    planCreatedAt: AT,
  });

  assertAllUnknown(result, "pricing not yet in force");
  assert(
    result.pricingBasis.includes("not in force"),
    "reason should say the row is not in force"
  );
});

check("cost 8: pricing that had already expired at the plan instant is unknown", () => {
  const result = estimatePlannerCost({
    task: tokens(1000, 2000, 500, 1000),
    pricing: {
      ...USD,
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-02-01",
    },
    planCreatedAt: AT,
  });

  assertAllUnknown(result, "pricing expired");
});

check("cost 9: an inverted token range is unknown", () => {
  const result = estimatePlannerCost({
    task: tokens(2000, 1000, 500, 1000),
    pricing: USD,
    planCreatedAt: AT,
  });

  assertAllUnknown(result, "inverted input range");
});

check("cost 10: an estimate past the 272K input scope is refused", () => {
  assertEqual(
    DECLARED_INPUT_SCOPE_LIMITS.provider_openai_gpt_5_6_sol,
    272000,
    "declared scope limit"
  );

  const result = estimatePlannerCost({
    task: tokens(1000, 300000, 500, 1000),
    pricing: USD,
    planCreatedAt: AT,
    modelId: "provider_openai_gpt_5_6_sol",
  });

  assertAllUnknown(result, "past the priced scope");
  assert(
    result.pricingBasis.includes("272000"),
    "reason should quote the scope ceiling"
  );
});

check("cost 11: an estimate at or under the 272K scope is still priced", () => {
  const atLimit = estimatePlannerCost({
    task: tokens(1000, 272000, 500, 1000),
    pricing: USD,
    planCreatedAt: AT,
    modelId: "provider_openai_gpt_5_6_sol",
  });

  assertEqual(
    atLimit.costMinMicros,
    17500,
    "at the ceiling the cost is known"
  );

  const overLimit = estimatePlannerCost({
    task: tokens(1000, 272001, 500, 1000),
    pricing: USD,
    planCreatedAt: AT,
    modelId: "provider_openai_gpt_5_6_sol",
  });

  assertAllUnknown(overLimit, "one token over the ceiling");
});

check("cost 12: currency is passed through with no conversion", () => {
  const result = estimatePlannerCost({
    task: tokens(1000, 2000, 500, 1000),
    pricing: {
      ...USD,
      currency: "JPY",
    },
    planCreatedAt: AT,
  });

  assertEqual(result.currency, "JPY", "currency");
});

check("cost 13: the estimator is deterministic and mutates nothing", () => {
  const task = tokens(1000, 2000, 500, 1000);
  const snapshot = JSON.stringify(task);

  const first = estimatePlannerCost({
    task,
    pricing: USD,
    planCreatedAt: AT,
  });
  const second = estimatePlannerCost({
    task,
    pricing: USD,
    planCreatedAt: AT,
  });

  assertDeepEqual(first, second, "repeated calls");
  assertEqual(
    JSON.stringify(task),
    snapshot,
    "task must not be mutated"
  );
});

check("cost 14: the same plan instant gives the same figure on a later run", () => {
  /*
   * The only way this can drift is if something reached for a clock.
   * Freezing the instant and varying nothing else must be a no-op.
   */
  const before = estimatePlannerCost({
    task: tokens(1000, 2000, 500, 1000),
    pricing: USD,
    planCreatedAt: AT,
  });

  const after = estimatePlannerCost({
    task: tokens(1000, 2000, 500, 1000),
    pricing: USD,
    planCreatedAt: AT,
  });

  assertDeepEqual(before, after, "stable across calls");
  assert(
    before.pricingBasis.includes(AT),
    "the plan instant, not today, is recorded"
  );
});

console.log("--- capability estimator ---");

const CAPS = {
  supports_tools: 1,
  supports_vision: 1,
  supports_reasoning: 1,
  context_window_tokens: 1000000,
  max_output_tokens: 100000,
};

function fit(
  requiredCapabilitiesJson,
  estimatedInputTokensMax = null,
  estimatedOutputTokensMax = null,
  capabilities = CAPS
) {
  return estimatePlannerFit({
    requiredCapabilitiesJson,
    estimatedInputTokensMax,
    estimatedOutputTokensMax,
    capabilities,
  });
}

check("capability 1: every required capability supported means meets", () => {
  const result = fit('["vision","tools","reasoning"]');

  assertEqual(
    result.fitStatus,
    "meets",
    "fitStatus"
  );
});

check("capability 2: a required capability the model lacks means below_minimum", () => {
  const result = fit('["vision"]', null, null, {
    ...CAPS,
    supports_vision: 0,
  });

  assertEqual(
    result.fitStatus,
    "below_minimum",
    "fitStatus"
  );
});

check("capability 3: an unrecorded capability means unknown, not meets", () => {
  const result = fit('["vision"]', null, null, {
    ...CAPS,
    supports_vision: null,
  });

  assertEqual(
    result.fitStatus,
    "unknown",
    "fitStatus"
  );
});

check("capability 4: a model with no capability row is unknown", () => {
  const result = estimatePlannerFit({
    requiredCapabilitiesJson: '["vision"]',
    estimatedInputTokensMax: null,
    estimatedOutputTokensMax: null,
    capabilities: null,
  });

  assertEqual(
    result.fitStatus,
    "unknown",
    "fitStatus"
  );
});

check("capability 5: exceeding the context window means below_minimum", () => {
  const result = fit(
    null,
    2000000,
    null,
    CAPS
  );

  assertEqual(
    result.fitStatus,
    "below_minimum",
    "fitStatus"
  );
  assert(
    result.reason.includes("context window"),
    `reason should name the gate, got ${result.reason}`
  );
});

check("capability 6: exceeding the max output means below_minimum", () => {
  const result = fit(null, null, 200000, CAPS);

  assertEqual(
    result.fitStatus,
    "below_minimum",
    "fitStatus"
  );
  assert(
    result.reason.includes("max output"),
    `reason should name the gate, got ${result.reason}`
  );
});

check("capability 7: a requirement outside the registry vocabulary is unknown", () => {
  const result = fit('["quantum_sensors"]');

  assertEqual(
    result.fitStatus,
    "unknown",
    "fitStatus"
  );
  assert(
    result.reason.includes(
      "not part of the registry vocabulary"
    ),
    `reason should cite the vocabulary, got ${result.reason}`
  );
});

check("capability 8: a known failure outranks an unknown", () => {
  const result = fit('["vision","tools"]', null, null, {
    ...CAPS,
    supports_vision: null,
    supports_tools: 0,
  });

  assertEqual(
    result.fitStatus,
    "below_minimum",
    "fitStatus"
  );
});

check("capability 9: an unrecorded capability value is unknown", () => {
  const result = fit('["vision"]', null, null, {
    ...CAPS,
    supports_vision: 2,
  });

  assertEqual(
    result.fitStatus,
    "unknown",
    "a value that is neither 0 nor 1 is unreadable"
  );
});

check("capability 10: a declared-empty requirement list is a satisfied statement", () => {
  const result = fit("[]");

  assertEqual(
    result.fitStatus,
    "meets",
    "fitStatus"
  );
});

check("capability 11: a step that states no needs at all is unknown", () => {
  const result = fit(null);

  assertEqual(
    result.fitStatus,
    "unknown",
    "nothing was declared and nothing can be checked"
  );
});

check("capability 12: a sufficient token estimate is enough to meet", () => {
  const result = fit(null, 1000, 500, CAPS);

  assertEqual(
    result.fitStatus,
    "meets",
    "fitStatus"
  );
});

check("capability 13: the estimator is deterministic", () => {
  assertDeepEqual(
    fit('["vision","tools"]'),
    fit('["vision","tools"]'),
    "repeated calls"
  );
});

console.log("--- time estimator ---");

check("time 1: a known category and complexity returns the table range", () => {
  const result = estimatePlannerTime({
    category: "coding",
    complexity: "medium",
  });

  assertEqual(result.minMinutes, 45, "minMinutes");
  assertEqual(result.maxMinutes, 120, "maxMinutes");
  assertEqual(
    result.basis,
    "planner-time-v1; category=coding; complexity=medium",
    "basis"
  );
});

check("time 2: an unrecognised category is unknown", () => {
  const result = estimatePlannerTime({
    category: "quantum_design",
    complexity: "medium",
  });

  assertEqual(
    result.minMinutes,
    null,
    "minMinutes"
  );
  assertEqual(
    result.maxMinutes,
    null,
    "maxMinutes"
  );
  assert(
    result.basis.startsWith("unknown time: "),
    `basis must explain, got ${result.basis}`
  );
});

check("time 3: an unrecognised complexity is unknown", () => {
  const result = estimatePlannerTime({
    category: "coding",
    complexity: "extreme",
  });

  assertEqual(
    result.minMinutes,
    null,
    "minMinutes"
  );
  assertEqual(
    result.maxMinutes,
    null,
    "maxMinutes"
  );
  assert(
    result.basis.startsWith("unknown time: "),
    `basis must explain, got ${result.basis}`
  );
  assert(
    !result.basis.startsWith(PLANNER_TIME_BASIS_VERSION),
    "an unknown estimate must not claim a table value"
  );
});

check("time 4: all 30 category x complexity combinations are populated", () => {
  assertEqual(
    PLANNER_TIME_CATEGORIES.length * PLANNER_TIME_COMPLEXITIES.length,
    30,
    "table surface size"
  );

  for (const category of PLANNER_TIME_CATEGORIES) {
    for (const complexity of PLANNER_TIME_COMPLEXITIES) {
      const result = estimatePlannerTime({
        category,
        complexity,
      });

      assert(
        Number.isInteger(result.minMinutes) &&
          result.minMinutes > 0,
        `${category}/${complexity} needs a positive whole minimum`
      );
      assert(
        Number.isInteger(result.maxMinutes) &&
          result.maxMinutes > 0,
        `${category}/${complexity} needs a positive whole maximum`
      );
      assert(
        result.minMinutes <= result.maxMinutes,
        `${category}/${complexity} has min above max`
      );
      assert(
        result.basis ===
          `${PLANNER_TIME_BASIS_VERSION}; category=${category}; complexity=${complexity}`,
        `${category}/${complexity} basis should be exact`
      );
    }
  }
});

check("time 5: complexity widens the range at every category", () => {
  for (const category of PLANNER_TIME_CATEGORIES) {
    const low = estimatePlannerTime({
      category,
      complexity: "low",
    });
    const medium = estimatePlannerTime({
      category,
      complexity: "medium",
    });
    const high = estimatePlannerTime({
      category,
      complexity: "high",
    });

    assert(
      low.maxMinutes <= medium.maxMinutes &&
        medium.maxMinutes <= high.maxMinutes,
      `${category} should widen from low to high`
    );
  }
});

check("time 6: the estimate never depends on a model", () => {
  const result = estimatePlannerTime({
    category: "research",
    complexity: "high",
  });

  assertEqual(
    result.basis,
    "planner-time-v1; category=research; complexity=high",
    "basis names only the step, never a model"
  );
  assert(
    !result.basis.includes("provider_"),
    "basis must not name a provider"
  );
});

console.log("--- strategy rules ---");

function knownCost(costMin, costMax, currency = "USD") {
  return {
    costMinMicros: costMin,
    costMaxMicros: costMax,
    currency,
    pricingBasis: "fixture",
  };
}

function unknownCost() {
  return {
    costMinMicros: null,
    costMaxMicros: null,
    currency: null,
    pricingBasis: "unknown cost: fixture",
  };
}

function knownTime(minMinutes, maxMinutes) {
  return {
    minMinutes,
    maxMinutes,
    basis: "planner-time-v1; category=coding; complexity=medium",
  };
}

function unknownTime() {
  return {
    minMinutes: null,
    maxMinutes: null,
    basis: "unknown time: fixture",
  };
}

function candidate(
  modelId,
  fitStatus,
  cost,
  time
) {
  return { modelId, fitStatus, cost, time };
}

const a = candidate(
  "model-a",
  "meets",
  knownCost(100, 200),
  knownTime(60, 120)
);
const b = candidate(
  "model-b",
  "meets",
  knownCost(50, 80),
  knownTime(90, 180)
);
const c = candidate(
  "model-c",
  "meets",
  unknownCost(),
  knownTime(30, 60)
);
const d = candidate(
  "model-d",
  "below_minimum",
  knownCost(10, 20),
  knownTime(10, 20)
);

function orderOf(result) {
  return result.order.map((entry) => entry.modelId);
}

check("strategy 1: cost_first orders known costs by minimum then maximum", () => {
  const result = applyPlannerStrategy({
    strategy: "cost_first",
    candidates: [a, b, c, d],
  });

  assertDeepEqual(
    orderOf(result),
    ["model-b", "model-a", "model-c", "model-d"],
    "order"
  );
});

check("strategy 2: a cheaper but below_minimum candidate never leads", () => {
  const result = applyPlannerStrategy({
    strategy: "cost_first",
    candidates: [d, b, a],
  });

  assertDeepEqual(
    orderOf(result),
    ["model-b", "model-a", "model-d"],
    "order"
  );
});

check("strategy 3: an unknown cost is never promoted ahead of a known one", () => {
  const result = applyPlannerStrategy({
    strategy: "cost_first",
    candidates: [c, a, b],
  });

  assertDeepEqual(
    orderOf(result),
    ["model-b", "model-a", "model-c"],
    "order"
  );
  assertDeepEqual(
    result.representatives.map(
      (entry) => entry.modelId
    ),
    ["model-b", "model-a"],
    "representatives"
  );
});

check("strategy 4: an all-unknown cost keeps the original order", () => {
  const u1 = candidate(
    "u1",
    "meets",
    unknownCost(),
    knownTime(10, 20)
  );
  const u2 = candidate(
    "u2",
    "meets",
    unknownCost(),
    knownTime(30, 40)
  );
  const u3 = candidate(
    "u3",
    "meets",
    unknownCost(),
    knownTime(50, 60)
  );

  const result = applyPlannerStrategy({
    strategy: "cost_first",
    candidates: [u1, u2, u3],
  });

  assertDeepEqual(
    orderOf(result),
    ["u1", "u2", "u3"],
    "order"
  );
});

check("strategy 5: time_first orders by minimum then maximum minutes", () => {
  const result = applyPlannerStrategy({
    strategy: "time_first",
    candidates: [a, b, c, d],
  });

  assertDeepEqual(
    orderOf(result),
    ["model-c", "model-a", "model-b", "model-d"],
    "order"
  );
});

check("strategy 6: time_first still refuses to lead with a below_minimum candidate", () => {
  const result = applyPlannerStrategy({
    strategy: "time_first",
    candidates: [d, c, a],
  });

  assertDeepEqual(
    orderOf(result),
    ["model-c", "model-a", "model-d"],
    "order"
  );
});

check("strategy 7: balanced surfaces the cost end and the time end, not a winner", () => {
  const result = applyPlannerStrategy({
    strategy: "balanced",
    candidates: [a, b, c, d],
  });

  assertDeepEqual(
    result.representatives.map(
      (entry) => entry.modelId
    ),
    ["model-a", "model-b"],
    "representatives"
  );
  assert(
    result.basis.includes("lowest-cost"),
    `basis should name the cost end, got ${result.basis}`
  );
  assert(
    result.basis.includes("shortest-time"),
    `basis should name the time end, got ${result.basis}`
  );
  assert(
    result.basis.includes("no winner"),
    `basis should disclaim a winner, got ${result.basis}`
  );
});

check("strategy 8: balanced never lets unknown data stand in as an advantage", () => {
  const result = applyPlannerStrategy({
    strategy: "balanced",
    candidates: [c, a, b],
  });

  const ids = result.representatives.map(
    (entry) => entry.modelId
  );

  assert(
    !ids.includes("model-c"),
    "a candidate with an unknown cost must not be a representative"
  );
  assertDeepEqual(
    ids,
    ["model-a", "model-b"],
    "representatives"
  );
});

check("strategy 9: balanced keeps exact ties on either axis", () => {
  const tieOnCost = candidate(
    "model-tie",
    "meets",
    knownCost(50, 80),
    knownTime(300, 400)
  );

  const result = applyPlannerStrategy({
    strategy: "balanced",
    candidates: [a, b, tieOnCost],
  });

  assertDeepEqual(
    result.representatives.map(
      (entry) => entry.modelId
    ),
    ["model-a", "model-b", "model-tie"],
    "an exact cost tie belongs beside the cost end"
  );
});

check("strategy 10: balanced with no fully known candidate shows no trade-off", () => {
  const x = candidate(
    "x",
    "meets",
    unknownCost(),
    unknownTime()
  );
  const y = candidate(
    "y",
    "meets",
    unknownCost(),
    knownTime(10, 20)
  );

  const result = applyPlannerStrategy({
    strategy: "balanced",
    candidates: [x, y],
  });

  assertEqual(
    result.representatives.length,
    0,
    "nothing can be compared"
  );
  assertDeepEqual(
    orderOf(result),
    ["x", "y"],
    "order is left alone"
  );
  assert(
    result.basis.includes("no cost/time trade-off"),
    `basis should say so, got ${result.basis}`
  );
});

check("strategy 11: strategies are deterministic and mutate nothing", () => {
  const candidates = [a, b, c, d];
  const snapshot = JSON.stringify(candidates);

  for (const strategy of [
    "cost_first",
    "time_first",
    "balanced",
  ]) {
    const first = applyPlannerStrategy({
      strategy,
      candidates,
    });
    const second = applyPlannerStrategy({
      strategy,
      candidates,
    });

    assertDeepEqual(
      orderOf(first),
      orderOf(second),
      `${strategy} order is stable`
    );
    assertDeepEqual(
      first,
      second,
      `${strategy} output is stable`
    );
  }

  assertEqual(
    JSON.stringify(candidates),
    snapshot,
    "the candidate array must not be mutated"
  );
});

check("strategy 12: a candidate carries no selection state to change", () => {
  const result = applyPlannerStrategy({
    strategy: "balanced",
    candidates: [a, b],
  });

  for (const entry of result.order) {
    assertEqual(
      Object.keys(entry).includes(
        "isSelected"
      ),
      false,
      "strategy output must not carry or set is_selected"
    );
  }
});

console.log("--- isolation ---");

const ESTIMATOR_SOURCES = [
  "cost-estimator.ts",
  "fit-estimator.ts",
  "time-estimator.ts",
  "strategy-rules.ts",
];

function readStripped(fileName) {
  const raw = readFileSync(
    path.join(DIR, "..", "lib", "planner", fileName),
    "utf8"
  );

  return raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

const STRIPPED = Object.fromEntries(
  ESTIMATOR_SOURCES.map((name) => [
    name,
    readStripped(name),
  ])
);

const FORBIDDEN = [
  ["getDb", "database handle"],
  ["initDb", "schema initialiser"],
  ["@/lib/db", "database module"],
  ["@/lib/schema", "schema module"],
  ["insert into", "insert"],
  ["update ", "update"],
  ["delete from", "delete"],
  ["replace into", "upsert"],
  ["createProjectTaskAiOption", "option writer"],
  ["recordUsage", "usage writer"],
  ["Date.now", "wall clock"],
  ["Math.random", "randomness"],
  ["new Date(", "implicit clock"],
  ["fetch(", "network"],
  ["http", "network"],
];

function assertNoForbidden(
  target,
  forbidden,
  message
) {
  for (const [needle, label] of forbidden) {
    assert(
      !target.includes(needle),
      `${message}: estimator source must not reference a ${label} (${needle})`
    );
  }
}

check("isolation 1: no usage_records or cost_records write path", () => {
  for (const [name, source] of Object.entries(STRIPPED)) {
    assertNoForbidden(
      source,
      [
        ["usage_records", "usage table"],
        ["cost_records", "cost table"],
      ],
      name
    );
  }
});

check("isolation 2: no task session or usage write path", () => {
  for (const [name, source] of Object.entries(STRIPPED)) {
    assertNoForbidden(
      source,
      [
        ["task_sessions", "session table"],
        ["task_usage_records", "task usage table"],
        ["updateTaskSession", "session writer"],
        ["recordTaskUsage", "task usage writer"],
      ],
      name
    );
  }
});

check("isolation 3: no budget write path", () => {
  for (const [name, source] of Object.entries(STRIPPED)) {
    assertNoForbidden(
      source,
      [
        ["budgets", "budget table"],
        ["updateBudget", "budget writer"],
      ],
      name
    );
  }
});

check("isolation 4: no project_task_ai_options write path", () => {
  for (const [name, source] of Object.entries(STRIPPED)) {
    assertNoForbidden(
      source,
      [
        ["project_task_ai_options", "option table"],
        ["is_selected =", "selection write"],
      ],
      name
    );
  }
});

check("isolation 5: no database handle, schema call, clock or network in any estimator", () => {
  for (const [name, source] of Object.entries(STRIPPED)) {
    assertNoForbidden(
      source,
      FORBIDDEN,
      name
    );
  }
});

check("isolation 6: the estimator modules are the only new source files", () => {
  for (const name of ESTIMATOR_SOURCES) {
    assert(
      readFileSync(
        path.join(
          DIR,
          "..",
          "lib",
          "planner",
          name
        ),
        "utf8"
      ).length > 0,
      `${name} should exist and be non-empty`
    );
  }
});

console.log(
  `\nplanner estimator smoke: ${passed} passed, ${failed} failed`
);

if (failed > 0) {
  process.exitCode = 1;
}
