/*
 * R2 Phase 3.3-A Planner combination rules smoke test.
 *
 * Touches no database. Every task and resource below is a literal
 * fixture shaped like the rows the planner reads, and every assertion
 * runs on them in memory. Neither data/ai-token-cost-monitor.db nor
 * any other database is opened, read or created.
 */
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import {
  fileURLToPath,
  pathToFileURL,
} from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

register(
  pathToFileURL(
    path.join(DIR, "ts-smoke-loader.mjs")
  ).href,
  import.meta.url
);

const { evaluateCombinations } = await import(
  "../lib/planner/combination-rules.ts"
);
const { derivePlannerRole } = await import(
  "../lib/planner/combination-rules.ts"
);
const { COMBINATION_STRATEGIES } = await import(
  "../lib/planner/combination-rules.ts"
);
const { estimatePlannerCost } = await import(
  "../lib/planner/cost-estimator.ts"
);
const { estimatePlannerTime } = await import(
  "../lib/planner/time-estimator.ts"
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

const TASK = {
  projectTaskId: "T1",
  category: "coding",
  complexity: "medium",
  requiredCapabilitiesJson: '["tools"]',
  estimatedInputTokensMin: 1000,
  estimatedInputTokensMax: 4000,
  estimatedOutputTokensMin: 500,
  estimatedOutputTokensMax: 2000,
};

function capabilities(overrides = {}) {
  return {
    supports_tools: 1,
    supports_vision: 1,
    supports_reasoning: 1,
    context_window_tokens: 1000000,
    max_output_tokens: 100000,
    ...overrides,
  };
}

function pricing(overrides = {}) {
  return {
    id: "fixture_pricing_2026-09-27",
    currency: "USD",
    inputPerMillion: 4,
    outputPerMillion: 20,
    effectiveFrom: "2026-09-27",
    effectiveTo: null,
    ...overrides,
  };
}

function res(id, overrides = {}) {
  return {
    candidateResourceId: id,
    source: "registered",
    modelId: `model-${id}`,
    modelName: `model ${id}`,
    providerName: "Fixture",
    toolId: `tool-${id}`,
    toolName: `tool ${id}`,
    accessMethod: "pay_as_you_go",
    entitlementConfirmed: false,
    capabilities: capabilities(),
    pricing: pricing({ id: `pricing-${id}` }),
    ...overrides,
  };
}

function plansFor(evaluation) {
  return evaluation.plans;
}

function idsOf(plan) {
  return plan.assignments.map(
    (assignment) => assignment.candidateResourceId
  );
}

function assignmentFor(plan, projectTaskId, role) {
  const found = plan.assignments.find(
    (assignment) =>
      assignment.projectTaskId === projectTaskId &&
      assignment.role === role
  );

  if (found === undefined) {
    throw new Error(
      `no assignment for ${projectTaskId}/${role}`
    );
  }

  return found;
}

function totalJson(plans) {
  return JSON.stringify(plans).toLowerCase();
}

/*
 * "free_tier" legitimately contains "tier", so a raw substring scan for
 * grading vocabulary would flag the access-method column itself. Match
 * whole words instead: an underscore is a word character, so "free_tier"
 * never trips \btier\b.
 */
function hasGradingWord(text) {
  return [
    "score",
    "rank",
    "ranked",
    "ranking",
    "winner",
    "best",
    "recommend",
    "recommended",
    "quality",
    "confidence",
    "tier",
    "weight",
    "pareto",
    "leaderboard",
  ].some((word) =>
    new RegExp(`\\b${word}\\b`, "i").test(text)
  );
}

console.log("--- exactly five plans ---");

const ROLE_TASK = {
  ...TASK,
  roleAssignments: [
    { role: "implementer" },
    { role: "reviewer" },
  ],
};

const FIVE = [
  res("a"),
  res("b", {
    accessMethod: "subscription",
    entitlementConfirmed: true,
  }),
  res("c", {
    accessMethod: "free_tier",
    entitlementConfirmed: true,
  }),
  res("d", { source: "registry" }),
  res("e", {
    source: "registry",
    accessMethod: "subscription",
    entitlementConfirmed: false,
  }),
];

function evaluateFive() {
  return evaluateCombinations({
    planCreatedAt: PLAN_CREATED_AT,
    tasks: [ROLE_TASK],
    resources: FIVE,
  });
}

check("1: the five strategies yield five distinct labelled plans", () => {
  const plans = plansFor(evaluateFive());

  assertEqual(plans.length, 5, "plan count");

  assertDeepEqual(
    plans.map((plan) => plan.label),
    ["Plan A", "Plan B", "Plan C", "Plan D", "Plan E"],
    "neutral labels"
  );

  assertDeepEqual(
    plans.map((plan) => plan.strategy),
    [
      "existing",
      "cost_conscious",
      "mixed",
      "subscription",
      "registry_expanded",
    ],
    "strategy order"
  );
});

check("2: every plan has a distinct deterministic mapping key", () => {
  const plans = plansFor(evaluateFive());

  const keys = plans.map((plan) => plan.mappingKey);

  assertEqual(new Set(keys).size, 5, "all keys distinct");

  assertEqual(
    keys[0],
    "T1|implementer|a;T1|reviewer|a",
    "existing key is a real assignment mapping"
  );
});

check("3: each strategy picks the resource its rule promises", () => {
  const plans = plansFor(evaluateFive());

  const expectedIds = [
    ["a", "a"],
    ["b", "b"],
    ["a", "b"],
    ["c", "c"],
    ["d", "d"],
  ];

  for (let index = 0; index < plans.length; index++) {
    assertDeepEqual(
      idsOf(plans[index]),
      expectedIds[index],
      `${plans[index].strategy} picks`
    );
  }
});

check("4: user-declared roles and sources carry through", () => {
  const plan = plansFor(evaluateFive())[0];

  const implementer = assignmentFor(plan, "T1", "implementer");

  assertEqual(
    implementer.roleSource,
    "user",
    "implementer role source"
  );

  const reviewer = assignmentFor(plan, "T1", "reviewer");

  assertEqual(
    reviewer.role,
    "reviewer",
    "reviewer role"
  );
  assertEqual(
    reviewer.roleSource,
    "user",
    "reviewer role source"
  );
});

check("5: every assignment reports a tri-state fit with a reason", () => {
  for (const plan of plansFor(evaluateFive())) {
    for (const assignment of plan.assignments) {
      assertEqual(
        assignment.fitStatus,
        "meets",
        `${plan.strategy}/${assignment.candidateResourceId} fit`
      );
      assert(
        typeof assignment.fitReason === "string" &&
          assignment.fitReason.length > 0,
        `${plan.strategy} fitReason present`
      );
    }
  }
});

check("6: out-of-pocket is 0 for confirmed free/sub, api-priced for payg", () => {
  const plans = plansFor(evaluateFive());

  const b = assignmentFor(plans[1], "T1", "implementer");

  assertDeepEqual(
    [b.outOfPocket.costMinMicros, b.outOfPocket.costMaxMicros],
    [0, 0],
    "confirmed subscription is free out-of-pocket"
  );
  assertEqual(
    b.outOfPocket.currency,
    "USD",
    "oop currency follows the api-equivalent currency"
  );

  const a = assignmentFor(plans[0], "T1", "implementer");

  assertEqual(
    a.outOfPocket.costMinMicros,
    a.apiEquivalent.costMinMicros,
    "payg out-of-pocket equals api-equivalent"
  );
  assertEqual(
    a.outOfPocket.costMaxMicros,
    a.apiEquivalent.costMaxMicros,
    "payg out-of-pocket max"
  );

  const single = plansFor(
    evaluateCombinations({
      planCreatedAt: PLAN_CREATED_AT,
      tasks: [ROLE_TASK],
      resources: [
        res("g", {
          source: "registry",
          accessMethod: "free_tier",
          entitlementConfirmed: false,
        }),
      ],
    })
  )[0];

  const g = assignmentFor(single, "T1", "implementer");

  assertEqual(
    g.outOfPocket.costMinMicros,
    null,
    "unconfirmed free entitlement is unknown, not zero"
  );
  assert(
    g.outOfPocket.basis.includes("not confirmed"),
    `the basis should say why, got ${g.outOfPocket.basis}`
  );
});

check("7: api-equivalent cost matches the cost estimator exactly", () => {
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
  });

  const plan = plansFor(evaluateFive())[0];
  const a = assignmentFor(plan, "T1", "implementer");

  assertEqual(
    a.apiEquivalent.costMinMicros,
    direct.costMinMicros,
    "min matches the estimator"
  );
  assertEqual(
    a.apiEquivalent.costMaxMicros,
    direct.costMaxMicros,
    "max matches the estimator"
  );
  assertEqual(
    a.apiEquivalent.costMinMicros,
    14000,
    "min arithmetic"
  );
  assertEqual(
    a.apiEquivalent.costMaxMicros,
    56000,
    "max arithmetic"
  );
  assertEqual(
    a.apiEquivalent.currency,
    "USD",
    "currency"
  );
});

