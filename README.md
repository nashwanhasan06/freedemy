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
| Course generation | Real. Transcript is fetched from YouTube's caption track, summarised window by window, then structured by the NIM model. No hardcoded courses are produced. |
| Tutor | Real. Grounded in the section's notes, key terms and exercises, with a timestamp back into the video. Conversation history persists and is compacted into a rolling summary once a session outgrows the prompt budget. |
| Grading | Real. MCQs and short answers are graded against the exercise, code is reviewed by the model with per-line errors, warnings and tips. |
| Progress | Real. Best score, attempts and completion are stored in Postgres and drive every badge and progress bar. |
| Final project | Real. One capstone brief per course, written from that course's own sections; submitted code is reviewed against its requirements and a pass marks the course complete. |
| Accounts | Real. Supabase Auth with email + password; RLS scopes every row to its owner. Sign-in and sign-up live on their own pages; the landing page invites visitors to paste a link first and only asks for an account when they press Generate, returning them to the same prefilled field. |

The three authored demo courses from the original prototype are seeded into a new account's
database on first visit, so there is something to study before generating anything.

## Stack

- Next.js 16.4 (App Router, Cache Components, Turbopack), React 19, Tailwind v4
- Supabase: Postgres, Auth, Row Level Security — `@supabase/ssr`
- NVIDIA NIM (OpenAI-compatible chat completions) for generation, grading and tutoring
- Model calls are paced by a sliding-window scheduler capped at **40 requests/minute**

## Setup

### 1. Install

```bash
npm install
```

### 2. Create the database

1. Create a project at <https://supabase.com/dashboard>.
2. Open **SQL Editor → New query**, paste all of `supabase/schema.sql`, and run it.
   This creates the tables, indexes, the profile trigger, and RLS policies on everything.
   The file is idempotent: run it again after pulling changes that add tables (the final
   project added `course_projects` and `project_submissions`).
3. In **Authentication → URL Configuration** set:
   - Site URL: `http://localhost:3000`
   - Redirect URLs: `http://localhost:3000/auth/callback`

If you leave email confirmation on (the default), a new account must click the link in its
inbox before signing in. Turn it off under **Authentication → Providers → Email** for faster
local testing.

### 3. Install the transcript tool

