import { getDb } from "@/lib/db";
import {
  AI_REGISTRY_SEED,
  REGISTRY_SOURCE_CHECKED_AT,
  type CapabilityValue,
  type RegistryProviderSeed,
} from "@/lib/registry/ai-registry-seed";
import { initDb } from "@/lib/schema";

export type RegistryCapabilityRow = {
  model_id: string;
  supports_tools: number | null;
  supports_vision: number | null;
  supports_reasoning: number | null;
  context_window_tokens: number | null;
  max_output_tokens: number | null;
  source_url: string;
  source_checked_at: string;
  created_at: string;
  updated_at: string;
};

export type RegistryPricingRow = {
  id: string;
  provider_id: string;
  model: string;
  currency: string;
  input_per_million: number;
  output_per_million: number;
  cached_per_million: number;
  reasoning_per_million: number;
  effective_from: string;
  effective_to: string | null;
};

export type RegistryModel = {
  id: string;
  provider_id: string;
  provider_name: string;
  name: string;
  capabilities: {
    supports_tools: CapabilityValue;
    supports_vision: CapabilityValue;
    supports_reasoning: CapabilityValue;
    context_window_tokens: number | null;
    max_output_tokens: number | null;
    source_url: string;
    source_checked_at: string;
  } | null;
  pricing: RegistryPricingRow[];
};

export type RegistryProvider = {
  id: string;
  name: string;
  models: RegistryModel[];
};

