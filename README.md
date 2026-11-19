# Freedemy

Turn a YouTube coding or computer-science lecture into a course you can actually pass.

Paste a link. Freedemy reads the video's captions and description, splits the lecture into
modules and sections, writes notes and key terms, and builds a graded assignment per section —
multiple choice, a short answer, and real coding tasks. A tutor for each assignment lives on its
own chat page, answers only from that section, and points back to the moment in the video. Every
attempt, mark and conversation is stored per student.

## What is real (and what used to be fake)

| Area | Now |
| --- | --- |
| Course generation | Real. Transcript is fetched from YouTube's caption track, summarised window by window, then structured by the active AI model. No hardcoded courses are produced. |
| Tutor | Real. Grounded in the section's notes, key terms and exercises, with a timestamp back into the video. Conversation history persists and is compacted into a rolling summary once a session outgrows the prompt budget. |
| Grading | Real. MCQs and short answers are graded against the exercise, code is reviewed by the model with per-line errors, warnings and tips. |
| Progress | Real. Best score, attempts and completion are stored in SQLite and drive every badge and progress bar. |
| Final project | Real. One capstone brief per course, written from that course's own sections; submitted code is reviewed against its requirements and a pass marks the course complete. |
| Accounts | Real. Local accounts only — no email provider anywhere. Sign-in shows every account on the machine as a card; passwords are scrypt-hashed and recovery goes through each account's own security question. Every account saves its own AI provider and API key in Settings, and a key saved for one vendor is never offered to another. |

The three authored demo courses from the original prototype are seeded into a new account at
sign-up, so there is something to study before generating anything.

## Stack

- Next.js 16.4 (App Router, Cache Components, Turbopack), React 19, Tailwind v4
- Embedded SQLite (`better-sqlite3`, `data/freedemy.db`) — schema in `schema.sqlite.sql`,
  applied automatically at first run. No Postgres, no Docker, no hosted services.
- Local auth: scrypt password hashes, HMAC-signed session cookie, security-question recovery
- Any of six AI providers — NVIDIA NIM, OpenAI, Anthropic, DeepSeek, Google Gemini or
  **Custom** (your own OpenAI-compatible endpoint) — chosen
  machine-wide in `.env.local` or per account in Settings
- Rate limits belong to the provider account: NIM defaults to a **40 requests/minute** window,
  the others run unlimited unless you opt in with `AI_RPM_LIMIT`

## Setup

Everything runs on your machine: the database, the accounts, the AI keys. There
is nothing to sign up for besides the AI vendor you choose.

### 1. Get the code

```bash
git clone https://github.com/nashwanhasan06/freedemy.git
cd freedemy
```

No git? Download the latest release zip from
<https://github.com/nashwanhasan06/freedemy/releases> and extract it — every
command below works the same.

### 2. Run the setup file

```bash
node setup.mjs
```

One file, one run. It checks your Node version (≥ 20.9), runs `npm install`
(and verifies the native SQLite binding actually loads), creates `.env.local`
from `.env.example` — every value in it is optional — and installs
[yt-dlp](https://github.com/yt-dlp/yt-dlp) if it is missing. yt-dlp is what
fetches YouTube's caption track, which is what makes link-to-course work.

### 3. Run

```bash
npm run dev
```

Open <http://localhost:3000>, create an account (display name, password, and a
security question for recovery — no email is involved anywhere), then open
**Settings** (gear icon, top right) and paste your AI API key:

| Provider | Get a key |
| --- | --- |
| NVIDIA NIM | <https://build.nvidia.com> (the default) |
| OpenAI | <https://platform.openai.com/api-keys> |
| Anthropic | <https://console.anthropic.com> |
| DeepSeek | <https://platform.deepseek.com> |
| Google Gemini | <https://aistudio.google.com/apikey> |
| Custom | Any OpenAI-compatible endpoint — Ollama, LM Studio, LiteLLM, a proxy |

