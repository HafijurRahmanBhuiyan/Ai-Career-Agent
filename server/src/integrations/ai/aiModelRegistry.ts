import { AIProvider } from "./ai.types";

/**
 * A single model that an AI provider may be called with.
 *
 * - `free`: model is available on the provider's free tier / free experiment
 *   tier (or free trial, see notes).
 * - `enabled`: whether the model is currently usable by default.
 * - `priority`: ascending order in which models within one provider are tried
 *   (0 = user/request-specified or legacy single-model override).
 * - `preview`: experimental/preview (or otherwise unstable) designation.
 * - `contextLimit`: advertised context window in tokens, when verified.
 * - `license`: license / usage restriction (kept as a reference note only).
 * - `notes`: important caveats (capacity limits, deprecations, free tier rules).
 *
 * Models sharing one provider are NOT treated as independent quotas. They all
 * draw from the same provider API key, so the fallback chain only moves to the
 * next provider once every enabled model of the current provider has failed.
 */
export interface AIModelConfig {
  provider: AIProvider;
  model: string;
  free: boolean;
  enabled: boolean;
  priority: number;
  preview?: boolean;
  contextLimit?: number;
  license?: string;
  notes?: string;
}

/**
 * Default free-model pool per multi-model provider. Source of truth is the
 * providers' own current documentation (verified during implementation):
 *
 * - Gemini:  https://ai.google.dev/gemini-api/docs/pricing (free tier = Flash
 *   / Flash-Lite family only).
 * - Groq:    https://console.groq.com/docs/models (free developer plan).
 * - OpenRouter: https://openrouter.ai/collections/free-models (official
 *   "free models" collection; :free route rank as of collection snapshot).
 * - Cerebras: https://inference-docs.cerebras.ai/models/overview
 *   (free = time-bounded free trial, NOT a permanent free tier).
 * - Mistral: https://docs.mistral.ai/models (free Experiment tier = rate-limited
 *   access to all API models, ~1B tokens/month cap).
 */
export const DEFAULT_FREE_AI_MODELS: AIModelConfig[] = [
  // ---- Gemini (free tier) ------------------------------------------------
  {
    provider: "gemini",
    model: "gemini-3.8-flash",
    free: true,
    enabled: true,
    priority: 1,
    license: "Google proprietary (free tier usage)",
  },
  {
    provider: "gemini",
    model: "gemini-3.7-flash",
    free: true,
    enabled: true,
    priority: 2,
    license: "Google proprietary (free tier usage)",
  },
  {
    provider: "gemini",
    model: "gemini-3.6-flash",
    free: true,
    enabled: true,
    priority: 3,
    license: "Google proprietary (free tier usage)",
  },
  {
    provider: "gemini",
    model: "gemini-3.5-flash",
    free: true,
    enabled: true,
    priority: 4,
    license: "Google proprietary (free tier usage)",
  },
  {
    provider: "gemini",
    model: "gemini-3.5-flash-lite",
    free: true,
    enabled: true,
    priority: 5,
    license: "Google proprietary (free tier usage)",
    notes: "Flash-Lite: cheapest free-tier model.",
  },
  {
    provider: "gemini",
    model: "gemini-3.1-flash-lite",
    free: true,
    enabled: true,
    priority: 6,
    license: "Google proprietary (free tier usage)",
  },
  {
    provider: "gemini",
    model: "gemini-3-flash-preview",
    free: true,
    enabled: true,
    priority: 7,
    preview: true,
    license: "Google proprietary (free tier usage)",
    notes: "Preview model; may be unstable or removed without notice.",
  },

  // ---- Groq (free developer plan) ----------------------------------------
  {
    provider: "groq",
    model: "openai/gpt-oss-120b",
    free: true,
    enabled: true,
    priority: 1,
    contextLimit: 131072,
    license: "Apache 2.0 (OpenAI gpt-oss)",
  },
  {
    provider: "groq",
    model: "openai/gpt-oss-20b",
    free: true,
    enabled: true,
    priority: 2,
    license: "Apache 2.0 (OpenAI gpt-oss)",
    notes: "Smaller sibling of gpt-oss-120b.",
  },
  {
    provider: "groq",
    model: "qwen/qwen3.8-27b",
    free: true,
    enabled: true,
    priority: 3,
    contextLimit: 131042,
    license: "Apache 2.0 (Qwen)",
  },
  {
    provider: "groq",
    model: "qwen/qwen3.6-27b",
    free: true,
    enabled: true,
    priority: 4,
    license: "Apache 2.0 (Qwen)",
  },

  // ---- OpenRouter (official "free models" collection) --------------------
  {
    provider: "openrouter",
    model: "openrouter/free",
    free: true,
    enabled: true,
    priority: 1,
    notes:
      "Dynamic router: automatically routes to the best available free model. Preferred primary over individual :free slugs.",
  },
  {
    provider: "openrouter",
    model: "nvidia/nemotron-3-ultra-550b-a55b:free",
    free: true,
    enabled: true,
    priority: 2,
  },
  {
    provider: "openrouter",
    model: "thinkingmachines/inkling:free",
    free: true,
    enabled: true,
    priority: 3,
  },
  {
    provider: "openrouter",
    model: "nvidia/nemotron-3-super-120b-a12b:free",
    free: true,
    enabled: true,
    priority: 4,
  },
  {
    provider: "openrouter",
    model: "nvidia/nemotron-3.5-lightning:free",
    free: true,
    enabled: true,
    priority: 5,
  },
  {
    provider: "openrouter",
    model: "thinkingmachines/inkling-small:free",
    free: true,
    enabled: true,
    priority: 6,
  },
  {
    provider: "openrouter",
    model: "dots-studio/dots-3-note-preview:free",
    free: true,
    enabled: true,
    priority: 7,
    preview: true,
  },
  {
    provider: "openrouter",
    model: "cohere/north-mini-code:free",
    free: true,
    enabled: true,
    priority: 8,
    notes: "Code-focused model; may underperform on general prose.",
  },
  {
    provider: "openrouter",
    model: "poolside/laguna-s-2.1:free",
    free: true,
    enabled: true,
    priority: 9,
  },

  // ---- Cerebras (free trial; limited window) -----------------------------
  {
    provider: "cerebras",
    model: "gpt-oss-120b",
    free: true,
    enabled: true,
    priority: 1,
    contextLimit: 65536,
    license: "Apache 2.0 (OpenAI gpt-oss)",
    notes:
      "Free access = time-bounded free trial (approx. $5 credit / 30 days), not a permanent free tier. 65k free context window (131k with paid speed).",
  },
  {
    provider: "cerebras",
    model: "gemma-4-31b",
    free: true,
    enabled: true,
    priority: 2,
    license: "Gemma license (Google)",
    notes: "Production model; free via the same time-bounded trial.",
  },

  // ---- Mistral (free Experiment tier) ------------------------------------
  {
    provider: "mistral",
    model: "mistral-small-latest",
    free: true,
    enabled: true,
    priority: 1,
    contextLimit: 262144,
    license: "Apache 2.0 (Mistral Small 4)",
    notes:
      "Alias currently resolves to Mistral Small 4 (mistral-small-2603, v26.03). Free Experiment tier access is rate-limited (~1B tokens/month cap).",
  },
  {
    provider: "mistral",
    model: "mistral-medium-latest",
    free: true,
    enabled: true,
    priority: 2,
    notes:
      "Alias resolves to Mistral Medium 3.5 (mistral-medium-2604). May be capacity-limited on the free Experiment tier.",
  },
];