check("8: plan api-equivalent totals sum every assignment", () => {
  const plan = plansFor(evaluateFive())[1];

  assertDeepEqual(
    [
      plan.apiEquivalentTotals.costMinMicros,
      plan.apiEquivalentTotals.costMaxMicros,
      plan.apiEquivalentTotals.currency,
    ],
    [28000, 112000, "USD"],
    "two assignments sum to 14000/56000 each"
  );
});

check("9: plan out-of-pocket totals are exact micros, not floats", () => {
  const plan = plansFor(evaluateFive())[1];

  assertDeepEqual(
    [
      plan.outOfPocketTotals.costMinMicros,
      plan.outOfPocketTotals.costMaxMicros,
      plan.outOfPocketTotals.currency,
    ],
    [0, 0, "USD"],
    "two zero-oop assignments"
  );
});

check("10: plans carry no grading vocabulary anywhere", () => {
  const json = totalJson(plansFor(evaluateFive()));

  assert(
    !hasGradingWord(json),
    "plans must not contain grading vocabulary"
  );
});

check("11: evaluation is byte-for-byte reproducible and never mutates input", () => {
  const resources = structuredClone(FIVE);
  const snapshot = JSON.stringify(resources);

  const first = evaluateCombinations({
    planCreatedAt: PLAN_CREATED_AT,
    tasks: [ROLE_TASK],
    resources,
  });
  const second = evaluateCombinations({
    planCreatedAt: PLAN_CREATED_AT,
    tasks: [ROLE_TASK],
    resources,
  });

  assertDeepEqual(first, second, "reproducible");

  assertEqual(
    JSON.stringify(resources),
    snapshot,
    "supplied resources untouched"
  );
});

