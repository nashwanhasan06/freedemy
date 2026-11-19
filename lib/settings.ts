/**
 * The Settings view model: one shape shared by the header popup (initial
 * render) and the save action (fresh state after a write). The saved API key
 * never leaves the server — the client only ever sees whether one exists and
 * its last four characters.
 */
import "server-only";

import {
  PROVIDERS,
  activeProvider,
  resolveProviderId,
  type ProviderId,
} from "@/lib/ai/provider";
import { userDbFor } from "@/lib/storage";

export type SettingsView = {
  /** Saved provider, else the environment's. */
  provider: ProviderId;
  /** Whether `provider` came from a saved row (vs. the env default). */
  providerIsSaved: boolean;
  /** Saved model override ("" = the provider default). */
  model: string;
  /** The model that applies when no override is saved. */
  defaultModel: string;
  /** Saved endpoint — the Custom provider's own URL ("" = none). */
  baseUrl: string;
  hasKey: boolean;
  keyLast4: string;
};

type SettingsRow = {
  provider: string | null;
  api_key: string | null;
  model: string | null;
  base_url: string | null;
};

export async function settingsViewFor(userId: string): Promise<SettingsView> {
  const { data } = await userDbFor(userId)
    .from("user_settings")
    .select("provider, api_key, model, base_url")
    .eq("user_id", userId)
    .maybeSingle();
  const row = (data as SettingsRow | null) ?? null;

  const envId = resolveProviderId();
  const savedId =
    row?.provider && Object.hasOwn(PROVIDERS, row.provider)
      ? (row.provider as ProviderId)
      : null;
  const provider = savedId ?? envId;
  const model = row?.model?.trim() || "";
  const key = row?.api_key?.trim() || "";

  return {
    provider,
    providerIsSaved: savedId !== null,
    model,
    defaultModel: provider === envId ? activeProvider().model : PROVIDERS[provider].model,
    baseUrl: row?.base_url?.trim() || "",
    hasKey: key.length > 0,
    keyLast4: key ? key.slice(-4) : "",
  };
}
