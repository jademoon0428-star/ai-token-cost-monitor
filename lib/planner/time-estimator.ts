/*
 * R2 Phase 3.3-B Planner time estimator.
 *
 * A pure function, and deliberately a shallow one.
 *
 * The registry has no per-model latency, throughput or speed column,
 * and inventing one would be dishonest. So this estimator does not
 * accept a model at all: the same planned step gets the same range no
 * matter which model is being considered. That is a feature, not a
 * limitation. A time column that silently varied by model would be
 * claiming a speed ranking that no measurement supports.
 *
 * The range comes from a static, versioned, deliberately wide table
 * keyed only by category and complexity. Wide on purpose: a plan is a
 * commitment, and a range that is too optimistic is worse than no
 * range at all.
 *
 * This is a planning estimate derived from what the step says it is.
 * It is not a benchmark, not an SLA, not a guarantee, and carries no
 * probability distribution.
 */

/*
 * Bump when any number below changes, so a stored plan can always be
 * traced back to the table that produced it.
 */
export const PLANNER_TIME_BASIS_VERSION = "planner-time-v1";

/*
 * Every category the planner may assign, and every complexity it may
 * declare. Both vocabularies are closed: an unrecognised value is an
 * unknown estimate, never a silent default.
 */
const CATEGORIES: ReadonlyArray<string> = Object.freeze([
  "planning",
  "architecture",
  "research",
  "ui_design",
  "coding",
  "debugging",
  "testing",
  "documentation",
  "review",
  "deployment",
]);

const COMPLEXITIES: ReadonlyArray<string> = Object.freeze([
  "low",
  "medium",
  "high",
]);

export type PlannerTimeEstimate = {
  minMinutes: number | null;
  maxMinutes: number | null;
  basis: string | null;
};

type TimeRange = readonly [number, number];

/*
 * planner-time-v1, in whole minutes.
 *
 * Written out in full rather than derived from multipliers, so the
 * whole surface can be read, reviewed and argued about in one screen.
 * Every entry satisfies min <= max.
 */
const TIME_TABLE: Readonly<
  Record<string, Readonly<Record<string, TimeRange>>>
> = Object.freeze({
  planning: {
    low: [10, 20],
    medium: [20, 40],
    high: [40, 90],
  },
  architecture: {
    low: [20, 40],
    medium: [40, 80],
    high: [80, 180],
  },
  research: {
    low: [20, 40],
    medium: [40, 90],
    high: [90, 240],
  },
  ui_design: {
    low: [30, 60],
    medium: [60, 120],
    high: [120, 300],
  },
  coding: {
    low: [20, 45],
    medium: [45, 120],
    high: [120, 360],
  },
  debugging: {
    low: [20, 45],
    medium: [45, 120],
    high: [120, 300],
  },
  testing: {
    low: [15, 30],
    medium: [30, 75],
    high: [75, 210],
  },
  documentation: {
    low: [10, 25],
    medium: [25, 60],
    high: [60, 150],
  },
  review: {
    low: [10, 25],
    medium: [25, 60],
    high: [60, 150],
  },
  deployment: {
    low: [15, 30],
    medium: [30, 75],
    high: [75, 180],
  },
});

/*
 * Estimates how long one planned step is expected to take.
 *
 * Returns unknown unless both the category and the complexity are in
 * the planner's vocabulary.
 */
export function estimatePlannerTime(input: {
  category: string;
  complexity: string;
}): PlannerTimeEstimate {
  const { category, complexity } = input;

  if (!CATEGORIES.includes(category)) {
    return {
      minMinutes: null,
      maxMinutes: null,
      basis: `unknown time: category "${category}" is not one of ${PLANNER_TIME_BASIS_VERSION} categories`,
    };
  }

  if (!COMPLEXITIES.includes(complexity)) {
    return {
      minMinutes: null,
      maxMinutes: null,
      basis: `unknown time: complexity "${complexity}" is not one of ${PLANNER_TIME_BASIS_VERSION} complexities`,
    };
  }

  const range = TIME_TABLE[category]?.[complexity];

  if (range === undefined) {
    return {
      minMinutes: null,
      maxMinutes: null,
      basis: `unknown time: ${PLANNER_TIME_BASIS_VERSION} has no entry for category=${category} complexity=${complexity}`,
    };
  }

  return {
    minMinutes: range[0],
    maxMinutes: range[1],
    basis: `${PLANNER_TIME_BASIS_VERSION}; category=${category}; complexity=${complexity}`,
  };
}

/*
 * Exposed for the estimator smoke test so the full surface can be
 * checked for shape without the test hand-listing thirty rows.
 */
export const PLANNER_TIME_CATEGORIES: ReadonlyArray<string> =
  CATEGORIES;

export const PLANNER_TIME_COMPLEXITIES: ReadonlyArray<string> =
  COMPLEXITIES;
