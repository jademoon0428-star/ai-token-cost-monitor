/*
 * R2 Phase 3.3-B Planner strategy rules.
 *
 * A pure function. It reads an array of already-estimated candidates
 * and returns a display order. It does not read a database, does not
 * compare a model against a stored selection, and does not set
 * is_selected on anything.
 *
 * What this module deliberately does not contain, and why:
 *
 *   no numeric score        Combining cost and time into one number
 *                           hides the trade-off the reader is here to
 *                           make, and makes the answer unexplainable
 *                           the moment a weight is questioned.
 *   no weighted blend      Same reason, plus a weight is an invented
 *                           preference with no source.
 *   no ranking, tier or
 *     "best" label          These all assert a winner this data cannot
 *                           support.
 *   no Pareto front         A frontier is a real technique, but it
 *                           invites the reader to treat the boundary
 *                           as a quality judgement. This module points
 *                           at the two ends of each axis instead.
 *
 * So the output is an order and a set of representatives, and the
 * basis string says which rule produced it. Two calls on the same
 * input return the same output; the original input array is never
 * mutated.
 */
import type { ProjectPreference } from "@/lib/repositories/planner-repository";
import type { FitStatus } from "@/lib/repositories/planner-repository";
import type { PlannerCostEstimate } from "@/lib/planner/cost-estimator";
import type { PlannerTimeEstimate } from "@/lib/planner/time-estimator";

export type PlannerStrategyCandidate = {
  modelId: string;
  fitStatus: FitStatus;
  cost: PlannerCostEstimate;
  time: PlannerTimeEstimate;
};

export type PlannerStrategyResult = {
  strategy: ProjectPreference;
  order: PlannerStrategyCandidate[];
  representatives: PlannerStrategyCandidate[];
  basis: string;
};

/*
 * Capability comes before economics. A step that cannot run on a model
 * is not a cheap option, it is a broken one, so a below_minimum
 * candidate never reaches the front of the list however inexpensive
 * or quick it looks.
 *
 * unknown sits between the two because it is a genuine third state:
 * the registry has not confirmed the model, but it has not refused it
 * either. It is never placed ahead of a confirmed match.
 */
const GATE_ORDER: Readonly<Record<FitStatus, number>> =
  Object.freeze({
    meets: 0,
    unknown: 1,
    below_minimum: 2,
  });

function hasKnownCost(
  cost: PlannerCostEstimate
): boolean {
  return (
    cost.costMinMicros !== null &&
    cost.costMaxMicros !== null &&
    typeof cost.currency === "string" &&
    cost.currency.trim() !== ""
  );
}

function hasKnownTime(
  time: PlannerTimeEstimate
): boolean {
  return (
    time.minMinutes !== null &&
    time.maxMinutes !== null
  );
}

function sameCost(
  a: PlannerStrategyCandidate,
  b: PlannerStrategyCandidate
): boolean {
  return (
    a.cost.costMinMicros === b.cost.costMinMicros &&
    a.cost.costMaxMicros === b.cost.costMaxMicros
  );
}

function sameTime(
  a: PlannerStrategyCandidate,
  b: PlannerStrategyCandidate
): boolean {
  return (
    a.time.minMinutes === b.time.minMinutes &&
    a.time.maxMinutes === b.time.maxMinutes
  );
}

/*
 * Finds the most capable gate that actually has candidates in it, so a
 * plan whose matches are all unverified still has something sensible
 * to order.
 */
function firstPopulatedGate(
  indexed: ReadonlyArray<{
    candidate: PlannerStrategyCandidate;
    index: number;
  }>
): FitStatus | null {
  for (const gate of ["meets", "unknown", "below_minimum"] as const) {
    if (
      indexed.some(
        (entry) =>
          entry.candidate.fitStatus === gate
      )
    ) {
      return gate;
    }
  }

  return null;
}

/*
 * Applies one of the three planner strategies to a set of candidates.
 */
