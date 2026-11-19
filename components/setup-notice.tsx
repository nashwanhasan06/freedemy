import { AlertTriangle, CircleCheck } from "lucide-react";

import { setupProblems } from "@/lib/env";

export async function SetupNotice() {
  const problems = await setupProblems();

  if (problems.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <CircleCheck className="size-5 text-emerald-500" />
          <h1 className="text-[1.1rem] font-semibold tracking-tight">All set</h1>
        </div>
        <p className="mt-2 text-[0.85rem] leading-relaxed text-muted-foreground">
          Everything is configured — nothing is missing. AI keys and update preferences live in
          Settings (the gear icon in the header).
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-5 text-warning-ink" />
        <h1 className="text-[1.1rem] font-semibold tracking-tight">Finish the setup</h1>
      </div>

      <p className="mt-2 text-[0.85rem] leading-relaxed text-muted-foreground">
        Freedemy stores everything locally by itself — the only thing it needs from you is an AI
        key (and yt-dlp for transcripts). Missing:
      </p>

      <ul className="mt-3 flex flex-col gap-1.5">
        {problems.map((problem) => (
          <li
            key={problem}
            className="rounded-lg border border-border bg-muted/60 px-3 py-2 text-[0.8rem] font-medium"
          >
            {problem}
          </li>
        ))}
      </ul>

      <ol className="mt-4 flex list-decimal flex-col gap-3 pl-5 text-[0.82rem] leading-relaxed text-foreground/80">
        <li>
          Sign in and open <strong>Settings</strong> (the gear icon in the header), then paste your
          API key for the provider you want — NVIDIA NIM, OpenAI, Anthropic, DeepSeek or Gemini.
        </li>
        <li>
          Or set it machine-wide: copy <code>.env.example</code> to <code>.env.local</code> and set{" "}
          <code>AI_PROVIDER</code> and <code>AI_API_KEY</code> (or the legacy{" "}
          <code>NVIDIA_NIM_API_KEY</code> for NIM), then restart <code>npm run dev</code>.
        </li>
        <li>
          Install <code>yt-dlp</code> so transcripts can be downloaded (
          <code>setup.mjs</code> does this for you, or <code>winget install yt-dlp</code> /{" "}
          <code>pip install -U yt-dlp</code>).
        </li>
      </ol>
    </div>
  );
}
