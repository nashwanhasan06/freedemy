-- Freedemy — Supabase schema, row level security and helpers.
-- Paste this whole file into the Supabase SQL editor (Dashboard → SQL → New query)
-- and run it once. It is safe to re-run: tables and policies are guarded.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'course_status') then
    create type public.course_status as enum
      ('queued', 'fetching', 'outlining', 'writing', 'ready', 'failed');
  end if;
  if not exists (select 1 from pg_type where typname = 'exercise_kind') then
    create type public.exercise_kind as enum ('mcq', 'short', 'code');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Profiles (one row per auth user)
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Courses
-- ---------------------------------------------------------------------------

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  slug text not null,
  title text not null,
  channel text not null default '',
  video_id text not null,
  source_url text not null,
  description text not null default '',
  level text not null default 'Intermediate',
  language text not null default 'python',
  duration_seconds integer not null default 0,
  status public.course_status not null default 'queued',
  stage text not null default 'Queued',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug),
  unique (user_id, video_id)
);

create index if not exists courses_user_idx on public.courses (user_id, created_at desc);

alter table public.courses enable row level security;

drop policy if exists "courses_owner_all" on public.courses;
create policy "courses_owner_all" on public.courses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Modules → lessons
-- ---------------------------------------------------------------------------

create table if not exists public.modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  position integer not null,
  title text not null,
  summary text not null default '',
  start_seconds integer not null default 0,
  end_seconds integer not null default 0,
  unique (course_id, position)
);

create index if not exists modules_course_idx on public.modules (course_id, position);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  module_id uuid not null references public.modules (id) on delete cascade,
  position integer not null,
  title text not null,
  summary text not null default '',
  start_seconds integer not null default 0,
  end_seconds integer not null default 0,
  key_terms jsonb not null default '[]'::jsonb,
  notes jsonb not null default '[]'::jsonb,
  -- Sections are numbered inside their module, so two modules can both have
  -- a section at position 0.
  unique (module_id, position)
);

create index if not exists lessons_course_idx on public.lessons (course_id, position);
create index if not exists lessons_module_idx on public.lessons (module_id, position);

alter table public.modules enable row level security;
alter table public.lessons enable row level security;

drop policy if exists "modules_owner_all" on public.modules;
create policy "modules_owner_all" on public.modules
  for all
  using (exists (select 1 from public.courses c where c.id = course_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.courses c where c.id = course_id and c.user_id = auth.uid()));