export type UserAiToolRow = {
  id: string;
  name: string;
  category: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateUserAiToolInput = {
  id: string;
  name: string;
  category: string;
  notes?: string | null;
  createdAt: string;
};

export type SeedAiRegistryOptions = {
  checkedAt?: string;
  now?: string;
};

export type SeedAiRegistryResult = {
  providers: number;
  models: number;
  capabilities: number;
  pricing: number;
};

/*
 * Same id convention the usage repository already uses, so a
 * registry row and a usage row always point at the same provider
 * and model. See lib/repositories/usage-repository.ts.
 */
export function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function getProviderId(
  provider: string
): string {
  return `provider_${slug(provider)}`;
}

export function getModelId(
  providerId: string,
  model: string
): string {
  return `${providerId}_${slug(model)}`;
}

function toCapabilityValue(
  value: number | null
): CapabilityValue {
  if (value === 0 || value === 1) {
    return value;
  }

  return null;
}

function toPricingRows(
  rows: RegistryPricingRow[]
): RegistryPricingRow[] {
  return rows.map((row) => ({
    ...row,
    input_per_million: Number(row.input_per_million),
    output_per_million: Number(row.output_per_million),
    cached_per_million: Number(row.cached_per_million),
    reasoning_per_million: Number(row.reasoning_per_million),
  }));
}

function selectModelsSql(
  whereClause: string
): string {
  return `
    SELECT
      m.id AS id,
      m.provider_id AS provider_id,
      p.name AS provider_name,
      m.name AS name,
      c.supports_tools AS supports_tools,
      c.supports_vision AS supports_vision,
      c.supports_reasoning AS supports_reasoning,
      c.context_window_tokens AS context_window_tokens,
      c.max_output_tokens AS max_output_tokens,
      c.source_url AS capability_source_url,
      c.source_checked_at AS capability_source_checked_at
    FROM models m
    JOIN providers p
      ON p.id = m.provider_id
    LEFT JOIN ai_model_capabilities c
      ON c.model_id = m.id
    ${whereClause}
    ORDER BY p.name, m.name
  `;
}

type ModelQueryRow = {
  id: string;
  provider_id: string;
  provider_name: string;
  name: string;
  supports_tools: number | null;
  supports_vision: number | null;
  supports_reasoning: number | null;
  context_window_tokens: number | null;
  max_output_tokens: number | null;
  capability_source_url: string | null;
  capability_source_checked_at: string | null;
};

function attachPricing(
  rows: ModelQueryRow[]
): RegistryModel[] {
  if (rows.length === 0) {
    return [];
  }

  const db = getDb();

  const pricingStatement = db.prepare(
    `
      SELECT
        id,
        provider_id,
        model,
        currency,
        input_per_million,
        output_per_million,
        cached_per_million,
        reasoning_per_million,
        effective_from,
        effective_to
      FROM pricing_versions
      WHERE provider_id = ?
        AND model = ?
      ORDER BY effective_from
    `
  );

  return rows.map((row) => {
    const hasCapabilities =
      row.capability_source_url !== null;

    return {
      id: row.id,
      provider_id: row.provider_id,
      provider_name: row.provider_name,
      name: row.name,
      capabilities: hasCapabilities
        ? {
            supports_tools: toCapabilityValue(
              row.supports_tools
            ),
            supports_vision: toCapabilityValue(
              row.supports_vision
            ),
            supports_reasoning: toCapabilityValue(
              row.supports_reasoning
            ),
            context_window_tokens:
              row.context_window_tokens,
            max_output_tokens: row.max_output_tokens,
            source_url: row.capability_source_url as string,
            source_checked_at:
              row.capability_source_checked_at as string,
          }
        : null,
      pricing: toPricingRows(
        pricingStatement.all(
          row.provider_id,
          row.name
        ) as RegistryPricingRow[]
      ),
    };
  });
}

/*
 * Seeds the vendor facts from lib/registry/ai-registry-seed.ts into
 * the existing providers / models / pricing_versions tables plus the
 * new ai_model_capabilities table.
 *
 * Idempotent by design:
 * - providers and models use INSERT OR IGNORE, so a model that usage
 *   records already created is never touched.
 * - pricing_versions uses INSERT OR IGNORE on the deterministic
 *   pricing id, so a rate that the DeepSeek API route already
 *   recorded is never overwritten.
 * - capabilities are refreshed, because they are vendor facts owned
 *   by this manifest.
 */
export function seedAiRegistry(
  options: SeedAiRegistryOptions = {}
): SeedAiRegistryResult {
  initDb();

  const db = getDb();
  const now = options.now ?? new Date().toISOString();
  const checkedAt =
    options.checkedAt ?? REGISTRY_SOURCE_CHECKED_AT;

  const result: SeedAiRegistryResult = {
    providers: 0,
    models: 0,
    capabilities: 0,
    pricing: 0,
  };

  db.exec("BEGIN");

  try {
    const providerStatement = db.prepare(
      `
        INSERT OR IGNORE INTO providers
        (
          id,
          name,
          created_at
        )
        VALUES (?, ?, ?)
      `
    );

    const modelStatement = db.prepare(
      `
        INSERT OR IGNORE INTO models
        (
          id,
          provider_id,
          name,
          created_at
        )
        VALUES (?, ?, ?, ?)
      `
    );

    const capabilityStatement = db.prepare(
      `
        INSERT INTO ai_model_capabilities
        (
          model_id,
          supports_tools,
          supports_vision,
          supports_reasoning,
          context_window_tokens,
          max_output_tokens,
          source_url,
          source_checked_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(model_id) DO UPDATE SET
          supports_tools = excluded.supports_tools,
          supports_vision = excluded.supports_vision,
          supports_reasoning = excluded.supports_reasoning,
          context_window_tokens = excluded.context_window_tokens,
          max_output_tokens = excluded.max_output_tokens,
          source_url = excluded.source_url,
          source_checked_at = excluded.source_checked_at,
          updated_at = excluded.updated_at
      `
    );

    const pricingStatement = db.prepare(
      `
        INSERT OR IGNORE INTO pricing_versions
        (
          id,
          provider_id,
          model,
          currency,
          input_per_million,
          output_per_million,
          cached_per_million,
          reasoning_per_million,
          effective_from,
          effective_to
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    );

    for (const provider of AI_REGISTRY_SEED) {
      seedProvider(
        provider,
        now,
        checkedAt,
        result,
        providerStatement,
        modelStatement,
        capabilityStatement,
        pricingStatement
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Ignore rollback errors so the original error is preserved.
    }

    throw error;
  }

  return result;
}

type Db = ReturnType<typeof getDb>;

type SeedStatement = ReturnType<Db["prepare"]>;

function seedProvider(
  provider: RegistryProviderSeed,
  now: string,
  checkedAt: string,
  result: SeedAiRegistryResult,
  providerStatement: SeedStatement,
  modelStatement: SeedStatement,
  capabilityStatement: SeedStatement,
  pricingStatement: SeedStatement
): void {
  const providerId = getProviderId(provider.name);

  providerStatement.run(
    providerId,
    provider.name,
    now
  );
  result.providers++;

  for (const model of provider.models) {
    const modelId = getModelId(
      providerId,
      model.name
    );

    modelStatement.run(
      modelId,
      providerId,
      model.name,
      now
    );
    result.models++;

    capabilityStatement.run(
      modelId,
      model.supportsTools,
      model.supportsVision,
      model.supportsReasoning,
      model.contextWindowTokens,
      model.maxOutputTokens,
      model.capabilitySourceUrl,
      checkedAt,
      now,
      now
    );
    result.capabilities++;

    for (const pricing of model.pricing) {
      pricingStatement.run(
        pricing.id,
        providerId,
        model.name,
        pricing.currency,
        pricing.inputPerMillion,
        pricing.outputPerMillion,
        pricing.cachedPerMillion,
        pricing.reasoningPerMillion,
        pricing.effectiveFrom,
        pricing.effectiveTo
      );
      result.pricing++;
    }
  }
}

export function listAiRegistry(): RegistryProvider[] {
  initDb();

  const rows = getDb()
    .prepare(selectModelsSql(""))
    .all() as ModelQueryRow[];

  const models = attachPricing(rows);
  const providers = new Map<string, RegistryProvider>();

  for (const model of models) {
    const existing = providers.get(model.provider_id);

    if (existing) {
      existing.models.push(model);
      continue;
    }

    providers.set(model.provider_id, {
      id: model.provider_id,
      name: model.provider_name,
      models: [model],
    });
  }

  return [...providers.values()];
}

export function getRegistryModel(
  modelId: string
): RegistryModel | undefined {
  initDb();

  const rows = getDb()
    .prepare(selectModelsSql("WHERE m.id = ?"))
    .all(modelId) as ModelQueryRow[];

  return attachPricing(rows)[0];
}

/*
 * Returns the seeded rate that applies at the given instant, or null
 * when no rate covers it. A null result means "price unknown" and
 * must never be treated as a zero cost.
 */
export function resolveRegistryPricing(
  modelId: string,
  at: string
): RegistryPricingRow | null {
  const model = getRegistryModel(modelId);

  if (!model) {
    return null;
  }

  const match = model.pricing.find(
    (row) =>
      row.effective_from <= at &&
      (row.effective_to === null ||
        row.effective_to > at)
  );

  return match ?? null;
}

/*
 * Returns the one pricing_versions row a resource pinned by id, or
 * null when no such card exists. This is the exact-row read a pinned
 * pricing basis needs: B3-1 lets an ai_resources.pricing_version_id
 * select a specific card, which need not be the card in force at the
 * plan instant. Like resolveRegistryPricing, null means "price
 * unknown" and must never be read as a zero cost.
 */
export function getRegistryPricingById(
  id: string
): RegistryPricingRow | null {
  initDb();

  const row = getDb()
    .prepare(
      `
        SELECT
          id,
          provider_id,
          model,
          currency,
          input_per_million,
          output_per_million,
          cached_per_million,
          reasoning_per_million,
          effective_from,
          effective_to
        FROM pricing_versions
        WHERE id = ?
      `
    )
    .get(id) as RegistryPricingRow | undefined;

  if (!row) {
    return null;
  }

  return toPricingRows([row])[0];
}

export function createUserAiTool(
  input: CreateUserAiToolInput
): void {
  initDb();

  getDb()
    .prepare(
      `
        INSERT INTO user_ai_tools
        (
          id,
          name,
          category,
          status,
          notes,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, 'active', ?, ?, ?)
      `
    )
    .run(
      input.id,
      input.name,
      input.category,
      input.notes ?? null,
      input.createdAt,
      input.createdAt
    );
}

export function listUserAiTools(): UserAiToolRow[] {
  initDb();

  return getDb()
    .prepare(
      `
        SELECT
          id,
          name,
          category,
          status,
          notes,
          created_at,
          updated_at
        FROM user_ai_tools
        ORDER BY name
      `
    )
    .all() as UserAiToolRow[];
}

export function setUserAiToolStatus(
  id: string,
  status: "active" | "archived",
  updatedAt: string
): void {
  initDb();

  getDb()
    .prepare(
      `
        UPDATE user_ai_tools
        SET
          status = ?,
          updated_at = ?
        WHERE id = ?
      `
    )
    .run(status, updatedAt, id);
}
