/**
 * The AI provider layer: one config table for every vendor Freedemy supports,
 * plus resolution of `AI_*` / legacy `NVIDIA_NIM_*` environment variables into
 * the active provider. Transport (OpenAI wire vs Anthropic's `/v1/messages`)
 * lives in `lib/ai/nim.ts`; callers only ever see `nimJson` / `nimText`.
 *
 * This module reads `process.env` directly — like `lib/env.ts`, nothing here
 * throws at import time, so `next build` works before any key exists — and it
 * imports nothing local, so `lib/env.ts` can depend on it without a cycle.
 */

export type ProviderId = "nim" | "openai" | "anthropic" | "deepseek" | "gemini" | "custom";
export type ProviderWire = "openai" | "anthropic";

export type ProviderConfig = {
  id: ProviderId;
  /** Human-readable name for error messages and setup copy. */
  label: string;
  wire: ProviderWire;
  /** Default base URL (trailing slashes trimmed on resolve). */
  baseUrl: string;
  /** Default model when neither AI_MODEL nor the vendor env override is set. */
  model: string;
  /** Whether `response_format: { type: "json_object" }` is meaningful here. */
  jsonMode: boolean;
  /**
   * Default sliding-window RPM cap. `null` means no window enforcement — only
   * NIM users are rate-limited by default; other providers keep the
   * concurrency lanes and generic 429 Retry-After handling instead.
   * An explicit `AI_RPM_LIMIT` in the environment overrides this for any
   * provider (opt back in for a free-tier account).
   */
  rpmLimit: number | null;
  /**
   * NIM-only quirk: `chat_template_kwargs: { thinking: false }`. Nemotron's
   * hidden reasoning pass is billed against max_tokens, so the flag keeps map
   * calls from coming back empty. Every other vendor rejects the field with a
   * 400, so it is never sent to them.
   */
  thinkingFlag: boolean;
};

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  nim: {
    id: "nim",
    label: "NVIDIA NIM",
    wire: "openai",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    // NIM hosts a large catalogue but only part of it is enabled per account;
    // this default is an NVIDIA model that is enabled on the free endpoints,
    // honours JSON mode, handles a full lecture transcript and writes usable
    // mermaid.
    model: "nvidia/nemotron-3-ultra-550b-a55b",
    jsonMode: true,
    rpmLimit: 40,
    thinkingFlag: true,
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    wire: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    jsonMode: true,
    rpmLimit: null,
    thinkingFlag: false,
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    wire: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-5",
    // The Messages API has no response_format; parseJsonLoose plus the
    // two-round repair prompt already covers JSON asked for in prose.
    jsonMode: false,
    rpmLimit: null,
    thinkingFlag: false,
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    wire: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    jsonMode: true,
    rpmLimit: null,
    thinkingFlag: false,
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    wire: "openai",
    // Gemini's OpenAI-compatible endpoint keeps the whole pipeline on one wire.
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.5-flash",
    jsonMode: true,
    rpmLimit: null,
    thinkingFlag: false,
  },
  // Any OpenAI-compatible endpoint the student points at: a local gateway
  // (Ollama, LM Studio, vLLM), a proxy (LiteLLM, OpenRouter) or another
  // vendor's OpenAI-compatible API. No default URL or model — Settings
  // requires both before this provider can be saved. jsonMode stays off: an
  // unknown server may reject `response_format`, and the loose parser plus the
  // repair round gets JSON out of it either way.
  custom: {
    id: "custom",
    label: "Custom",
    wire: "openai",
    baseUrl: "",
    model: "",
    jsonMode: false,
    rpmLimit: null,
    thinkingFlag: false,
  },
};

/** The configured provider with its environment resolved. */
export type ActiveProvider = ProviderConfig & {
  apiKey: string;
  /** Effective window cap: explicit AI_RPM_LIMIT, else the provider default. */
  rpm: number | null;
};

const ALIASES: Record<string, ProviderId> = {
  nvidia: "nim",
  nvidia_nim: "nim",
  claude: "anthropic",
  google: "gemini",
  google_gemini: "gemini",
  gpt: "openai",
};

function normalizeId(raw: string | undefined): ProviderId | null {
  const value = raw?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!value) return null;
  if (Object.hasOwn(ALIASES, value)) return ALIASES[value];
  return Object.hasOwn(PROVIDERS, value) ? (value as ProviderId) : null;
}

let warnedUnknownProvider = false;

/**
 * `AI_PROVIDER` if set (unknown values warn once and fall back), otherwise
 * `nim` — which keeps every legacy `NVIDIA_NIM_*` install behaving exactly as
 * it did before the provider layer existed.
 */
export function resolveProviderId(): ProviderId {
  const raw = process.env.AI_PROVIDER;
  const id = normalizeId(raw);
  if (id) return id;
  const trimmed = raw?.trim();
  if (trimmed && !warnedUnknownProvider) {
    warnedUnknownProvider = true;
    console.warn(
      `[ai] unknown AI_PROVIDER "${trimmed}" — falling back to nim. Valid values: ${Object.keys(PROVIDERS).join(", ")}`,
    );
  }
  return "nim";
}

function apiKeyFor(id: ProviderId): string {
  const generic = process.env.AI_API_KEY?.trim();
  if (generic) return generic;
  // Legacy NVIDIA_NIM_* installs keep working untouched. The NIM key is never
  // offered to any other vendor — a provider switch requires its own key.
  if (id === "nim") return process.env.NVIDIA_NIM_API_KEY?.trim() ?? "";
  return "";
}

function baseUrlFor(config: ProviderConfig): string {
  const generic = process.env.AI_BASE_URL?.trim();
  if (generic) return generic.replace(/\/+$/, "");
  const legacy = config.id === "nim" ? process.env.NVIDIA_NIM_BASE_URL?.trim() : undefined;
  return (legacy || config.baseUrl).replace(/\/+$/, "");
}

function modelFor(config: ProviderConfig): string {
  const generic = process.env.AI_MODEL?.trim();
  if (generic) return generic;
  if (config.id === "nim") return process.env.NVIDIA_NIM_MODEL?.trim() || config.model;
  return config.model;
}

/**
 * An explicit `AI_RPM_LIMIT` applies to any provider; unset means the default.
 * Exported so per-user provider resolution applies the same override.
 */
export function explicitRpmLimit(): number | null {
  const raw = process.env.AI_RPM_LIMIT?.trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

export function activeProvider(): ActiveProvider {
  const config = PROVIDERS[resolveProviderId()];
  return {
    ...config,
    apiKey: apiKeyFor(config.id),
    baseUrl: baseUrlFor(config),
    model: modelFor(config),
    rpm: explicitRpmLimit() ?? config.rpmLimit,
  };
}

export function isAiConfigured(): boolean {
  return Boolean(activeProvider().apiKey);
}

export function assertAiConfigured(): void {
  const provider = activeProvider();
  if (!provider.apiKey) {
    throw new Error(
      provider.id === "custom"
        ? "No AI endpoint is configured. Set AI_PROVIDER=custom with AI_BASE_URL and AI_MODEL in .env.local, or choose Custom in Settings and paste an endpoint."
        : provider.id === "nim"
        ? "No AI API key is configured. Set NVIDIA_NIM_API_KEY (or AI_API_KEY with AI_PROVIDER=nim) in .env.local so the tutor, the course generator and the code grader can call the model."
        : `No ${provider.label} API key is configured. Set AI_PROVIDER=${provider.id} and AI_API_KEY in .env.local so the tutor, the course generator and the code grader can call the model.`,
    );
  }
}