Pick **Custom** and paste the endpoint URL (keep the `/v1` suffix, e.g.
`http://localhost:11434/v1`) plus a model name; the API key is optional, since
a local gateway usually needs none.

The key is stored on this machine, for your account only — it never round-trips
to the browser and never leaves the machine. You can also set it machine-wide
instead: copy `.env.example` to `.env.local`, fill in `AI_PROVIDER` and
`AI_API_KEY`, and restart. A per-account key always wins.

That's the whole setup. Paste a coding lecture with captions and press
Generate.

## How generation works

1. **Read** — `lib/ai/transcript.ts` runs `yt-dlp` to fetch the English caption track as JSON3
   plus the video metadata, then converts it into timestamped cues. If yt-dlp is missing it
   falls back to YouTube's caption endpoint directly.
2. **Map** — the transcript is split into fixed 20-minute windows (a longer video maps in more
   windows, never bigger ones, so every window stays inside the prompt's character budget). Each
   window gets one model call that returns topic segments with timestamps and bullets.
3. **Outline** — one call turns those segments into modules scaled to the runtime (no fixed
   ceiling, at least 4 lessons each), guided but not bound by the chapter timestamps yt-dlp
   reads from the video description, normalised so the timeline tiles the video without
   overlaps, and rejected unless it reaches the end of the video.
4. **Plan assessments** — one call per module decides how each section should be tested: two to
   four checks, each naming a testing move (recall, predict the output, find the bug, trace it,
   explain the trade-off, implement it) and the idea it targets. A conceptual section gets
   questions and a written answer; a hands-on section gets code. Nothing is templated.
5. **Write** — one call per section, from that section's own transcript slice: 3–4 note blocks of
   120–220 words of Markdown prose with worked examples, fenced code, tables and ```mermaid
   diagrams, plus exactly the exercises the plan asked for (starter code, solution, hint).
6. **Persist** — modules, lessons, and exercises are written to SQLite; the course row moves
   through `queued → fetching → outlining → writing → ready` (or `failed`, with a retry).

The generating screen polls `/api/courses/[id]/status` every 1.6s.

Sections are readable the moment they are persisted: `/course/[slug]` opens while the build is
still `writing` (and after a `failed` build, so finished work is never lost), shows a build
banner, and re-renders every 20s so newly written sections appear without a manual reload. Only
a course with zero sections yet sends the student back to the generating screen.

### Staying inside the provider's rate limit

`lib/ai/limiter.ts` keeps one limiter **per provider account** (`aiLimiterFor`), so a
student on OpenAI never inherits NIM's window, and a NIM 429 cooldown only pauses NIM's
lanes. Within a window it enforces:

- A rolling 60-second cap when the provider has one — NIM defaults to 40 RPM;
  `AI_RPM_LIMIT` opts any provider into a window (and can lower NIM's).
- Every real HTTP request takes a slot of its own — including each retry — so a
  call that retries four times costs four slots, not one.
- Separate in-flight caps per lane: at most `AI_CONCURRENCY` (4) interactive requests
  (tutor, grading) and at most `AI_BACKGROUND_CONCURRENCY` (10) background generation
  requests — a busy build cannot fill every slot and starve a student.
- On a capped provider, background generation is held below `rpm - AI_INTERACTIVE_RESERVE`,
  so a student submitting an assignment or asking the tutor always has headroom.
- On a provider 429 the whole lane pauses together and the ceiling itself shrinks by
  25% (floor 4/min), then earns one request back per quiet minute — so the client stays
  under whatever the account's real limit turns out to be.

429s wait 30s → 60s → 120s → 180s (or the server's `Retry-After`, whichever is longer) and
pause every lane for the same time; 5xx and transport errors retry with exponential backoff.
A long build slows down instead of failing. Every call is logged to `ai_usage` for auditing.

A build costs roughly `windows + 1 + modules + lessons` model calls: a 3.5-hour lecture needs
~11 + 1 + 4 + 25 ≈ 40 calls (a couple of minutes), and even a 70-hour marathon (~210 map calls
plus the outline, plans and lessons) is paced under the provider's window, so on NIM it takes
longer but never crosses the 40 RPM account limit.

> The limiter is process-local, which is correct for `next dev` / `next start` on one machine.
> If you scale to several instances, move the window to Redis or a Postgres table so the cap is
> global.

## Grading and the tutor

`submitAssignmentAction` (`lib/actions/assignments.ts`):

- Grades multiple choice deterministically.
- Sends short answers and code to the model in **one** call, with the exercise brief, reference
  keywords/solution and the student's text.
- Stores one `submissions` row per exercise and upserts `lesson_progress` with the best score,
  attempt count and completion (≥70%).
- Returns structured feedback: `{severity, message, line, code}` for each error, rendered under
  the code editor.

The assignment panel links to `/course/[slug]/tutor?lesson=<id>`, a full-page chat backed by
`tutor_messages`. Replies are JSON (`{answer, at}`), validated and timestamp-clamped to the
lesson, so the "rewatch" chip always lands inside the section.

A long tutoring session is compacted rather than truncated. The last eight turns are sent word
for word; when the thread passes ~10 000 characters, the turns older than that window are folded
into one running summary in `tutor_summaries` and `covered_until` records how far it reaches. The
next question is answered from the summary plus the recent turns, so a bug the student hit twenty
messages ago is still in scope. Folding costs one extra model call, and only on the turns where
the budget is crossed; a failed fold keeps the plain window instead of failing the answer. The
full transcript stays in `tutor_messages` — nothing is deleted, and the page shows the latest 60
messages.

## The final project

Every course ends in one capstone, at `/course/[slug]/project`:

The brief is generated **once per course** (`createProjectAction`) from that course's own
modules and key terms, then cached in `course_projects` so every visit and every review judges
the student against the same four to six requirements. If the model is unavailable, a
requirements list built from the course's section titles is stored instead.

`submitProjectAction` sends the code and the requirement list to the model in one call. The
result is normalised against the brief — one checklist row per requirement, whatever the model
returned — and stored in `project_submissions` with its score, summary and errors. A submission
passes when the model says so **and** the score is at least 70. Nothing is executed: the review
is a static read of the code, exactly like the lesson coding tasks. Reviews are capped at 25 per
project.

A passed project is what marks a course complete: the course sidebar shows a *Passed* badge and
the dashboard card shows *Project complete*. There is no separate completion table — completion
is a query for a passing submission.

## Data model and security

`schema.sqlite.sql` (applied automatically at first run, idempotent) defines:

- `users` — display name, scrypt password hash, security question + answer hash.
- `user_settings` — per-account AI provider, API key, model and endpoint overrides.
- `courses` → `course_videos` — owner, slug, video metadata, generation status and stage.
- `modules` → `lessons` → `exercises` — the course content, with notes/key terms as JSON.
- `submissions` — every graded attempt, with feedback and errors.
- `lesson_progress` — best score, attempts, completion per student per lesson.
- `course_projects` — the generated capstone brief, its requirements and the starter code.
- `project_submissions` — every project attempt with its score, checklist and errors.
- `tutor_messages` / `tutor_summaries` — the persisted conversation per student per lesson,
  plus the rolling summary of older turns.
- `chapter_quizzes` — the end-of-module exam questions.
- `ai_usage` — model call log for auditing.

The storage layer (`lib/storage/`) speaks the same query-builder shape the app
used against Postgres, but scope rules replace row-level security: a
session-bound client (`userDb()`) can only ever read and write its own rows —
every query gets the owner filter applied in the builder, user-scoped inserts
auto-inject `user_id`, and `users` / `user_settings` are server-only tables.
An anonymous request gets a client that matches nothing, exactly like the old
anon role.

Server Actions re-read the session cookie (HMAC-verified against
`data/session.secret`, created automatically) and derive the user id from it —
never from client input. Login is rate-limited to five failures per 30 seconds
per account, and API keys are read from SQLite on the server only; the client
sees whether a key exists and its last four characters, nothing more.

## Project layout

```
setup.mjs                   The one-time setup: Node check, npm install, .env.local, yt-dlp
proxy.ts                     Session refresh + optimistic auth redirects (Next 16 proxy)
instrumentation.ts           Boot hook: silent daily yt-dlp self-update
schema.sqlite.sql            Tables + indexes, applied automatically at first run
app/
  page.tsx                   Landing page and the link form (for visitors too; Generate sends them to sign in)
  login/ signup/ recover/    Account picker + password, sign-up, security-question recovery
  setup/                     "Finish the setup" checklist (only if something is missing)
  dashboard/                 The student's courses, statuses and progress
  generating/                Live generation screen
  course/[slug]/             Course workspace (player, notes, assignment, tutor tab)
  course/[slug]/tutor/       Full-page assignment tutor
  course/[slug]/project/     End-of-course capstone: brief, code submission, review
  api/courses/[id]/status/   Polling endpoint for generation
lib/
  storage/                   Embedded SQLite layer: query builder + per-user scope rules
  auth.ts + auth/            Session lookup, scrypt hashing, HMAC cookie, lockout
  settings.ts                Settings view model (key never leaves the server)
  updates.ts                Silent daily yt-dlp self-update (boot hook)
  actions/                   Server Actions: auth, courses, grading, tutor, settings
  ai/provider.ts             The six-provider config table + env resolution
  ai/user-provider.ts        Per-account provider/key resolution over the env
  ai/transcript.ts           YouTube metadata + captions
  ai/generate.ts             Map → outline → write pipeline
  ai/limiter.ts              Per-provider rate limiters
  ai/nim.ts                  Transport (OpenAI wire vs Anthropic), JSON validation, retries, usage log
  ai/prompts.ts              All model prompts
  ai/tutor-session.ts        Tutor thread window and rolling summary compaction
  db/                        Row mapping, dashboard queries, demo seeding
components/
  settings-button.tsx        The Settings popup: provider, key, model, endpoint
```

## Operational notes

- Generation runs as a background task inside the Node server that handled the request. That is
  fine for local use and a single long-running host. On a serverless platform, move
  `startCourseJob` to a queue/worker; the course row already carries the status the UI needs.
- Videos without captions fail with a clear message; there is no audio transcription fallback yet.
- `yt-dlp` must be installed on the machine that runs generation. It also needs to be reachable
  from the server process (not the browser). It self-updates silently once a day.
- If the active model does not support `response_format: json_object`, the client still extracts
  the first JSON object from the reply and retries once with a repair prompt.
- `AI_RPM_LIMIT` opts any provider into a window (or lowers NIM's) without touching code.
- Everything stateful lives in `data/` — the SQLite database and the session secret. Back up that
  folder to back up the whole app; delete it to start over.
- There is no in-app updater: update dependencies with `npm update`, yt-dlp with `yt-dlp -U`
  (or leave it to the daily silent update), and the app with `git pull`.

## Scripts

```bash
node setup.mjs # first-time setup (also re-runnable; safe to run after git pull)
npm run dev     # Next dev server
npm run build   # Production build
npm start       # Serve the build
npm run lint    # ESLint
```

### Migrating an account from the old hosted version

If you used the Supabase-hosted Freedemy before this repo went local,
`scripts/export-supabase.mjs` copies one student's rows into `data/freedemy.db`,
preserving every id so foreign keys keep pointing at the same rows. It needs
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`
(service-role key — row security no longer exists locally) plus credentials for
the local account:

```bash
node scripts/export-supabase.mjs --dry-run --user "<name>"   # preview
MIGRATE_PASSWORD=... MIGRATE_QUESTION=... MIGRATE_ANSWER=... \
  node scripts/export-supabase.mjs --user "<name>"
```

It writes a `VACUUM INTO` backup next to the database first, and inserts with
`INSERT OR IGNORE`, so re-running is safe. Once your data is local, delete the
two Supabase variables — nothing else in the app reads them.