check("12: the frozen instant and strategy names are echoed for auditing", () => {
  const evaluation = evaluateFive();

  assertEqual(
    evaluation.planCreatedAt,
    PLAN_CREATED_AT,
    "instant echoed"
  );
  assertDeepEqual(
    evaluation.strategies,
    [
      "existing",
      "cost_conscious",
      "mixed",
      "subscription",
      "registry_expanded",
    ],
    "strategy list"
  );
  assertEqual(
    evaluation.strategies.length,
    COMBINATION_STRATEGIES.length,
    "exported list agrees"
  );
});

check("13: plan notes state that time is project wide, not per model", () => {
  for (const plan of plansFor(evaluateFive())) {
    assert(
      plan.note.includes("same for every plan"),
      `${plan.strategy} note should explain shared time`
    );
  }
});

console.log("--- totals and currencies ---");

const CURRENCY_POOL = [
  res("u1", {
    source: "registered",
    accessMethod: "subscription",
    entitlementConfirmed: true,
  }),
  res("c1", {
    source: "registry",
    pricing: pricing({
      id: "pricing-c1",
      currency: "CNY",
    }),
  }),
  res("d1", {
    source: "registry",
    pricing: null,
  }),
];

function twoCodingTasks() {
  return [
    { ...TASK, projectTaskId: "T1" },
    { ...TASK, projectTaskId: "T2" },
  ];
}

function evaluateCurrency() {
  return evaluateCombinations({
    planCreatedAt: PLAN_CREATED_AT,
    tasks: twoCodingTasks(),
    resources: CURRENCY_POOL,
  });
}

check("14: a cross-currency plan reports null totals, never a merged one", () => {
  const plans = plansFor(evaluateCurrency());

  const mixed = plans.find(
    (plan) => plan.strategy === "mixed"
  );

  assert(mixed !== undefined, "a mixed plan exists");
  assertEqual(
    idsOf(mixed).sort().join(","),
    "c1,u1",
    "the mixed plan spans two request currencies"
  );

  assertEqual(
    mixed.apiEquivalentTotals.costMinMicros,
    null,
    "api totals are null across currencies"
  );
  assertEqual(
    mixed.outOfPocketTotals.costMinMicros,
    null,
    "oop totals are null across currencies"
  );
  assertEqual(
    mixed.apiEquivalentTotals.currency,
    null,
    "no currency is claimed for the blend"
  );
});

