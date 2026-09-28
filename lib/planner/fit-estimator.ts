/*
 * R2 Phase 3.3-B Planner capability estimator.
 *
 * A pure function. No database, no clock, no network, no state. It
 * answers exactly one question: does this model's registered
 * capability cover what this planned step declared that it needs?
 *
 * The registry stores every capability as a tri-state, and the
 * estimator preserves that tri-state all the way to the answer:
 *
 *   1        the model has it
 *   0        the model does not have it -> below_minimum
 *   NULL     nobody knows          -> unknown
 *
 * Unknown is never upgraded to meets and never downgraded to
 * below_minimum. A step may be blocked by something the registry has
 * no opinion about, and reporting that honestly is the whole point of
 * the tri-state.
 *
 * A missing token estimate is not a failure. If a step declared no
 * token expectation there is simply no context-window check to run.
 */
import type { FitStatus } from "@/lib/repositories/planner-repository";

/*
 * Only these three names can be checked, because only these three are
 * modelled in ai_model_capabilities. A step asking for anything else
 * is asking for something the registry cannot speak to, which is an
 * unknown rather than a pass.
 */
const CHECKABLE_CAPABILITIES: Readonly<
  Record<string, "tools" | "vision" | "reasoning">
> = Object.freeze({
  tools: "tools",
  vision: "vision",
  reasoning: "reasoning",
});

/*
 * The registry capability columns this estimator reads, mirrored as
 * plain data so the function stays testable without a database.
 */
export type PlannerCapabilityFacts = {
  supports_tools: number | null;
  supports_vision: number | null;
  supports_reasoning: number | null;
  context_window_tokens: number | null;
  max_output_tokens: number | null;
};

export type PlannerFitEstimate = {
  fitStatus: FitStatus;
  reason: string;
};

type Signal = {
  status: FitStatus;
  reason: string;
};

function isTokenCount(
  value: number | null
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

/*
 * Only 0 and 1 are real registry answers. Anything else in the column
 * is data we cannot interpret, so it degrades to unknown.
 */
function capabilitySignal(
  label: string,
  value: number | null
): Signal {
  if (value === 1) {
    return {
      status: "meets",
      reason: `${label} is supported`,
    };
  }

  if (value === 0) {
    return {
      status: "below_minimum",
      reason: `${label} is not supported by this model`,
    };
  }

  return {
    status: "unknown",
    reason: `${label} is not recorded in the registry`,
  };
}

/*
 * Reads project_tasks.required_capabilities. Three states, deliberately
 * distinguished:
 *
 *   null / blank / unparseable -> the step's needs are not known here
 *   []                         -> the step explicitly needs nothing
 *   ["vision", ...]           -> the step declared these needs
 */
function readRequiredCapabilities(
  raw: string | null
): { known: boolean; names: string[] } {
  if (
    typeof raw !== "string" ||
    raw.trim() === ""
  ) {
    return { known: false, names: [] };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { known: false, names: [] };
  }

  if (!Array.isArray(parsed)) {
    return { known: false, names: [] };
  }

  return {
    known: true,
    names: parsed.map((entry) => String(entry)),
  };
}

/*
 * Estimates whether one model satisfies one planned step.
 *
 * The step's declared requirements and the model's registered facts
 * are combined into individual signals, and the worst signal wins.
 * Requiring a capability the model does not have outranks an unknown,
 * which in turn outranks a clean pass.
 */
export function estimatePlannerFit(input: {
  requiredCapabilitiesJson: string | null;
  estimatedInputTokensMax: number | null;
  estimatedOutputTokensMax: number | null;
  capabilities: PlannerCapabilityFacts | null;
}): PlannerFitEstimate {
  const {
    requiredCapabilitiesJson,
    estimatedInputTokensMax,
    estimatedOutputTokensMax,
    capabilities,
  } = input;

  const signals: Signal[] = [];
  const required = readRequiredCapabilities(
    requiredCapabilitiesJson
  );

  for (const name of required.names) {
    const key = CHECKABLE_CAPABILITIES[name];

    if (key === undefined) {
      signals.push({
        status: "unknown",
        reason: `required capability "${name}" is not part of the registry vocabulary`,
      });
      continue;
    }

    if (capabilities === null) {
      signals.push({
        status: "unknown",
        reason: `required capability "${name}" cannot be checked because the model has no registry capability row`,
      });
      continue;
    }

    signals.push(
      capabilitySignal(
        `required capability "${name}"`,
        capabilities[
          `supports_${key}` as
            | "supports_tools"
            | "supports_vision"
            | "supports_reasoning"
        ]
      )
    );
  }

  /*
   * A declared-empty requirement list is a real, satisfied statement:
   * the step says it needs nothing, and nothing is missing. A step that
   * simply never declared its needs contributes no signal at all,
   * which is a different thing entirely and is handled below.
   */
  if (required.known && required.names.length === 0) {
    signals.push({
      status: "meets",
      reason:
        "the step declares no capability requirements",
    });
  }

  const tokenGates: ReadonlyArray<{
    label: string;
    estimate: number | null;
    limit: number | null;
  }> = [
    {
      label: "context window",
      estimate: estimatedInputTokensMax,
      limit:
        capabilities === null
          ? null
          : capabilities.context_window_tokens,
    },
    {
      label: "max output",
      estimate: estimatedOutputTokensMax,
      limit:
        capabilities === null
          ? null
          : capabilities.max_output_tokens,
    },
  ];

  for (const gate of tokenGates) {
    /*
     * No estimate means no check. The step is not penalised for
     * leaving a number blank.
     */
    if (!isTokenCount(gate.estimate)) {
      continue;
    }

    if (!isTokenCount(gate.limit)) {
      signals.push({
        status: "unknown",
        reason: `the model's ${gate.label} is not recorded in the registry`,
      });
      continue;
    }

    if (gate.estimate > gate.limit) {
      signals.push({
        status: "below_minimum",
        reason: `${gate.estimate} tokens needed but the model's ${gate.label} is ${gate.limit}`,
      });
      continue;
    }

    signals.push({
      status: "meets",
      reason: `${gate.label} covers the step's estimate of ${gate.estimate} tokens`,
    });
  }

  /*
   * Worst signal wins. below_minimum is a known, stated failure and
   * outranks unknown; unknown outranks a clean pass so it is never
   * quietly reported as sufficient.
   */
  const failure = signals.find(
    (signal) => signal.status === "below_minimum"
  );

  if (failure !== undefined) {
    return {
      fitStatus: "below_minimum",
      reason: failure.reason,
    };
  }

  const unverified = signals.find(
    (signal) => signal.status === "unknown"
  );

  if (unverified !== undefined) {
    return {
      fitStatus: "unknown",
      reason: unverified.reason,
    };
  }

  if (signals.length === 0) {
    return {
      fitStatus: "unknown",
      reason:
        "the step declares no capability requirements and carries no token estimate, so nothing can be checked",
    };
  }

  return {
    fitStatus: "meets",
    reason: signals[0].reason,
  };
}
