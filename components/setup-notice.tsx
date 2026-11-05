import { AlertTriangle } from "lucide-react";

import { setupProblems } from "@/lib/env";

export function SetupNotice() {
  const problems = setupProblems();

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-5 text-warning-ink" />
        <h1 className="text-[1.1rem] font-semibold tracking-tight">Finish the setup</h1>
      </div>

      <p className="mt-2 text-[0.85rem] leading-relaxed text-muted-foreground">
        Freedemy needs a Supabase project and an NVIDIA NIM key before accounts and courses can
        work. Missing:
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
          Create a project at{" "}
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline underline-offset-4"
          >
            supabase.com/dashboard
          </a>
          .
        </li>
        <li>
          Open <strong>SQL Editor</strong> and run the contents of <code>supabase/schema.sql</code>.
          That creates the tables, the progress and submission policies, and RLS on every table.
        </li>
        <li>
          Copy <code>.env.example</code> to <code>.env.local</code> and fill in the project URL,
          the anon key and the service role key from <strong>Project Settings → API</strong>, plus
          your <code>NVIDIA_NIM_API_KEY</code>.
        </li>
        <li>
          Install <code>yt-dlp</code> so transcripts can be downloaded (
          <code>winget install yt-dlp</code> or <code>pip install -U yt-dlp</code>), then check{" "}
          <code>yt-dlp --version</code>.
        </li>
        <li>Restart <code>npm run dev</code>.</li>
      </ol>
    </div>
  );
}
