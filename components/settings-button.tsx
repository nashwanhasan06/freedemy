"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Settings } from "lucide-react";
import { toast } from "sonner";

import { saveSettingsAction } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { PROVIDERS } from "@/lib/ai/provider";
import type { SettingsView } from "@/lib/settings";

type Props = {
  initial: SettingsView;
};

/**
 * The header settings popup: per-user AI provider / API key / model / custom
 * endpoint. Saved through the `settings` server actions — the key itself never
 * round-trips to the client, only its last four characters.
 */
export function SettingsButton({ initial }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const [view, setView] = useState(initial);
  const [provider, setProvider] = useState(initial.provider);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(initial.model);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [saving, setSaving] = useState(false);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function save() {
    setSaving(true);
    // The endpoint field exists only for Custom, so it is only ever sent for
    // Custom: a named vendor must never store (or clear) someone's gateway URL.
    const result = await saveSettingsAction({
      provider,
      apiKey,
      model,
      ...(provider === "custom" ? { baseUrl } : {}),
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setView(result.view);
    setApiKey("");
    toast.success("Settings saved");
  }

  return (
    <div className="relative" ref={rootRef}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Settings"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="h-8 gap-1.5 px-2.5 text-[0.8rem]"
      >
        <Settings className="size-3.5" />
        <span className="hidden sm:inline">Settings</span>
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(23rem,calc(100vw-2rem))] max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-2xl">
          {/* ---- AI provider ---- */}
          <h3 className="text-[0.8rem] font-semibold uppercase tracking-wide text-muted-foreground">
            AI provider
          </h3>

          <label className="mt-2 block">
            <span className="sr-only">Provider</span>
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value as typeof provider)}
              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-[0.82rem] focus:border-primary focus:outline-none"
            >
              {Object.values(PROVIDERS).map((config) => (
                <option key={config.id} value={config.id}>
                  {config.label}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-2 flex gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">API key</span>
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={
                  view.hasKey ? `Saved ····${view.keyLast4} — type to replace` : "API key"
                }
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-[0.82rem] focus:border-primary focus:outline-none"
              />
            </label>
            {view.hasKey && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0 px-2.5 text-[0.75rem]"
                onClick={() => void saveSettingsAction({ clearKey: true }).then((result) => {
                  if (result.ok) {
                    setView(result.view);
                    setApiKey("");
                    toast.success("API key removed");
                  } else {
                    toast.error(result.error);
                  }
                })}
              >
                Clear
              </Button>
            )}
          </div>

          <label className="mt-2 block">
            <span className="sr-only">Model override</span>
            <input
              type="text"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder={
                provider === "custom"
                  ? "Model (required, e.g. llama3.1:8b)"
                  : // view.defaultModel is only computed for view.provider, so
                    // until a switch is saved show the chosen vendor's own default.
                    `Model (default: ${provider === view.provider ? view.defaultModel : PROVIDERS[provider].model})`
              }
              spellCheck={false}
              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-[0.82rem] focus:border-primary focus:outline-none"
            />
          </label>

          {provider === "custom" && (
            <label className="mt-2 block">
              <span className="sr-only">API endpoint</span>
              <input
                type="text"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="API endpoint (e.g. http://localhost:11434/v1)"
                spellCheck={false}
                autoComplete="off"
                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-[0.82rem] focus:border-primary focus:outline-none"
              />
            </label>
          )}

          <p className="mt-2 text-[0.72rem] leading-relaxed text-muted-foreground">
            {provider === "custom"
              ? "Custom talks to any OpenAI-compatible URL — Ollama, LM Studio, LiteLLM or another vendor; keep the /v1 suffix. A local gateway usually needs no key. "
              : "Choose Custom to point Freedemy at your own endpoint. "}
            Keys are stored on this machine, for your account only. Leave the key blank to keep the
            saved one{view.hasKey ? "" : ", or the shared .env.local key"}.
          </p>

          <Button
            type="button"
            size="sm"
            onClick={() => void save()}
            disabled={saving}
            className="mt-3 w-full gap-1.5 text-[0.8rem]"
          >
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
