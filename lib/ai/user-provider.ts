/**
 * Per-user provider resolution: a student's saved Settings (provider, API key,
 * model, endpoint) win; whatever they left blank falls back to the environment
 * (.env.local). A key saved for one vendor is never offered to another — the
 * same rule the env layer applies to the legacy `NVIDIA_NIM_API_KEY`.
 *
 * Resolution is per call (a settings change takes effect on the next request)
 * and costs one SQLite read — an AI call is orders of magnitude slower anyway.
 */
import "server-only";

import {
  PROVIDERS,
  activeProvider,
  explicitRpmLimit,
  type ActiveProvider,
  type ProviderId,
} from "@/lib/ai/provider";
import { adminDb, userDbFor } from "@/lib/storage";

type SettingsRow = {
  provider: string | null;
  api_key: string | null;
  model: string | null;
  base_url: string | null;
};

function validProvider(raw: string | null | undefined): ProviderId | null {
  return raw && Object.hasOwn(PROVIDERS, raw) ? (raw as ProviderId) : null;
}

async function settingsRow(userId: string): Promise<SettingsRow | null> {
  const { data, error } = await userDbFor(userId)
    .from("user_settings")
    .select("provider, api_key, model, base_url")
    .eq("user_id", userId)
    .maybeSingle();
  return error ? null : ((data as SettingsRow | null) ?? null);
}

/** The provider for one user's AI call: their Settings row over the env. */
export async function resolveProviderFor(userId?: string | null): Promise<ActiveProvider> {
  const env = activeProvider();
  if (!userId) return env;
  const row = await settingsRow(userId);
  if (!row) return env;

  const id = validProvider(row.provider);
  // A stored provider we don't recognize means the row can't be trusted: its
  // key belongs to an unknown vendor, so it must never ride along with the
  // env provider (the isolation rule). Ignore the whole row.
  if (row.provider && !id) return env;
  const resolved = id ?? env.id;
  const config = PROVIDERS[resolved];
  const sameAsEnv = resolved === env.id;
  const userKey = row.api_key?.trim() || "";
  const userModel = row.model?.trim() || "";
  // The endpoint belongs to the Custom provider alone: a named vendor always
  // uses its own URL, so switching away from Custom can never leave a stale
  // gateway sitting in front of OpenAI. Trailing slashes come off because the
  // transport appends "/chat/completions" or "/messages".
  const userBaseUrl =
    resolved === "custom" ? row.base_url?.trim().replace(/\/+$/, "") || "" : "";

  return {
    ...config,
    // Their key first; otherwise the env key only when they stayed on the
    // env's provider — a provider switch requires its own key.
    apiKey: userKey || (sameAsEnv ? env.apiKey : ""),
    baseUrl: userBaseUrl || (sameAsEnv ? env.baseUrl : config.baseUrl),
    model: userModel || (sameAsEnv ? env.model : config.model),
    rpm: explicitRpmLimit() ?? config.rpmLimit,
  };
}

/** True when the environment or any account already has an AI key. */
export async function hasAnyAiKey(): Promise<boolean> {
  if (activeProvider().apiKey) return true;
  const { data } = await adminDb().from("user_settings").select("api_key").limit(50);
  return Boolean(data?.some((row: { api_key: string | null }) => row.api_key?.trim()));
}

/**
 * True when any account points the Custom provider at an endpoint. A keyless
 * local gateway (Ollama) is a complete setup, so it satisfies the machine-wide
 * check exactly like an account's saved key does.
 */
export async function hasAnyCustomEndpoint(): Promise<boolean> {
  const { data } = await adminDb()
    .from("user_settings")
    .select("provider, base_url")
    .limit(50);
  return Boolean(
    data?.some(
      (row: { provider: string | null; base_url: string | null }) =>
        row.provider === "custom" && Boolean(row.base_url?.trim()),
    ),
  );
}