const FREE_MODELS_ENV: Record<Exclude<AIProvider, "claude" | "openai">, string> = {
  gemini: "GEMINI_FREE_MODELS",
  groq: "GROQ_FREE_MODELS",
  openrouter: "OPENROUTER_FREE_MODELS",
  cerebras: "CEREBRAS_FREE_MODELS",
  mistral: "MISTRAL_FREE_MODELS",
};

const MODEL_ENV: Record<AIProvider, string> = {
  claude: "CLAUDE_MODEL",
  gemini: "GEMINI_MODEL",
  openai: "OPENAI_MODEL",
  groq: "GROQ_MODEL",
  openrouter: "OPENROUTER_MODEL",
  cerebras: "CEREBRAS_MODEL",
  mistral: "MISTRAL_MODEL",
};

const SINGLE_MODEL_DEFAULT: Record<AIProvider, string> = {
  claude: "claude-sonnet-4-6",
  gemini: "gemini-3.8-flash",
  openai: "gpt-4o-mini",
  groq: "openai/gpt-oss-120b",
  openrouter: "openrouter/free",
  cerebras: "gpt-oss-120b",
  mistral: "mistral-small-latest",
};

const SINGLE_MODEL_PROVIDERS: ReadonlySet<AIProvider> = new Set([
  "claude",
  "openai",
]);

function legacyModelOverride(provider: AIProvider): string | null {
  return process.env[MODEL_ENV[provider]] || null;
}

function freeModelsOverride(
  provider: Exclude<AIProvider, "claude" | "openai">
): string[] | null {
  const raw = process.env[FREE_MODELS_ENV[provider]];
  if (!raw || raw.trim() === "") return null;
  const models = raw
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return models.length > 0 ? models : null;
}

/**
 * Build the ordered model chain for a provider.
 *
 * Ordering (first tried = highest priority):
 *   1. `requestedModel` (explicit per-request model) if provided.
 *   2. legacy single-model override `<PROVIDER>_MODEL` if set.
 *   3. `<PROVIDER>_FREE_MODELS` comma-separated override if set, otherwise the
 *      verified registry defaults (`DEFAULT_FREE_AI_MODELS`).
 *
 * claude/openai remain single-model providers (no free pool) and return exactly
 * one entry. Duplicate model ids are de-duplicated (first occurrence wins).
 */
export function getProviderModels(
  provider: AIProvider,
  requestedModel?: string
): AIModelConfig[] {
  if (SINGLE_MODEL_PROVIDERS.has(provider)) {
    const model =
      requestedModel ||
      legacyModelOverride(provider) ||
      SINGLE_MODEL_DEFAULT[provider];
    return [{ provider, model, free: false, enabled: true, priority: 0 }];
  }

  const chain: AIModelConfig[] = [];
  const seen = new Set<string>();

  const push = (config: AIModelConfig) => {
    if (seen.has(config.model)) return;
    seen.add(config.model);
    chain.push(config);
  };

  if (requestedModel) {
    push({
      provider,
      model: requestedModel,
      free: false,
      enabled: true,
      priority: 0,
    });
  }

  const legacy = legacyModelOverride(provider);
  if (legacy) {
    push({
      provider,
      model: legacy,
      free: false,
      enabled: true,
      priority: 0,
    });
  }

  const override = freeModelsOverride(
    provider as Exclude<AIProvider, "claude" | "openai">
  );
  if (override) {
    override.forEach((model) =>
      push({ provider, model, free: true, enabled: true, priority: chain.length + 1 })
    );
  } else {
    DEFAULT_FREE_AI_MODELS.filter(
      (m) => m.provider === provider && m.enabled
    ).forEach((model) => push({ ...model }));
  }

  return chain;
}

/**
 * The first (highest priority) model for a provider, used when reporting the
 * provider's default model to the UI.
 */
export function getPrimaryModel(provider: AIProvider): string {
  const models = getProviderModels(provider);
  return models[0]?.model || SINGLE_MODEL_DEFAULT[provider];
}