check("15: a single-currency plan keeps its totals", () => {
  const plans = plansFor(evaluateCurrency());

  const same = plans.find(
    (plan) => plan.strategy === "existing"
  );

  assert(same !== undefined, "an existing plan exists");
  assertDeepEqual(
    idsOf(same),
    ["u1", "u1"],
    "both steps run on the confirmed subscription"
  );
  assertDeepEqual(
    [
      same.apiEquivalentTotals.costMinMicros,
      same.apiEquivalentTotals.costMaxMicros,
      same.apiEquivalentTotals.currency,
    ],
    [28000, 112000, "USD"],
    "two USD assignments sum cleanly"
  );
});

check("16: an unpriced resource leaves totals unknown, never zero", () => {
  const single = plansFor(
    evaluateCombinations({
      planCreatedAt: PLAN_CREATED_AT,
      tasks: twoCodingTasks(),
      resources: [
        res("d1", { source: "registry", pricing: null }),
      ],
    })
  )[0];

  const d = assignmentFor(single, "T1", "implementer");

  assertEqual(d.apiEquivalent.costMinMicros, null, "api min");
  assertEqual(d.apiEquivalent.costMaxMicros, null, "api max");
  assertEqual(d.apiEquivalent.currency, null, "api currency");
  assertEqual(
    d.outOfPocket.costMinMicros,
    null,
    "oop min"
  );
  assertEqual(
    single.apiEquivalentTotals.costMinMicros,
    null,
    "totals stay null"
  );
  assertEqual(
    single.apiEquivalentTotals.costMaxMicros,
    null,
    "totals max stays null"
  );
  assertEqual(
    d.apiEquivalent.basis.includes("unknown cost"),
    true,
    `the basis must explain, got ${d.apiEquivalent.basis}`
  );
});

console.log("--- capability tri-state ---");

const VISION_TASK = {
  ...TASK,
  requiredCapabilitiesJson: '["vision"]',
};

const CAPABILITY_POOL = [
  res("m", { modelId: "model-m" }),
  res("unk", {
    source: "registry",
    capabilities: null,
  }),
  res("bm", {
    modelId: "model-bm",
    capabilities: capabilities({ supports_vision: 0 }),
  }),
];

function evaluateCapability() {
  return evaluateCombinations({
    planCreatedAt: PLAN_CREATED_AT,
    tasks: [VISION_TASK],
    resources: CAPABILITY_POOL,
  });
}

check("17: below_minimum is never assigned, meets and unknown are", () => {
  const plans = plansFor(evaluateCapability());

  const ids = new Set(plans.flatMap(idsOf));

  assert(
    !ids.has("bm"),
    "a refused model must not appear in any plan"
  );
  assert(
    ids.has("m"),
    "a confirmed match must appear"
  );
  assert(
    ids.has("unk"),
    "an unknown model must stay assignable"
  );
});

check("18: no assignment ever reports below_minimum", () => {
  for (const plan of plansFor(evaluateCapability())) {
    for (const assignment of plan.assignments) {
      assert(
        assignment.fitStatus === "meets" ||
          assignment.fitStatus === "unknown",
        `${plan.strategy} carries ${assignment.fitStatus}`
      );
    }
  }
});

check("19: a step no registry model can run produces zero plans, not an error", () => {
  const evaluation = evaluateCombinations({
    planCreatedAt: PLAN_CREATED_AT,
    tasks: [VISION_TASK],
    resources: [
      res("bm", {
        modelId: "model-bm",
        capabilities: capabilities({ supports_vision: 0 }),
      }),
    ],
  });

  assertEqual(evaluation.plans.length, 0, "no viable plan");
  assert(
    typeof evaluation.note === "string",
    "the evaluation still reports"
  );
});

console.log("--- role derivation ---");

check("20: the category-to-role map is applied for undirected steps", () => {
  const expected = {
    planning: "assistant",
    architecture: "researcher",
    research: "researcher",
    ui_design: "designer",
    coding: "implementer",
    debugging: "implementer",
    testing: "reviewer",
    documentation: "assistant",
    review: "reviewer",
    deployment: "implementer",
  };

  for (const [category, role] of Object.entries(expected)) {
    const derived = derivePlannerRole(category);

    assertEqual(derived.role, role, `${category} role`);
    assertEqual(
      derived.roleSource,
      "default_from_category",
      `${category} role source`
    );
  }

  assertEqual(
    derivePlannerRole("spelunking").role,
    "assistant",
    "an unknown category falls back to assistant"
  );
});

