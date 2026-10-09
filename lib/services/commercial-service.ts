import {
  ensureCommercialStateRow,
  getCommercialStateRow,
  stampCommercialFirstUse,
  updateCommercialPaid,
} from "@/lib/repositories/commercial-repository";

export const COMMERCIAL_TRIAL_DAYS = 90;

const MS_PER_DAY = 86_400_000;

export const COMMERCIAL_CAPABILITIES = [
  "planner_advanced",
  "cost_advanced",
  "budget_control",
  "ai_activity_advanced",
  "productivity_efficiency",
  "planner_historical_efficiency",
] as const;

export type CommercialCapability =
  (typeof COMMERCIAL_CAPABILITIES)[number];

export type CommercialLifecycleState =
  | "full_access_trial"
  | "paid_required";

export type CommercialLifecycle = {
  lifecycleState: CommercialLifecycleState;
  paid: boolean;
  firstUseAt: string;
  paidAt: string | null;
  paidRequiredAt: string;
  daysSinceFirstUse: number;
  trialExpired: boolean;
};

export type CommercialCapabilityEvaluation =
  CommercialLifecycle & {
    capabilities: Record<
      CommercialCapability,
      boolean
    >;
  };

export function evaluateCommercialLifecycle(input: {
  firstUseAt: string;
  paid: boolean;
  paidAt: string | null;
  now: Date;
}): CommercialLifecycle {
  const firstUseMs = Date.parse(input.firstUseAt);

  if (Number.isNaN(firstUseMs)) {
    throw new Error(
      "commercial_state.first_use_at is not a valid ISO timestamp."
    );
  }

  const paidRequiredMs =
    firstUseMs +
    COMMERCIAL_TRIAL_DAYS * MS_PER_DAY;

  const nowMs = input.now.getTime();

  const trialExpired = nowMs >= paidRequiredMs;

  const rawElapsedDays = Math.floor(
    (nowMs - firstUseMs) / MS_PER_DAY
  );

  return {
    lifecycleState: trialExpired
      ? "paid_required"
      : "full_access_trial",
    paid: input.paid,
    firstUseAt: input.firstUseAt,
    paidAt: input.paidAt,
    paidRequiredAt:
      new Date(paidRequiredMs).toISOString(),
    daysSinceFirstUse: Math.max(
      0,
      rawElapsedDays
    ),
    trialExpired,
  };
}

function buildCapabilities(
  lifecycle: CommercialLifecycle
): Record<CommercialCapability, boolean> {
  const allowed =
    lifecycle.lifecycleState ===
      "full_access_trial" ||
    lifecycle.paid;

  const capabilities =
    {} as Record<
      CommercialCapability,
      boolean
    >;

  for (const capability of COMMERCIAL_CAPABILITIES) {
    capabilities[capability] = allowed;
  }

  return capabilities;
}

export function startCommercialTrial(
  now: Date = new Date()
): CommercialLifecycle {
  const row = stampCommercialFirstUse(
    now.toISOString()
  );

  if (row.first_use_at === null) {
    throw new Error(
      "commercial_state.first_use_at was not initialized."
    );
  }

  return evaluateCommercialLifecycle({
    firstUseAt: row.first_use_at,
    paid: row.paid === 1,
    paidAt: row.paid_at,
    now,
  });
}

export function getCommercialLifecycle(
  now: Date = new Date()
): CommercialLifecycle | null {
  const row = getCommercialStateRow();

  if (!row || row.first_use_at === null) {
    return null;
  }

  return evaluateCommercialLifecycle({
    firstUseAt: row.first_use_at,
    paid: row.paid === 1,
    paidAt: row.paid_at,
    now,
  });
}

export function evaluateCommercialCapabilities(
  now: Date = new Date()
): CommercialCapabilityEvaluation | null {
  const lifecycle = getCommercialLifecycle(now);

  if (lifecycle === null) {
    return null;
  }

  return {
    ...lifecycle,
    capabilities: buildCapabilities(lifecycle),
  };
}

export function isCommercialCapabilityAllowed(
  capability: CommercialCapability,
  now: Date = new Date()
): boolean {
  const known =
    COMMERCIAL_CAPABILITIES.includes(capability);

  if (!known) {
    return false;
  }

  const evaluation =
    evaluateCommercialCapabilities(now);

  if (evaluation === null) {
    return false;
  }

  return evaluation.capabilities[capability];
}

export function setCommercialPaid(
  paid: boolean,
  now: Date = new Date()
): CommercialCapabilityEvaluation | null {
  ensureCommercialStateRow(now.toISOString());

  updateCommercialPaid(
    paid,
    now.toISOString()
  );

  return evaluateCommercialCapabilities(now);
}

export function readCommercialStateRow() {
  return getCommercialStateRow();
}