drop policy if exists "lessons_owner_all" on public.lessons;
create policy "lessons_owner_all" on public.lessons
  for all
  using (exists (select 1 from public.courses c where c.id = course_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.courses c where c.id = course_id and c.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Exercises (multiple choice, short answer, coding tasks)
-- ---------------------------------------------------------------------------

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  position integer not null,
  kind public.exercise_kind not null,
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  answer_index integer,
  keywords text[] not null default '{}',
  starter_code text,
  solution text,
  explanation text not null default '',
  misconception text not null default '',
  hint text not null default '',
  language text,
  at_seconds integer not null default 0,
  points integer not null default 1,
  unique (lesson_id, position)
);

create index if not exists exercises_lesson_idx on public.exercises (lesson_id, position);

alter table public.exercises enable row level security;

drop policy if exists "exercises_owner_all" on public.exercises;
create policy "exercises_owner_all" on public.exercises
  for all
  using (exists (select 1 from public.courses c where c.id = course_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.courses c where c.id = course_id and c.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Submissions — every graded attempt, kept for marks and review
-- ---------------------------------------------------------------------------

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  answer jsonb not null default '{}'::jsonb,
  score integer not null default 0,
  max_score integer not null default 1,
  passed boolean not null default false,
  feedback text not null default '',
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists submissions_user_idx on public.submissions (user_id, created_at desc);
create index if not exists submissions_lesson_idx on public.submissions (user_id, lesson_id, created_at desc);

alter table public.submissions enable row level security;

drop policy if exists "submissions_select_own" on public.submissions;
create policy "submissions_select_own" on public.submissions
  for select using (auth.uid() = user_id);

drop policy if exists "submissions_insert_own" on public.submissions;
create policy "submissions_insert_own" on public.submissions
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.courses c where c.id = course_id and c.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Per-lesson progress (best score, attempts, completion)
-- ---------------------------------------------------------------------------

create table if not exists public.lesson_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  score integer not null default 0,
  correct integer not null default 0,
  total integer not null default 0,
  attempts integer not null default 0,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index if not exists lesson_progress_course_idx on public.lesson_progress (user_id, course_id);

alter table public.lesson_progress enable row level security;

drop policy if exists "lesson_progress_owner_all" on public.lesson_progress;
create policy "lesson_progress_owner_all" on public.lesson_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Final projects — one capstone per course, plus every submitted attempt.
-- The brief is generated once per course and cached here, so every visit and
-- every review sees the same requirements. A course counts as completed when
-- one of its submissions passed.
-- ---------------------------------------------------------------------------

create table if not exists public.course_projects (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null,
  brief text not null default '',
  requirements jsonb not null default '[]'::jsonb,
  starter_code text not null default '',
  language text not null default 'python',
  created_at timestamptz not null default now(),
  unique (course_id)
);

alter table public.course_projects enable row level security;

drop policy if exists "course_projects_owner_all" on public.course_projects;
create policy "course_projects_owner_all" on public.course_projects
  for all
  using (exists (select 1 from public.courses c where c.id = course_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.courses c where c.id = course_id and c.user_id = auth.uid()));

create table if not exists public.project_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  project_id uuid not null references public.course_projects (id) on delete cascade,
  code text not null default '',
  score integer not null default 0,
  passed boolean not null default false,
  summary text not null default '',
  checks jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists project_submissions_user_idx
  on public.project_submissions (user_id, course_id, created_at desc);

alter table public.project_submissions enable row level security;

drop policy if exists "project_submissions_select_own" on public.project_submissions;
create policy "project_submissions_select_own" on public.project_submissions
  for select using (auth.uid() = user_id);

drop policy if exists "project_submissions_insert_own" on public.project_submissions;
create policy "project_submissions_insert_own" on public.project_submissions
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.courses c where c.id = course_id and c.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Tutor conversations
-- ---------------------------------------------------------------------------

create table if not exists public.tutor_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  at_seconds integer,
  created_at timestamptz not null default now()
);

create index if not exists tutor_messages_thread_idx
  on public.tutor_messages (user_id, lesson_id, created_at);

alter table public.tutor_messages enable row level security;

drop policy if exists "tutor_messages_owner_all" on public.tutor_messages;
create policy "tutor_messages_owner_all" on public.tutor_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- One rolling summary per student per lesson. When a tutor thread outgrows the
-- prompt budget, the turns older than the verbatim window are folded into this
-- row and `covered_until` marks how far the summary reaches, so the next reply
-- still knows the whole conversation without resending all of it.
-- ---------------------------------------------------------------------------

create table if not exists public.tutor_summaries (
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  summary text not null,
  covered_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

alter table public.tutor_summaries enable row level security;

drop policy if exists "tutor_summaries_owner_all" on public.tutor_summaries;
create policy "tutor_summaries_owner_all" on public.tutor_summaries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Model usage log — written by the server only. RLS on with no policies means
-- the anon/authenticated roles cannot read or write it; the service role can.
-- ---------------------------------------------------------------------------

create table if not exists public.ai_usage (
  id bigserial primary key,
  user_id uuid references auth.users (id) on delete set null,
  course_id uuid references public.courses (id) on delete set null,
  kind text not null,
  model text not null,
  prompt_tokens integer,
  completion_tokens integer,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_created_idx on public.ai_usage (created_at desc);

alter table public.ai_usage enable row level security;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists courses_touch_updated_at on public.courses;
create trigger courses_touch_updated_at
  before update on public.courses
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Table privileges. Supabase grants these by default; spelling them out keeps
-- a manually created project behaving the same way.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.courses to authenticated;
grant select, insert, update, delete on public.modules to authenticated;
grant select, insert, update, delete on public.lessons to authenticated;
grant select, insert, update, delete on public.exercises to authenticated;
grant select, insert on public.submissions to authenticated;
grant select, insert, update, delete on public.course_projects to authenticated;
grant select, insert on public.project_submissions to authenticated;
grant select, insert, update, delete on public.lesson_progress to authenticated;
grant select, insert, update, delete on public.tutor_messages to authenticated;
grant select, insert, update, delete on public.tutor_summaries to authenticated;

-- Supabase's default privileges hand anon the same rights as authenticated on
-- new public tables. Remove them: signed-out visitors have no policies anyway,
-- and ai_usage must stay service-role only.
revoke all on public.profiles from anon;
revoke all on public.courses from anon;
revoke all on public.modules from anon;
revoke all on public.lessons from anon;
revoke all on public.exercises from anon;
revoke all on public.submissions from anon;
revoke all on public.course_projects from anon;
revoke all on public.project_submissions from anon;
revoke all on public.lesson_progress from anon;
revoke all on public.tutor_messages from anon;
revoke all on public.tutor_summaries from anon;
revoke all on public.ai_usage from anon, authenticated;

-- Trigger helpers are never callable RPCs.
revoke all on function public.handle_new_user() from public;
revoke all on function public.touch_updated_at() from public;