check("21: an undirected coding step is planned as implementer in output", () => {
  const plan = plansFor(
    evaluateCombinations({
      planCreatedAt: PLAN_CREATED_AT,
      tasks: [{ ...TASK, projectTaskId: "T1" }],
      resources: [res("a")],
    })
  )[0];

  const assignment = plan.assignments[0];

  assertEqual(assignment.role, "implementer", "derived role");
  assertEqual(
    assignment.roleSource,
    "default_from_category",
    "derived role source"
  );
});

check("22: duplicate roles in one step are rejected", () => {
  let thrown = null;

  try {
    evaluateCombinations({
      planCreatedAt: PLAN_CREATED_AT,
      tasks: [
        {
          ...TASK,
          roleAssignments: [
            { role: "implementer" },
            { role: "implementer" },
          ],
        },
      ],
      resources: [res("a")],
    });
  } catch (error) {
    thrown = error;
  }

  assert(
    thrown instanceof Error &&
      thrown.message.includes("duplicate role"),
    `expected a duplicate-role error, got ${String(thrown)}`
  );
});

check("23: a role outside the closed set is rejected", () => {
  let thrown = null;

  try {
    evaluateCombinations({
      planCreatedAt: PLAN_CREATED_AT,
      tasks: [
        {
          ...TASK,
          roleAssignments: [{ role: "iceman" }],
        },
      ],
      resources: [res("a")],
    });
  } catch (error) {
    thrown = error;
  }

  assert(
    thrown instanceof Error &&
      thrown.message.includes('invalid role "iceman"'),
    `expected an invalid-role error, got ${String(thrown)}`
  );
});

check("24: an invalid plan instant is rejected", () => {
  let thrown = null;

  try {
    evaluateCombinations({
      planCreatedAt: "not-a-date",
      tasks: [ROLE_TASK],
      resources: FIVE,
    });
  } catch (error) {
    thrown = error;
  }

  assert(
    thrown instanceof Error &&
      thrown.message.includes("not a valid instant"),
    `expected an instant error, got ${String(thrown)}`
  );
});

console.log("--- pool normalisation ---");

check("25: duplicate rows collapse to the first occurrence", () => {
  const plans = plansFor(
    evaluateCombinations({
      planCreatedAt: PLAN_CREATED_AT,
      tasks: [ROLE_TASK],
      resources: [
        res("x1"),
        res("x2", {
          modelId: "model-x1",
          toolId: "tool-x1",
        }),
      ],
    })
  );

  const ids = new Set(plans.flatMap(idsOf));

  assert(
    ids.has("x1"),
    "the first row survives"
  );
  assert(
    !ids.has("x2"),
    "the duplicate row is removed"
  );
});

check("26: the same model with two access methods stays two resources", () => {
  const plans = plansFor(
    evaluateCombinations({
      planCreatedAt: PLAN_CREATED_AT,
      tasks: [ROLE_TASK],
      resources: [
        res("sub", {
          modelId: "model-m",
          toolId: "tool-m",
          accessMethod: "subscription",
          entitlementConfirmed: true,
        }),
        res("pay", {
          modelId: "model-m",
          toolId: "tool-m",
          accessMethod: "pay_as_you_go",
        }),
      ],
    })
  );

  const ids = new Set(plans.flatMap(idsOf));

  assert(
    ids.has("sub"),
    "the subscription row is reachable"
  );
  assert(
    ids.has("pay"),
    "the pay-as-you-go row is reachable"
  );

  const onlySub = plans.find((plan) =>
    idsOf(plan).every((id) => id === "sub")
  );
  const onlyPay = plans.find((plan) =>
    idsOf(plan).every((id) => id === "pay")
  );
  const spansBoth = plans.find((plan) => {
    const set = new Set(idsOf(plan));
    return set.has("sub") && set.has("pay");
  });

  assert(
    onlySub !== undefined,
    "a subscription-only plan exists"
  );
  assert(
    onlyPay !== undefined,
    "a pay-as-you-go-only plan exists"
  );
  assert(
    spansBoth !== undefined,
    "a plan spans both rows"
  );
});

console.log("--- time ---");

