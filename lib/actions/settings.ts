"use server";

import { PROVIDERS } from "@/lib/ai/provider";
import { getCurrentUser } from "@/lib/auth";
import { userDb } from "@/lib/storage/server";
import { settingsViewFor, type SettingsView } from "@/lib/settings";

export type SaveSettingsInput = {
  /** Provider id; omitted = leave unchanged. */
  provider?: string;
  /** New API key (trimmed); "" = keep the saved one. */
  apiKey?: string;
  /** Remove the saved key. */
  clearKey?: boolean;
  /** Model override; "" (or omitted with clear semantics) = provider default. */
  model?: string;
  /** Endpoint — the Custom provider's URL; "" = clear. Only sent for Custom. */
  baseUrl?: string;
};

export type SaveSettingsResult =
  | { ok: true; view: SettingsView }
  | { ok: false; error: string };

/** `new URL().protocol`, or null when the text is not a parseable URL. */
function safeProtocol(raw: string): string | null {
  try {
    return new URL(raw).protocol;
  } catch {
    return null;
  }
}

/**
 * Save the popup form. Partial patches: fields that are absent or blank are
 * left alone (a blank API key means "keep the saved one" — clearing is the
 * explicit `clearKey` path), so one failed field never wipes another. A blank
 * model or endpoint does clear, because the popup always submits the field's
 * current text: blank there means "erase the override".
 */
export async function saveSettingsAction(input: SaveSettingsInput): Promise<SaveSettingsResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to change settings." };

  const provider = input.provider;
  if (provider !== undefined && !Object.hasOwn(PROVIDERS, provider)) {
    return { ok: false, error: "Pick a known AI provider." };
  }

  const apiKey = (input.apiKey ?? "").trim();
  if (apiKey.length > 512) return { ok: false, error: "That API key looks too long." };
  const model = (input.model ?? "").trim();
  if (model.length > 120) return { ok: false, error: "Use a shorter model name (120 characters max)." };

  // Trailing slashes come off on save: the transport appends the wire path.
  const baseUrl = (input.baseUrl ?? "").trim().replace(/\/+$/, "");
  if (baseUrl.length > 500) {
    return { ok: false, error: "That endpoint URL looks too long (500 characters max)." };
  }
  if (baseUrl) {
    const protocol = safeProtocol(baseUrl);
    if (!protocol) {
      return { ok: false, error: "Enter a full endpoint URL, like https://api.example.com/v1." };
    }
    if (protocol !== "http:" && protocol !== "https:") {
      return { ok: false, error: "The endpoint must be an http(s) URL." };
    }
  }

  // Custom ships no defaults: without a URL there is nothing to call, and
  // without a model name every request would fail at the server. Both are
  // required the moment Custom is the chosen provider.
  if (provider === "custom") {
    if (!baseUrl) {
      return {
        ok: false,
        error: "Custom needs an endpoint — paste the API base URL, like http://localhost:11434/v1.",
      };
    }
    if (!model) {
      return { ok: false, error: "Custom needs a model name, like llama3.1:8b." };
    }
  }

  const patch: Record<string, unknown> = {};
  if (provider !== undefined) patch.provider = provider;
  if (input.clearKey) patch.api_key = null;
  else if (apiKey) patch.api_key = apiKey;
  if (input.model !== undefined) patch.model = model || null;
  if (input.baseUrl !== undefined) patch.base_url = baseUrl || null;

  if (Object.keys(patch).length > 0) {
    const db = await userDb();
    const { error } = await db
      .from("user_settings")
      .upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true, view: await settingsViewFor(user.id) };
}