YouTube requires a proof-of-origin token to download captions, so Freedemy shells out to
[yt-dlp](https://github.com/yt-dlp/yt-dlp), which obtains one automatically:

```bash
winget install yt-dlp        # Windows
pip install -U yt-dlp        # any platform
```

Check it with `yt-dlp --version`. If it is not on `PATH`, point `YTDLP_PATH` at the binary.
There is a direct caption-endpoint fallback in `lib/ai/transcript.ts`, but it is blocked on
many networks — yt-dlp is what makes link-to-course reliable.

### 4. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Project Settings → API.
- `SUPABASE_SERVICE_ROLE_KEY` — same page, the secret key. The generator writes course
  content and usage rows on the server. It is never imported into client code.
- `NVIDIA_NIM_API_KEY` — your NIM key.
- `NVIDIA_NIM_MODEL` — defaults to `nvidia/nemotron-3-ultra-550b-a55b`. Any NIM-hosted chat model
  that supports JSON output works, but the account only has a subset of the catalogue enabled
  (`GET /v1/models` lists more than your key can call). A cut-off model returns HTTP 404.
- `RESEND_API_KEY`, `EMAIL_FROM` — optional, for password-reset emails. The reset link is minted
  with the service-role key and sent through Resend (`lib/email.ts`), so Supabase's own SMTP
  settings are not involved. `EMAIL_FROM` must be a sender verified in Resend → Domains; test
  mode only allows `Freedemy <onboarding@resend.dev>` and only delivers to your own account
  address. Without a key the link is printed to the server log instead (development only).

### 5. Run

```bash
npm run dev
```

Open <http://localhost:3000>, create an account, and paste a coding lecture with captions.

## How generation works

1. **Read** — `lib/ai/transcript.ts` runs `yt-dlp` to fetch the English caption track as JSON3
   plus the video metadata, then converts it into timestamped cues. If yt-dlp is missing it
   falls back to YouTube's caption endpoint directly.
2. **Map** — the transcript is split into at most 16 timed windows. Each window gets one model
   call that returns topic segments with timestamps and bullets.
3. **Outline** — one call turns those segments into 3–8 modules of 2–4 lessons, normalised so the
   timeline tiles the video without overlaps, and rejected unless it reaches the end of the video.
4. **Plan assessments** — one call per module decides how each section should be tested: two to
   four checks, each naming a testing move (recall, predict the output, find the bug, trace it,
   explain the trade-off, implement it) and the idea it targets. A conceptual section gets
   questions and a written answer; a hands-on section gets code. Nothing is templated.
5. **Write** — one call per section, from that section's own transcript slice: 3–4 note blocks of
   120–220 words of Markdown prose with worked examples, fenced code, tables and ```mermaid
   diagrams, plus exactly the exercises the plan asked for (starter code, solution, hint).
6. **Persist** — modules, lessons, and exercises are written to Supabase; the course row moves
   through `queued → fetching → outlining → writing → ready` (or `failed`, with a retry).

The generating screen polls `/api/courses/[id]/status` every 1.6s.

Sections are readable the moment they are persisted: `/course/[slug]` opens while the build is
still `writing` (and after a `failed` build, so finished work is never lost), shows a build
banner, and re-renders every 20s so newly written sections appear without a manual reload. Only
a course with zero sections yet sends the student back to the generating screen.

### Staying inside 40 RPM

`lib/ai/limiter.ts` enforces four things:

- A rolling 60-second window capped at `AI_RPM_LIMIT` (40). No burst can exceed it.
- Separate in-flight caps per lane: at most `AI_CONCURRENCY` (4) interactive requests
  (tutor, grading) and at most `AI_BACKGROUND_CONCURRENCY` (10) background generation
  requests — a busy build cannot fill every slot and starve a student.
- Background generation is capped at `rpm - AI_INTERACTIVE_RESERVE` (32/min), so a student
  submitting an assignment or asking the tutor always has ~8 requests/minute of headroom.

429 and 5xx responses are retried with `Retry-After` or exponential backoff (4 attempts).
Every call is logged to `ai_usage` for auditing.

A long lecture costs roughly 16 + 1 + 8 ≈ 25 calls, so a build takes about a minute and never
crosses the account limit.

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

`supabase/schema.sql` defines:

- `profiles` — one row per auth user, created by trigger.
- `courses` — owner, slug, video metadata, generation status and stage.
- `modules` → `lessons` → `exercises` — the course content, with notes/key terms as JSONB.
- `submissions` — every graded attempt, with feedback and errors.
- `lesson_progress` — best score, attempts, completion per student per lesson.
- `course_projects` — the generated capstone brief, its requirements and the starter code.
- `project_submissions` — every project attempt with its score, checklist and errors.
- `tutor_messages` — the persisted conversation per student per lesson.
- `tutor_summaries` — one rolling summary per student per lesson, plus the timestamp it covers.
- `ai_usage` — model call log (service role only).

Every table has RLS enabled. Students can only touch rows they own; content tables are reachable
only through a course they own. `ai_usage` has RLS with no policies, so only the service role
can read or write it. The anon key is safe to ship; the service role key never leaves the server.

Server Actions re-read the session and derive the user id from the verified token — never from
client input — and the database re-checks ownership through RLS on every write.

## Project layout

```
proxy.ts                     Session refresh + optimistic auth redirects (Next 16 proxy)
app/
  page.tsx                   Landing page and the link form (for visitors too; Generate sends them to sign in)
  login/ signup/ auth/       Auth pages and the PKCE callback
  dashboard/                 The student's courses, statuses and progress
  generating/                Live generation screen
  course/[slug]/             Course workspace (player, notes, assignment, tutor tab)
  course/[slug]/tutor/       Full-page assignment tutor
  course/[slug]/project/     End-of-course capstone: brief, code submission, review
  api/courses/[id]/status/   Polling endpoint for generation
lib/
  ai/transcript.ts           YouTube metadata + captions
  ai/generate.ts             Map → outline → write pipeline
  ai/limiter.ts              40 RPM scheduler
  ai/nim.ts                  NIM client, JSON validation, retries, usage log
  ai/prompts.ts              All model prompts
  ai/tutor-session.ts        Tutor thread window and rolling summary compaction
  actions/                   Server Actions: auth, courses, grading, tutor
  db/                        Row mapping, dashboard queries, demo seeding
  supabase/                  Request-scoped and service-role clients
supabase/schema.sql          Tables, policies, triggers
```

## Operational notes

- Generation runs as a background task inside the Node server that handled the request. That is
  fine for local use and a single long-running host. On a serverless platform, move
  `startCourseJob` to a queue/worker; the course row already carries the status the UI needs.
- Videos without captions fail with a clear message; there is no audio transcription fallback yet.
- `yt-dlp` must be installed on the machine that runs generation. It also needs to be reachable
  from the server process (not the browser).
- If the NIM model does not support `response_format: json_object`, the client still extracts the
  first JSON object from the reply and retries once with a repair prompt.
- `AI_RPM_LIMIT` exists so the account ceiling can be lowered for a smaller plan without touching
  code.

## Scripts

```bash
npm run dev     # Next dev server
npm run build   # Production build
npm start       # Serve the build
npm run lint    # ESLint
```