check("27: project time is the sequential sum of per-step ranges", () => {
  const single = evaluateCombinations({
    planCreatedAt: PLAN_CREATED_AT,
    tasks: [{ ...TASK, projectTaskId: "T1" }],
    resources: [res("a")],
  });

  assertEqual(
    single.totalEstimatedMinMinutes,
    45,
    "coding/medium minimum"
  );
  assertEqual(
    single.totalEstimatedMaxMinutes,
    120,
    "coding/medium maximum"
  );

  const double = evaluateCombinations({
    planCreatedAt: PLAN_CREATED_AT,
    tasks: [
      { ...TASK, projectTaskId: "T1" },
      {
        ...TASK,
        projectTaskId: "T2",
        category: "testing",
        complexity: "low",
      },
    ],
    resources: [res("a")],
  });

  const direct = estimatePlannerTime({
    category: "testing",
    complexity: "low",
  });

  assertEqual(
    double.totalEstimatedMinMinutes,
    45 + direct.minMinutes,
    "two-step minimum"
  );
  assertEqual(
    double.totalEstimatedMaxMinutes,
    120 + direct.maxMinutes,
    "two-step maximum"
  );
});

check("28: time is identical across every plan of one evaluation", () => {
  const evaluation = evaluateFive();

  for (const plan of evaluation.plans) {
    assertEqual(
      plan.totalEstimatedMinMinutes,
      evaluation.totalEstimatedMinMinutes,
      `${plan.strategy} min`
    );
    assertEqual(
      plan.totalEstimatedMaxMinutes,
      evaluation.totalEstimatedMaxMinutes,
      `${plan.strategy} max`
    );
  }
});

check("29: a step outside the time vocabulary makes the total unknown", () => {
  const evaluation = evaluateCombinations({
    planCreatedAt: PLAN_CREATED_AT,
    tasks: [
      {
        ...TASK,
        category: "spelunking",
      },
    ],
    resources: [res("a")],
  });

  assertEqual(
    evaluation.totalEstimatedMinMinutes,
    null,
    "total min unknown"
  );
  assertEqual(
    evaluation.totalEstimatedMaxMinutes,
    null,
    "total max unknown"
  );
  assert(
    evaluation.timeBasis.includes("planner-time-v1"),
    `basis should name the version, got ${evaluation.timeBasis}`
  );
});

console.log("--- source integrity ---");

const SOURCE = readFileSync(
  path.join(
    DIR,
    "..",
    "lib",
    "planner",
    "combination-rules.ts"
  ),
  "utf8"
);

const CODE = SOURCE
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

check("30: the business code introduces no grading vocabulary", () => {
  for (const forbidden of [
    "score",
    "rank",
    "ranking",
    "winner",
    "best",
    "recommend",
    "recommended",
    "quality",
    "confidence",
    "tier",
    "weight",
    "pareto",
    "leaderboard",
  ]) {
    assert(
      !new RegExp(`\\b${forbidden}\\b`, "i").test(CODE),
      `combination-rules must not introduce "${forbidden}"`
    );
  }

  for (const forbidden of [
    "auto-select",
    "autoSelect",
    "apiKey",
    "credential",
  ]) {
    assert(
      !CODE.includes(forbidden),
      `combination-rules must not introduce "${forbidden}"`
    );
  }
});

check("31: no database, clock, network or model call in the business code", () => {
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
      `combination-rules must not reference ${forbidden}`
    );
  }
});

check("32: the three existing estimators are the only estimation source", () => {
  for (const required of [
    "estimatePlannerFit",
    "estimatePlannerCost",
    "estimatePlannerTime",
    "PLANNER_TIME_BASIS_VERSION",
  ]) {
    assert(
      CODE.includes(required),
      `combination-rules must call ${required}`
    );
  }
});

check("33: combination-rules never imports another planner layer", () => {
  for (const forbidden of [
    "strategy-rules",
    "candidate-generator",
    "applyPlannerStrategy",
  ]) {
    assert(
      !SOURCE.includes(forbidden),
      `combination-rules must not import ${forbidden}`
    );
  }
});

check("34: the repository is referenced type-only, never loaded for data", () => {
  const statements = SOURCE.match(
    /import\s+(type\s+)?\{[\s\S]*?\}\s*from\s*["']@\/lib\/repositories\/planner-repository["']/g
  );

  assert(
    Array.isArray(statements) && statements.length > 0,
    "the FitStatus type should still be referenced"
  );

  for (const statement of statements) {
    assert(
      statement.startsWith("import type"),
      `repository import must be type-only, got: ${statement}`
    );
  }
});

console.log(
  `\nplanner combinations smoke: ${passed} passed, ${failed} failed`
);

if (failed > 0) {
  process.exitCode = 1;
}