export function applyPlannerStrategy(input: {
  strategy: ProjectPreference;
  candidates: ReadonlyArray<PlannerStrategyCandidate>;
}): PlannerStrategyResult {
  const { strategy, candidates } = input;

  const indexed = candidates.map(
    (candidate, index) => ({
      candidate,
      index,
    })
  );

  const gate = firstPopulatedGate(indexed);

  const order = [...indexed]
    .sort((a, b) => {
      const byGate =
        GATE_ORDER[a.candidate.fitStatus] -
        GATE_ORDER[b.candidate.fitStatus];

      if (byGate !== 0) {
        return byGate;
      }

      if (strategy === "cost_first") {
        const aKnown = hasKnownCost(a.candidate.cost);
        const bKnown = hasKnownCost(b.candidate.cost);

        if (aKnown !== bKnown) {
          return aKnown ? -1 : 1;
        }

        if (aKnown && bKnown) {
          const byMin =
            (a.candidate.cost.costMinMicros as number) -
            (b.candidate.cost.costMinMicros as number);

          if (byMin !== 0) {
            return byMin;
          }

          const byMax =
            (a.candidate.cost.costMaxMicros as number) -
            (b.candidate.cost.costMaxMicros as number);

          if (byMax !== 0) {
            return byMax;
          }
        }
      }

      if (strategy === "time_first") {
        const aKnown = hasKnownTime(a.candidate.time);
        const bKnown = hasKnownTime(b.candidate.time);

        if (aKnown !== bKnown) {
          return aKnown ? -1 : 1;
        }

        if (aKnown && bKnown) {
          const byMin =
            (a.candidate.time.minMinutes as number) -
            (b.candidate.time.minMinutes as number);

          if (byMin !== 0) {
            return byMin;
          }

          const byMax =
            (a.candidate.time.maxMinutes as number) -
            (b.candidate.time.maxMinutes as number);

          if (byMax !== 0) {
            return byMax;
          }
        }
      }

      if (strategy === "balanced") {
        /*
         * Inside one gate, surface the rows that actually have both
         * figures filled in first. That is a data-completeness hint,
         * not a claim that the row is preferable.
         */
        const aFull =
          hasKnownCost(a.candidate.cost) &&
          hasKnownTime(a.candidate.time);
        const bFull =
          hasKnownCost(b.candidate.cost) &&
          hasKnownTime(b.candidate.time);

        if (aFull !== bFull) {
          return aFull ? -1 : 1;
        }
      }

      return a.index - b.index;
    })
    .map((entry) => entry.candidate);

  if (gate === null) {
    return {
      strategy,
      order,
      representatives: [],
      basis: "no candidates were supplied",
    };
  }

  const inGate = indexed.filter(
    (entry) =>
      entry.candidate.fitStatus === gate
  );

  if (strategy === "cost_first") {
    const known = order.filter(
      (candidate) =>
        candidate.fitStatus === gate &&
        hasKnownCost(candidate.cost)
    );

    return {
      strategy,
      order,
      representatives: known,
      basis:
        `cost_first: candidates in gate "${gate}" with a known cost, ` +
        `ordered by cost_min then cost_max; ` +
        `gate order is meets, unknown, below_minimum`,
    };
  }

  if (strategy === "time_first") {
    const known = order.filter(
      (candidate) =>
        candidate.fitStatus === gate &&
        hasKnownTime(candidate.time)
    );

    return {
      strategy,
      order,
      representatives: known,
      basis:
        `time_first: candidates in gate "${gate}" with a known time, ` +
        `ordered by time_min then time_max; ` +
        `gate order is meets, unknown, below_minimum`,
    };
  }

  /*
   * balanced: show the two ends of each axis so the trade-off is
   * visible, and nothing more.
   *
   * The lowest-cost candidate and the shortest-time candidate are
   * pulled out on their own axes. Neither is combined with the other
   * and neither is called preferable. Exact ties on either axis are
   * kept alongside it, because "these three all cost the same" is a
   * fact worth showing.
   *
   * Only candidates with both figures known can appear. An unknown is
   * never allowed to masquerade as the cheap end or the quick end.
   */
  const fullyKnown = inGate.filter(
    (entry) =>
      hasKnownCost(entry.candidate.cost) &&
      hasKnownTime(entry.candidate.time)
  );

  if (fullyKnown.length === 0) {
    return {
      strategy,
      order,
      representatives: [],
      basis:
        `balanced: no candidate in gate "${gate}" has both a known cost ` +
        `and a known time, so no cost/time trade-off can be shown; ` +
        `original order preserved`,
    };
  }

  const cheapest = fullyKnown.reduce(
    (low, entry) =>
      entry.candidate.cost.costMinMicros! <
      low.candidate.cost.costMinMicros!
        ? entry
        : low
  );

  const quickest = fullyKnown.reduce(
    (low, entry) =>
      entry.candidate.time.minMinutes! <
      low.candidate.time.minMinutes!
        ? entry
        : low
  );

  const representativeIds = new Set<string>();

  for (const entry of fullyKnown) {
    if (
      sameCost(entry.candidate, cheapest.candidate) ||
      sameTime(entry.candidate, quickest.candidate)
    ) {
      representativeIds.add(entry.candidate.modelId);
    }
  }

  /*
   * Emitted in the caller's order, so the representative list never
   * implies a hierarchy of its own.
   */
  const representatives = order.filter(
    (candidate) =>
      representativeIds.has(candidate.modelId)
  );

  const describe = (
    candidate: PlannerStrategyCandidate
  ): string => candidate.modelId;

  return {
    strategy,
    order,
    representatives,
    basis:
      `balanced: in gate "${gate}", showing the lowest-cost candidate ` +
      `(${describe(cheapest.candidate)}) and the shortest-time ` +
      `candidate (${describe(quickest.candidate)}), plus exact ties on ` +
      `either axis; no combined score, no frontier, no winner`,
  };
}
