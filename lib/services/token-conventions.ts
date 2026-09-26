export type CanonicalTokenCounts = {
  total: number;
  input: number;
  cached: number;
  output: number;
  reasoning: number;
};

function normalizeTokenCount(value: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  return value;
}

export function getCanonicalTokenCounts(input: {
  input: number;
  cached: number;
  output: number;
  reasoning: number;
  total?: number;
}): CanonicalTokenCounts {
  const normalizedInput = normalizeTokenCount(input.input);

  const normalizedCached = normalizeTokenCount(input.cached);

  const normalizedOutput = normalizeTokenCount(input.output);

  const normalizedReasoning = normalizeTokenCount(input.reasoning);

  return {
    input: normalizedInput,
    cached: normalizedCached,
    output: normalizedOutput,
    reasoning: normalizedReasoning,
    /*
     * The canonical total is always recomputed as
     * input + output + reasoning.
     *
     * A caller-supplied `total` is intentionally ignored.
     *
     * `cached` is already included in `input`, so it must
     * never be added again here.
     */
    total:
      normalizedInput +
      normalizedOutput +
      normalizedReasoning,
  };
}

export function getBilledInputTokenCount(
  canonical: CanonicalTokenCounts
): number {
  return Math.max(
    canonical.input - canonical.cached,
    0
  );
}