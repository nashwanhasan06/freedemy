import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { AiError, nimJson } from "@/lib/ai/nim";
import {
  coverageSlack,
  MAX_LESSONS_PER_MODULE,
  MIN_LESSONS_PER_MODULE,
  LESSON_MAX_SECONDS,
  LESSON_MIN_SECONDS,
  normaliseOutline,
  type Outline,
  type OutlineLesson,
  type OutlineModule,
} from "@/lib/ai/outline";
import {
  detectLanguage,
  lessonSystem,
  lessonUser,
  mapSystem,
  mapUser,
  outlineSystem,
  outlineUser,
  planSystem,
  planUser,
} from "@/lib/ai/prompts";
import {
  loadLecture,
  transcriptLines,
  TranscriptError,
  type Lecture,
  type TranscriptCue,
} from "@/lib/ai/transcript";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CodeExercise, KeyTerm, Mcq, NoteBlock, ShortAnswer } from "@/lib/types";

type MappedSegment = { title: string; start: number; end: number; points: string[] };

type GeneratedLesson = {
  title: string;
  summary: string;
  keyTerms: KeyTerm[];
  notes: NoteBlock[];
  /** Ids are assigned by the database, so generated questions have none yet. */
  questions: Omit<Mcq, "id">[];
  /** Absent when the assignment plan did not call for a written answer. */
  shortAnswer: ShortAnswer | null;
  codeExercises: Omit<CodeExercise, "id">[];
};

type CheckKind = "mcq" | "short" | "code";

/**
 * The persisted timeline failed to tile the video. `ready` must never ship
 * this state, so the build fails instead — a stale-row mix from a resumed
 * attempt once reached `ready` at 128 % coverage.
 */
class CoverageError extends Error {
  constructor(detail: string) {
    super(`Course coverage check failed: ${detail}`);
    this.name = "CoverageError";
  }
}

/** One assessment the planner asked for, before anything is written. */
type PlannedCheck = { kind: CheckKind; form: string; focus: string };
type LessonPlan = { title: string; checks: PlannedCheck[] };
type ModulePlan = LessonPlan[];

/** One row of a playlist course's work queue (see course_videos). */
type CourseVideoRow = {
  id: string;
  position: number;
  video_id: string;
  title: string;
  duration_seconds: number;
  status: string;
  attempts: number;
  error: string | null;
};

type BuildVideoParams = {
  admin: SupabaseClient;
  courseId: string;
  userId: string;
  videoId: string;
  /** course_videos row id; null on single-video courses. */
  courseVideoId: string | null;
  /** Playlist position of this video — its chapters live at position × 1_000; 0 off-playlist. */
  videoPosition: number;
  /** "Video 3 of 7 · " prefix for stage lines; "" on single-video courses. */
  label: string;
  /** The first successful build writes course-level metadata (channel, language). */
  isPrimary: boolean;
};

type BuildVideoResult = {
  language: string;
  level: string;
  duration: number;
  chapters: number;
  sections: number;
};

/**
 * One episode usually becomes one chapter. Only a single video longer than
 * this keeps the model's natural multi-chapter split (a 3-hour lecture would
 * otherwise become one unusable chapter).
 */
const SPLIT_ABOVE_SECONDS = 90 * 60;

/** The database stores one exercise kind per row, so the plan cannot exceed this. */
const CHECK_LIMITS: Record<CheckKind, number> = { mcq: 3, short: 1, code: 2 };

/**
 * Transcript windows are a fixed 20 minutes, so a long video maps in more
 * calls instead of cramming hours into one window. A 20-minute window stays
 * comfortably inside the 40 000-char slice the map prompt can read.
 */
const MAX_WINDOW_SECONDS = 20 * 60;
/** Defensive ceiling (~80 hours of video) so an absurd runtime cannot queue hundreds of calls. */
const MAX_WINDOWS = 240;

function text(value: unknown, fallback = "", max = 4_000): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, max);
}

function int(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Keeps a window's segments inside that window. The bounds check matters: a
 * model that misreads the transcript clock returns plausible-looking absolute
 * timestamps for the wrong part of the video, and without this guard those
 * segments scatter across (or fall off) the timeline, leaving hour-sized
 * holes the outline then skips.
 */
function validateSegments(
  value: unknown,
  windowStart: number,
  windowEnd: number,
): MappedSegment[] | null {
  const root = value as { segments?: unknown } | null;
  const slack = 60;
  const segments = list<Record<string, unknown>>(root?.segments)
    .map((segment) => ({
      title: text(segment.title, "", 160),
      start: int(segment.start),
      end: int(segment.end),
      points: list<unknown>(segment.points)
        .map((point) => text(point, "", 300))
        .filter(Boolean)
        .slice(0, 4),
    }))
    .filter(
      (segment) =>
        segment.title &&
        segment.points.length > 0 &&
        segment.end > segment.start &&
        segment.start >= windowStart - slack &&
        segment.end <= windowEnd + slack,
    )
    .sort((a, b) => a.start - b.start);

  return segments.length > 0 ? segments : null;
}

function validateOutline(duration: number): (value: unknown) => Outline | null {
  return (value: unknown) => {
    const root = value as { level?: unknown; modules?: unknown } | null;
    const modules = list<Record<string, unknown>>(root?.modules)
      .map((module, index) => {
        const lessons = list<Record<string, unknown>>(module.lessons)
          .map((lesson) => ({
            title: text(lesson.title, "", 140),
            summary: text(lesson.summary, "", 500),
            start: int(lesson.start),
            end: int(lesson.end),
          }))
          .filter((lesson) => lesson.title && lesson.end > lesson.start)
          .slice(0, MAX_LESSONS_PER_MODULE);

        return {
          title: text(module.title, `Module ${index + 1}`, 140),
          summary: text(module.summary, "", 600),
          start: int(module.start),
          end: int(module.end),
          lessons,
        };
      })
      // Modules scale with the lecture; only empty ones are dropped. The
      // timeline normalisation below caps how many can actually tile the run.
      .filter((module) => module.lessons.length > 0);

    if (modules.length === 0) {
      console.warn("[generation] outline rejected: no module carried a usable lesson");
      return null;
    }

    // An outline that stops a third of the way in used to be accepted, so the
    // course was marked ready while most of the lecture had no lessons at all.
    const reached = Math.max(...modules.map((module) => Math.max(module.end, module.start)));
    if (duration > 0 && reached < duration - coverageSlack(duration)) {
      console.warn(`[generation] outline rejected: reached ${reached}s of ${duration}s`);
      return null;
    }

    const normalised = normaliseOutline(modules, duration);
    if (normalised.length === 0) {
      console.warn("[generation] outline rejected: nothing survived normalisation");
      return null;
    }

    // A module with one or two lessons is not a module. Reject so the repair
    // pass can add lessons; only a module too short to fit four five-minute
    // sections escapes — normaliseOutline has merged every other thin module.
    const underweight = normalised.find(
      (module) =>
        module.lessons.length < MIN_LESSONS_PER_MODULE &&
        module.end - module.start >= MIN_LESSONS_PER_MODULE * LESSON_MIN_SECONDS,
    );
    if (underweight) {
      console.warn(
        `[generation] outline rejected: "${underweight.title}" has ${underweight.lessons.length} lessons for ${underweight.end - underweight.start}s`,
      );
      return null;
    }

    return {
      level: ["Beginner", "Intermediate", "Advanced"].includes(String(root?.level))
        ? String(root?.level)
        : "Intermediate",
      modules: normalised,
    };
  };
}

/** A course whose lessons average over 25 minutes is not finishable in a sitting. */
function lessonsTooLong(outline: Outline, duration: number): boolean {
  const lessons = outline.modules.reduce((count, entry) => count + entry.lessons.length, 0);
  return duration > 0 && lessons > 0 && duration / lessons > 25 * 60;
}

/**
 * Safety net for a model that will not tile the whole lecture: builds the
 * course straight from the timestamped topics, so a three hour video cannot
 * come back as two modules covering its first half hour.
 */
function outlineFromTopics(segments: MappedSegment[], duration: number): Outline {
  const span = duration > 0 ? duration : (segments.at(-1)?.end ?? 0);
  if (span <= 0) return { level: "Intermediate", modules: [] };

  // Modules scale with the runtime (~one per hour of a long lecture) and each
  // carries at least four lessons, so the fallback obeys the same shape rule
  // the prompt asks of the model.
  const moduleCount = Math.max(2, Math.ceil(span / (60 * 60)));
  const moduleSpan = span / moduleCount;
  const modules: OutlineModule[] = [];
  let skipped = 0;

  for (let index = 0; index < moduleCount; index += 1) {
    const start = Math.round(index * moduleSpan);
    const end = index === moduleCount - 1 ? Math.round(span) : Math.round((index + 1) * moduleSpan);
    const inside = segments.filter((segment) => segment.start >= start && segment.start < end);
    if (inside.length === 0) {
      skipped += 1;
      continue;
    }

    const lessonCount = Math.min(
      Math.max(MIN_LESSONS_PER_MODULE, Math.round((end - start) / (15 * 60))),
      Math.max(1, Math.floor((end - start) / LESSON_MIN_SECONDS)),
    );
    const lessonSpan = (end - start) / lessonCount;
    const lessons: OutlineLesson[] = [];

    for (let slot = 0; slot < lessonCount; slot += 1) {
      const lessonStart = Math.round(start + slot * lessonSpan);
      const lessonEnd = slot === lessonCount - 1 ? end : Math.round(start + (slot + 1) * lessonSpan);
      const slice = inside.filter(
        (segment) => segment.start >= lessonStart && segment.start < lessonEnd,
      );
      const source = slice.length > 0 ? slice : inside.slice(0, 1);
      const title = source[0]?.title ?? `Part ${slot + 1}`;
      const summary = source
        .flatMap((segment) => segment.points)
        .slice(0, 3)
        .join(" ");
      lessons.push({ title, summary: summary || title, start: lessonStart, end: lessonEnd });
    }

    modules.push({
      title: inside[0]?.title ?? `Module ${index + 1}`,
      summary:
        inside
          .flatMap((segment) => segment.points)
          .slice(0, 3)
          .join(" ") || inside[0]?.title || "",
      start,
      end,
      lessons,
    });
  }

  // A tail the topic map never reached (a window whose segments scattered off
  // the timeline) still has to be covered: the duration is authoritative, and
  // shipping a course that stops at 48 of its 70 hours is the bug this guards
  // against. normaliseOutline re-tiles the last module's lessons over it.
  if (skipped > 0) {
    console.warn(
      `[generation] topic map has no segments in ${skipped} of ${moduleCount} time buckets`,
    );
  }
  const last = modules.at(-1);
  if (last && last.end < span) {
    console.warn(
      `[generation] topic map stops at ${last.end}s of ${span}s — extending the last module to cover the tail`,
    );
    last.end = span;
  }

  return { level: "Intermediate", modules: normaliseOutline(modules, span) };
}

/**
 * Used when the planner is unavailable: still varies by lesson instead of
 * shipping the same four-check template everywhere.
 */
function defaultChecks(lesson: OutlineLesson): PlannedCheck[] {
  const handsOn = /code|coding|implement|function|script|api|class|loop|syntax|variable|debug|algorithm|query|sql|python|javascript|notebook/i.test(
    `${lesson.title} ${lesson.summary}`,
  );

  const checks: PlannedCheck[] = [
    { kind: "mcq", form: "recall what it is and why it exists", focus: lesson.title },
    {
      kind: "mcq",
      form: "spot the wrong mental model",
      focus: lesson.summary || lesson.title,
    },
  ];

  checks.push(
    handsOn
      ? { kind: "code", form: "apply it in code", focus: lesson.title }
      : { kind: "short", form: "explain the mechanism in your own words", focus: lesson.title },
  );

  return checks;
}

/**
 * Reads the assessment plan for one module and lines it up with the outline.
 * Checks the database cannot store (a fourth MCQ, a second written answer) are
 * dropped here rather than at persist time.
 */
function validateLessonPlan(module: OutlineModule): (value: unknown) => ModulePlan | null {
  return (value: unknown) => {
    const root = value as { lessons?: unknown } | null;
    const planned = list<Record<string, unknown>>(root?.lessons);
    if (planned.length === 0) return null;

    return module.lessons.map((lesson, index) => {
      const entry = planned[index];
      const counts: Record<CheckKind, number> = { mcq: 0, short: 0, code: 0 };
      const checks: PlannedCheck[] = [];

      for (const raw of list<Record<string, unknown>>(entry?.checks)) {
        const kind = String(raw.kind ?? "").trim().toLowerCase() as CheckKind;
        if (!(kind in counts)) continue;
        if (counts[kind] >= CHECK_LIMITS[kind]) continue;

        const focus = text(raw.focus, "", 240);
        if (!focus) continue;

        counts[kind] += 1;
        checks.push({ kind, form: text(raw.form, kind, 120), focus });
      }

      if (checks.length < 2) return { title: lesson.title, checks: defaultChecks(lesson) };
      return { title: lesson.title, checks: checks.slice(0, 4) };
    });
  };
}

function validateLessonContent(
  outline: OutlineLesson,
  plan: PlannedCheck[],
  language: string,
): (value: unknown) => GeneratedLesson | null {
  return (value: unknown) => {
    const root = value as Record<string, unknown> | null;
    if (!root) return null;

    const lesson = root;
    const start = outline.start;
    const end = Math.max(outline.start + 1, outline.end);

    const questions = list<Record<string, unknown>>(lesson.questions)
      .map((question) => {
        const options = list<unknown>(question.options)
          .map((option) => text(option, "", 240))
          .filter(Boolean)
          .slice(0, 4);
        const answer = int(question.answer, 0);
        return {
          prompt: text(question.prompt, "", 500),
          options,
          answer: options.length > 0 ? clamp(answer, 0, options.length - 1) : 0,
          misconception: text(question.misconception, "", 300),
          explanation: text(question.explanation, "", 600),
          at: clamp(int(question.at, start), start, Math.max(start, end - 1)),
        };
      })
      .filter((question) => question.prompt && question.options.length >= 2)
      .slice(0, CHECK_LIMITS.mcq);

    const shortRaw = (lesson.shortAnswer ?? null) as Record<string, unknown> | null;
    const shortPrompt = text(shortRaw?.prompt, "", 500);
    const shortAnswer: ShortAnswer | null =
      shortRaw && shortPrompt
        ? {
            prompt: shortPrompt,
            placeholder: "Type your answer…",
            keywords: list<unknown>(shortRaw.keywords)
              .map((keyword) => text(keyword, "", 60).toLowerCase())
              .filter(Boolean)
              .slice(0, 6),
            model: text(shortRaw.model, "", 900),
            misconception: text(shortRaw.misconception, "", 240),
            explanation: text(shortRaw.explanation, "", 500),
            at: clamp(int(shortRaw.at, start), start, Math.max(start, end - 1)),
          }
        : null;

    const codeExercises = list<Record<string, unknown>>(lesson.codeExercises)
      .map((exercise) => ({
        prompt: text(exercise.prompt, "", 600),
        language: text(exercise.language, language, 30),
        starterCode: text(exercise.starterCode, "", 2_000),
        hint: text(exercise.hint, "", 300),
        solution: text(exercise.solution, "", 2_000),
        explanation: text(exercise.explanation, "", 600),
        at: clamp(int(exercise.at, start), start, Math.max(start, end - 1)),
      }))
      .filter((exercise) => exercise.prompt && exercise.solution)
      .slice(0, CHECK_LIMITS.code);

    // Notes carry the lesson, so an empty or bullet-only body is a repair.
    const notes = list<Record<string, unknown>>(lesson.notes)
      .map((block) => {
        const bullets = list<unknown>(block.bullets)
          .map((bullet) => text(bullet, "", 600))
          .filter(Boolean);
        const body =
          text(block.body, "", 6_000) ||
          (bullets.length > 0 ? bullets.map((bullet) => `- ${bullet}`).join("\n") : "");
        return { heading: text(block.heading, "", 140), body };
      })
      .filter((block) => block.heading && block.body.length > 120)
      .slice(0, 6);

    if (notes.length < 2) return null;

    const wanted: Record<CheckKind, number> = { mcq: 0, short: 0, code: 0 };
    for (const check of plan) wanted[check.kind] += 1;
    if (wanted.mcq > 0 && questions.length === 0) return null;
    if (wanted.short > 0 && !shortAnswer) return null;
    if (wanted.code > 0 && codeExercises.length === 0) return null;

    return {
      title: text(lesson.title, outline.title, 140),
      summary: text(lesson.summary, outline.summary, 700),
      keyTerms: list<Record<string, unknown>>(lesson.keyTerms)
        .map((term) => ({
          term: text(term.term, "", 80),
          definition: text(term.definition, "", 500),
        }))
        .filter((term) => term.term && term.definition)
        .slice(0, 8),
      notes,
      questions,
      shortAnswer,
      codeExercises,
    };
  };
}

function buildWindows(cues: TranscriptCue[], duration: number) {
  // Fixed 20-minute windows: longer videos map in more windows, not bigger
  // ones, so each map call reads a transcript slice that always fits the
  // prompt. Only beyond ~80 hours does the safety cap stretch a window.
  const count = Math.min(
    MAX_WINDOWS,
    Math.max(1, Math.ceil(duration / MAX_WINDOW_SECONDS)),
  );
  const targetSeconds = Math.max(
    MAX_WINDOW_SECONDS,
    Math.ceil(duration / count / 60) * 60,
  );

  const windows = new Map<number, TranscriptCue[]>();
  for (const cue of cues) {
    const bucket = Math.floor(cue.start / targetSeconds);
    const list = windows.get(bucket) ?? [];
    list.push(cue);
    windows.set(bucket, list);
  }

  return [...windows.entries()]
    .sort(([a], [b]) => a - b)
    .slice(0, MAX_WINDOWS)
    .map(([bucket, windowCues]) => ({
      start: bucket * targetSeconds,
      end: Math.min(duration || Number.MAX_SAFE_INTEGER, (bucket + 1) * targetSeconds),
      cues: windowCues,
    }));
}

function cuesBetween(cues: TranscriptCue[], start: number, end: number): TranscriptCue[] {
  const selected = cues.filter((cue) => cue.start >= start && cue.start < end);
  if (selected.length > 0) return selected;

  // Falling back to the opening of the video wrote lesson content about the
  // wrong part of the lecture; use the cues nearest the module instead.
  return cues.filter((cue) => cue.start >= Math.max(0, start - 120) && cue.start < end + 120);
}

async function setStatus(
  admin: SupabaseClient,
  courseId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.from("courses").update(patch).eq("id", courseId);
  if (error) {
    console.error(`[generation] could not update course ${courseId}: ${error.message}`);
  }
}

function friendlyError(error: unknown): string {
  if (error instanceof TranscriptError) return error.message;
  if (error instanceof CoverageError) {
    return "The course sections do not tile the whole video. Try again — the outline will be rebuilt.";
  }
  if (error instanceof AiError) {
    if (error.status === 429) {
      return "The model provider is rate-limiting course builds right now. Wait a minute, then try again.";
    }
    return `The model request failed${error.status ? ` (${error.status})` : ""}. Try again in a moment.`;
  }
  if (error instanceof Error && /NVIDIA_NIM_API_KEY|SUPABASE_SERVICE_ROLE_KEY/.test(error.message)) {
    return error.message;
  }
  // Anything else is an internal detail (SQL constraint names, module paths).
  return "Something went wrong while building this course. Try again.";
}

/**
 * The final gate before `ready`: the rows actually stored in the database must
 * tile the video — modules contiguous from second 0 to the exact duration,
 * every module fully covered by contiguous sections carrying four lessons
 * wherever four fit, and every section watching for 5–20 minutes (the hard
 * rule; waived only for a video shorter than five minutes). A resumed build
 * that mixed rows from two outlines once reached `ready` at 128 % coverage;
 * this check turns that into a failure the student can retry (the resume
 * logic then rewrites the mismatched rows).
 *
 * Playlist courses pass their video's row id: the check then only sees that
 * video's modules (which tile 0 → its duration), and skips absolute position
 * checks — global chapter numbering is assigned once at the end of the build.
 */
async function assertCompleteCoverage(
  admin: SupabaseClient,
  courseId: string,
  duration: number,
  courseVideoId: string | null = null,
): Promise<void> {
  const playlist = courseVideoId !== null;
  const [{ data: moduleData, error: moduleError }, { data: lessonData, error: lessonError }] =
    await Promise.all([
      admin
        .from("modules")
        .select("id,position,start_seconds,end_seconds,course_video_id")
        .eq("course_id", courseId),
      admin
        .from("lessons")
        .select("id,module_id,position,start_seconds,end_seconds,course_video_id")
        .eq("course_id", courseId),
    ]);

  if (moduleError || lessonError) {
    throw new CoverageError(`could not read rows: ${moduleError?.message ?? lessonError?.message ?? ""}`);
  }

  const modules = ((moduleData ?? []) as { id: string; position: number; start_seconds: number; end_seconds: number; course_video_id: string | null }[])
    .filter((row) => (row.course_video_id ?? null) === courseVideoId)
    .sort((a, b) => (playlist ? a.start_seconds - b.start_seconds : a.position - b.position));
  const lessons = (lessonData ?? []) as { id: string; module_id: string; position: number; start_seconds: number; end_seconds: number; course_video_id: string | null }[];

  if (modules.length === 0) throw new CoverageError("no modules were saved");

  let cursor = 0;
  for (const [index, row] of modules.entries()) {
    if (!playlist && row.position !== index) throw new CoverageError(`module positions skip ${index}`);
    if (row.start_seconds !== cursor) {
      throw new CoverageError(
        row.start_seconds > cursor
          ? `gap of ${row.start_seconds - cursor}s before module ${index + 1}`
          : `modules ${index + 1} and ${index + 2} overlap by ${cursor - row.start_seconds}s`,
      );
    }
    if (row.end_seconds <= row.start_seconds) throw new CoverageError(`module ${index + 1} is empty`);
    cursor = row.end_seconds;
  }
  if (duration > 0 && cursor !== duration) {
    throw new CoverageError(
      cursor < duration
        ? `coverage stops ${duration - cursor}s early (${cursor}s of ${duration}s)`
        : `coverage overruns the video by ${cursor - duration}s`,
    );
  }

  const byModule = new Map<string, { position: number; start_seconds: number; end_seconds: number }[]>();
  for (const lesson of lessons) {
    if ((lesson.course_video_id ?? null) !== courseVideoId) continue;
    const rows = byModule.get(lesson.module_id) ?? [];
    rows.push(lesson);
    byModule.set(lesson.module_id, rows);
  }

  for (const [index, row] of modules.entries()) {
    const rows = (byModule.get(row.id) ?? []).sort((a, b) =>
      playlist ? a.start_seconds - b.start_seconds : a.position - b.position,
    );
    if (rows.length === 0) throw new CoverageError(`module ${index + 1} has no sections`);
    if (
      rows.length < MIN_LESSONS_PER_MODULE &&
      row.end_seconds - row.start_seconds >= MIN_LESSONS_PER_MODULE * LESSON_MIN_SECONDS
    ) {
      throw new CoverageError(
        `module ${index + 1} has ${rows.length} sections for ${row.end_seconds - row.start_seconds}s`,
      );
    }

    let sectionCursor = row.start_seconds;
    for (const [position, lesson] of rows.entries()) {
      if (!playlist && lesson.position !== position) throw new CoverageError(`module ${index + 1} skips section ${position}`);
      if (lesson.start_seconds !== sectionCursor) {
        throw new CoverageError(
          lesson.start_seconds > sectionCursor
            ? `gap of ${lesson.start_seconds - sectionCursor}s inside module ${index + 1}`
            : `sections ${position + 1} and ${position + 2} of module ${index + 1} overlap`,
        );
      }
      if (lesson.end_seconds > row.end_seconds) {
        throw new CoverageError(`section ${position + 1} of module ${index + 1} runs past the module`);
      }
      const watched = lesson.end_seconds - lesson.start_seconds;
      if (
        duration >= LESSON_MIN_SECONDS &&
        (watched < LESSON_MIN_SECONDS || watched > LESSON_MAX_SECONDS)
      ) {
        throw new CoverageError(
          `section ${position + 1} of module ${index + 1} watches for ${watched}s — outside the 5–20 minute rule`,
        );
      }
      sectionCursor = lesson.end_seconds;
    }
    if (sectionCursor !== row.end_seconds) {
      throw new CoverageError(
        `module ${index + 1} ends ${row.end_seconds - sectionCursor}s after its last section`,
      );
    }
  }
}

async function persistLesson(params: {
  admin: SupabaseClient;
  courseId: string;
  moduleId: string;
  courseVideoId: string | null;
  position: number;
  outline: OutlineLesson;
  generated: GeneratedLesson;
  language: string;
}) {
  const { admin, courseId, moduleId, courseVideoId, position, outline, generated, language } = params;
  const title = generated.title || outline.title;

  const { data: lessonRow, error: lessonError } = await admin
    .from("lessons")
    .insert({
      course_id: courseId,
      module_id: moduleId,
      course_video_id: courseVideoId,
      position,
      title,
      summary: generated.summary,
      start_seconds: outline.start,
      end_seconds: outline.end,
      key_terms: generated.keyTerms,
      notes: generated.notes,
    })
    .select("id")
    .single();

  if (lessonError || !lessonRow) {
    throw new Error(`Could not save lesson “${title}”: ${lessonError?.message ?? ""}`);
  }

  const lessonId = (lessonRow as { id: string }).id;

  // Every row carries every column: a batch insert sends one column list, so
  // a key missing from one row would arrive as NULL and break a NOT NULL.
  const baseRow = {
    course_id: courseId,
    lesson_id: lessonId,
    options: [] as string[],
    answer_index: null as number | null,
    keywords: [] as string[],
    starter_code: null as string | null,
    solution: null as string | null,
    hint: "",
    language: null as string | null,
    explanation: "",
    misconception: "",
    at_seconds: 0,
    points: 1,
  };

  const rows: Record<string, unknown>[] = [];
  let exercisePosition = 0;

  for (const question of generated.questions) {
    rows.push({
      ...baseRow,
      position: exercisePosition++,
      kind: "mcq",
      prompt: question.prompt,
      options: question.options,
      answer_index: question.answer,
      explanation: question.explanation,
      misconception: question.misconception,
      at_seconds: question.at,
    });
  }

  if (generated.shortAnswer) {
    rows.push({
      ...baseRow,
      position: exercisePosition++,
      kind: "short",
      prompt: generated.shortAnswer.prompt,
      keywords: generated.shortAnswer.keywords,
      solution: generated.shortAnswer.model,
      explanation: generated.shortAnswer.explanation,
      misconception: generated.shortAnswer.misconception,
      at_seconds: generated.shortAnswer.at,
    });
  }

  for (const exercise of generated.codeExercises) {
    rows.push({
      ...baseRow,
      position: exercisePosition++,
      kind: "code",
      prompt: exercise.prompt,
      language: exercise.language || language,
      starter_code: exercise.starterCode,
      solution: exercise.solution,
      hint: exercise.hint,
      explanation: exercise.explanation,
      at_seconds: exercise.at,
      points: 2,
    });
  }

  if (rows.length > 0) {
    const { error: exerciseError } = await admin.from("exercises").insert(rows);
    if (exerciseError) {
      throw new Error(`Could not save exercises for “${title}”: ${exerciseError.message}`);
    }
  }
}

/**
 * One video's full build: captions → topic map → outline → plans → sections.
 * Shared by the single-video path and each video of a playlist course; throws
 * to the caller, which marks the course (or that video's row) failed.
 * Status transitions go to Supabase so the generating screen can follow along,
 * and every model call stays on the background lane of the rate limiter.
 */
async function buildVideo(params: BuildVideoParams): Promise<BuildVideoResult> {
  const { admin, courseId, userId, videoId, courseVideoId, videoPosition, label, isPrimary } = params;
  const playlist = courseVideoId !== null;
  const stage = (text: string) => (label ? `${label}${text}` : text);
  // Once one module fails the build is over; in-flight sibling calls must not
  // keep writing rows into a course that is already marked failed.
  let aborted = false;

  try {
    await setStatus(admin, courseId, { status: "fetching", stage: stage("Reading the captions"), error: null });

    const lecture: Lecture = await loadLecture(videoId);
    const language = detectLanguage(lecture);
    const duration = lecture.durationSeconds || lecture.cues.at(-1)?.start || 0;

    // A playlist course already has its title; only its first built video
    // writes channel/language, and its duration is summed at the end.
    const coursePatch: Record<string, unknown> = {
      status: "outlining",
      stage: stage("Finding the structure"),
    };
    if (isPrimary) {
      coursePatch.channel = lecture.channel;
      coursePatch.language = language;
    }
    if (!playlist) {
      coursePatch.title = lecture.title;
      coursePatch.description = lecture.description;
      coursePatch.duration_seconds = duration;
    }
    await setStatus(admin, courseId, coursePatch);

    const windows = buildWindows(lecture.cues, duration);
    let mapped = 0;

    const segments = (
      await Promise.all(
        windows.map(async (window) => {
          const result = await nimJson<MappedSegment[]>({
            system: mapSystem(),
            user: mapUser({
              title: lecture.title,
              language,
              windowStart: window.start,
              windowEnd: window.end,
              transcript: transcriptLines(window.cues).slice(0, 40_000),
            }),
            // 1_200 was landing exactly on the cap for structured windows, which
            // failed validation and cost a full repair round-trip per window.
            maxTokens: 2_500,
            priority: "background",
            meta: { kind: "map", userId, courseId },
            validate: (value) => validateSegments(value, window.start, window.end),
            repairHint: `Timestamps must be absolute seconds from the start of the video and fall inside the window ${window.start}–${window.end} (the transcript clock is [h:mm:ss] — hours×3600 + minutes×60 + seconds).`,
          });

          mapped += 1;
          // A sibling call may already have failed the build; writing progress
          // then would overwrite the failure message the student needs to see.
          if (!aborted) {
            await setStatus(admin, courseId, {
              stage: stage(`Read ${mapped} of ${windows.length} transcript windows`),
            });
          }

          return result;
        }),
      )
    ).flat();

    if (segments.length === 0) {
      throw new Error("The transcript did not contain enough spoken content to outline.");
    }

    // The outline is ONE JSON object: ~55 tokens per module and ~40 per
    // lesson (now that summaries are terse). At one module per hour and a
    // lesson per ten minutes, a video past ~54 hours needs more than the
    // model's 16 384-token ceiling — every round then comes back truncated
    // and unparseable (evidence: completion tokens pinned exactly at the cap
    // for a 70 h course), burning four calls before the fallback anyway.
    const outlineBudget = clamp(2_500 + Math.ceil(duration / LESSON_MIN_SECONDS) * 45, 6_000, 16_000);
    const moduleEstimate = Math.max(1, Math.ceil(duration / (60 * 60)));
    const lessonEstimate = Math.max(moduleEstimate * MIN_LESSONS_PER_MODULE, Math.ceil(duration / (10 * 60)));
    const outlineTokensEstimate = moduleEstimate * 55 + lessonEstimate * 40;

    let outline = await (async () => {
      if (outlineTokensEstimate > outlineBudget) {
        console.warn(
          `[generation] outline for ${courseId} would need ~${outlineTokensEstimate} tokens (budget ${outlineBudget}); using the topic map`,
        );
        const fallback = outlineFromTopics(segments, duration);
        if (fallback.modules.length > 0) return fallback;
      }

      try {
        return await nimJson<Outline>({
          system: outlineSystem(),
          user: outlineUser({
            title: lecture.title,
            channel: lecture.channel,
            language,
            duration,
            description: lecture.description,
            chapters: lecture.chapters,
            topics: segments,
          }),
          // The outline JSON grows with the module and lesson count, which now
          // scales with the runtime. Thinking is off, so the budget is all
          // answer — capped just under the model's 16 384-token ceiling. Videos
          // whose outline cannot fit that cap are skipped above.
          maxTokens: outlineBudget,
          priority: "background",
          meta: { kind: "outline", userId, courseId },
          validate: validateOutline(duration),
          repairHint: `The previous outline was rejected. Every module needs at least ${MIN_LESSONS_PER_MODULE} lessons — if a module is too small to hold four, merge it into a neighbouring module instead (only the video's brief tail may be shorter). Every lesson must run 5 to 20 minutes of video. The modules must also tile the whole lecture with no gaps: the first starts at second 0, each ends where the next begins, and the last ends at ${duration}.`,
        });
      } catch (error) {
        // Better a plain timeline from the topic map than a course that silently
        // covers a fraction of the lecture.
        console.warn(
          `[generation] outline failed for ${courseId}: ${error instanceof Error ? error.message : String(error)}; using the topic map`,
        );
        const fallback = outlineFromTopics(segments, duration);
        if (fallback.modules.length === 0) throw error;
        return fallback;
      }
    })();

    if (lessonsTooLong(outline, duration)) {
      const refined = outlineFromTopics(segments, duration);
      if (refined.modules.length > 0) outline = refined;
    }

    // One episode = one chapter: a short playlist video's outline collapses
    // into a single module (a video past the split threshold keeps the
    // model's natural multi-chapter shape).
    if (playlist && duration <= SPLIT_ABOVE_SECONDS && outline.modules.length > 1) {
      const merged = normaliseOutline(
        [
          {
            title: outline.modules
              .map((module) => module.title)
              .filter(Boolean)
              .join(" / ")
              .slice(0, 140),
            summary: outline.modules.map((module) => module.summary).join(" ").slice(0, 600),
            start: 0,
            end: duration,
            lessons: outline.modules.flatMap((module) => module.lessons),
          },
        ],
        duration,
      );
      if (merged.length === 0) {
        throw new Error("The episode outline could not be shaped into a single chapter.");
      }
      outline = { level: outline.level, modules: merged };
    }

    await setStatus(admin, courseId, {
      status: "writing",
      // Only the first built video sets the course level; episodes of the
      // same playlist are all pitched the same way.
      ...(playlist && !isPrimary ? {} : { level: outline.level }),
      stage: stage(`Planning ${outline.modules.length} modules`),
    });

    // Assessment is planned per module before any prose is written, so each
    // section is tested on what it actually teaches instead of the same
    // two-MCQ-one-code-one-answer template. Plans are started as promises and
    // consumed per module, so a module's sections begin writing as soon as its
    // own plan resolves instead of waiting for the slowest module.
    const plans: Promise<ModulePlan>[] = outline.modules.map((module) =>
      (async (): Promise<ModulePlan> => {
        const topics = segments.filter(
          (segment) => segment.start >= module.start && segment.start < module.end,
        );

        try {
          return await nimJson<ModulePlan>({
            system: planSystem(),
            user: planUser({
              courseTitle: lecture.title,
              language,
              moduleTitle: module.title,
              moduleSummary: module.summary,
              moduleStart: module.start,
              moduleEnd: module.end,
              lessons: module.lessons,
              topics: (topics.length > 0 ? topics : segments).slice(0, 12),
            }),
            maxTokens: 1_500,
            temperature: 0.35,
            priority: "background",
            meta: { kind: "plan", userId, courseId },
            validate: validateLessonPlan(module),
            repairHint:
              "Every lesson needs two to four checks, and each check needs a kind (mcq, short or code), a form and a focus.",
          });
        } catch (error) {
          console.warn(`[generation] plan failed for “${module.title}”; using defaults`, error);
          return module.lessons.map((lesson) => ({
            title: lesson.title,
            checks: defaultChecks(lesson),
          }));
        }
      })(),
    );

    // Module rows are cheap and stable: create them first so each section can
    // be written (and resumed) on its own.
    const [{ data: existingModuleData }, { data: existingLessons }] = await Promise.all([
      admin.from("modules").select("id,position,start_seconds,end_seconds,course_video_id").eq("course_id", courseId),
      admin.from("lessons")
        .select("id,module_id,position,start_seconds,end_seconds")
        .eq("course_id", courseId),
    ]);

    // Only this video's chapters are reuse/stale candidates here — another
    // episode's rows must never be deleted by this build.
    const existingModules = (
      existingModuleData ?? []
    ) as { id: string; position: number; start_seconds: number; end_seconds: number; course_video_id: string | null }[];
    const scopedModules = existingModules.filter((row) => (row.course_video_id ?? null) === courseVideoId);

    // A row is only worth keeping when it describes the SAME slice of video as
    // the regenerated outline. Matching by position alone spliced rows from two
    // different outlines together: a retry kept the old modules (built by the
    // broken fallback, ending at 175 809 s) while the new ones started at
    // 104 050 s, and the course still reached `ready` at 128 % coverage.
    // Playlist chapters are matched without position: their global numbers are
    // only assigned at the end of the build.
    const reusableModule = (row: { position: number; start_seconds: number; end_seconds: number }, index: number) => {
      const planned = outline.modules[index];
      return (
        planned !== undefined &&
        (playlist || row.position === index) &&
        row.start_seconds === planned.start &&
        row.end_seconds === planned.end
      );
    };

    // Everything else is stale — deleting a module cascades to its lessons and
    // their exercises, so old content can never survive a rebuilt timeline.
    const staleModuleIds = scopedModules
      .filter((row) =>
        playlist
          ? !outline.modules.some(
              (entry) => entry.start === row.start_seconds && entry.end === row.end_seconds,
            )
          : !reusableModule(row, row.position),
      )
      .map((row) => row.id);
    if (staleModuleIds.length > 0) {
      await admin.from("modules").delete().in("id", staleModuleIds);
    }

    // Playlist chapters sit in their video's slot (video N → N × 1_000 + local
    // index): while a video is still queued its slot stays empty instead of a
    // later video filling it, and one that builds late lands in the right
    // place instead of after everything else. Slots are disjoint per video, so
    // the (course_id, position) unique constraint always holds; global numbers
    // are assigned once at the end of the build (finalisePlaylist).
    //
    // Survivors of a previous outline are parked at temporary negatives first:
    // a regenerated outline can gain a chapter BEFORE one it reuses, and the
    // fresh insert would otherwise land on the survivor's row. Each survivor
    // is restored to its own outline index below. Playlist only — single-video
    // courses match survivors by `row.position === index`, so parking them
    // first would hide them from the reuse check (and they already sit at
    // their exact index, so there is no collision to avoid there).
    const survivors = scopedModules.filter((row) => !staleModuleIds.includes(row.id));
    if (playlist) {
      for (const [parkIndex, row] of survivors.entries()) {
        await admin.from("modules").update({ position: -(parkIndex + 1_000_000) }).eq("id", row.id);
      }
    }

    const moduleIds: string[] = [];
    for (const [index, module] of outline.modules.entries()) {
      const existing = survivors.find((row) => reusableModule(row, index));
      if (existing) {
        moduleIds.push(existing.id);
        continue;
      }

      const { data, error } = await admin
        .from("modules")
        .insert({
          course_id: courseId,
          course_video_id: courseVideoId,
          position: playlist ? videoPosition * 1_000 + index : index,
          title: module.title,
          summary: module.summary,
          start_seconds: module.start,
          end_seconds: module.end,
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new Error(`Could not save module “${module.title}”: ${error?.message ?? ""}`);
      }
      moduleIds.push((data as { id: string }).id);
    }

    // Un-park the reused chapters at their outline index inside the slot.
    for (const [index, id] of moduleIds.entries()) {
      if (!survivors.some((row) => row.id === id)) continue;
      await admin
        .from("modules")
        .update({ position: videoPosition * 1_000 + index })
        .eq("id", id);
    }

    // Sections that no longer exist in the outline (or belong to a module that
    // was dropped) would show up as orphans in the player. A section whose
    // window moved is just as stale as a missing one: its notes were written
    // for different minutes of the lecture. Playlist courses only judge their
    // own video's sections here — another episode's rows are not this build's
    // business.
    const modulePosition = new Map(moduleIds.map((id, index) => [id, index]));
    const staleLessonIds = (existingLessons ?? [])
      .filter((row) => {
        const index = modulePosition.get(row.module_id);
        if (index === undefined) return !playlist;
        const lesson = outline.modules[index].lessons[row.position];
        if (lesson === undefined) return true;
        return row.start_seconds !== lesson.start || row.end_seconds !== lesson.end;
      })
      .map((row) => row.id);
    if (staleLessonIds.length > 0) {
      await admin.from("lessons").delete().in("id", staleLessonIds);
    }

    // Keep what a previous attempt already wrote: model calls are slow, and a
    // late timeout should not throw away finished sections.
    const alreadyWritten = new Set(
      (existingLessons ?? [])
        .filter((row) => !staleLessonIds.includes(row.id))
        .map((row) => `${row.module_id}:${row.position}`),
    );

    const totalLessons = outline.modules.reduce(
      (count, module) => count + module.lessons.length,
      0,
    );
    let written = 0;
    for (const [index, module] of outline.modules.entries()) {
      module.lessons.forEach((_, lessonIndex) => {
        if (alreadyWritten.has(`${moduleIds[index]}:${lessonIndex}`)) written += 1;
      });
    }

    // Sections still owed per module: a chapter counts as written the moment
    // its last missing section lands. Modules an earlier attempt already
    // finished start at zero and are counted right away.
    const pendingPerModule = outline.modules.map((module, index) =>
      module.lessons.filter(
        (_, lessonIndex) => !alreadyWritten.has(`${moduleIds[index]}:${lessonIndex}`),
      ).length,
    );
    let chaptersWritten = pendingPerModule.filter((count) => count === 0).length;
    const stageLine = () =>
      stage(`Writing ${written} of ${totalLessons} sections · ${chaptersWritten} of ${outline.modules.length} chapters written`);

    await setStatus(admin, courseId, { stage: stageLine() });

    // One call per section: a section's notes, diagram and exercises are long,
    // and packing a whole module into one response used to hit the token cap
    // and come back repaired or truncated.
    const jobs: Promise<void>[] = [];

    // The calls run concurrently — the rate limiter already paces them — but
    // each section is only released (saved and counted) once every earlier
    // section of the outline has been. The database therefore always holds a
    // contiguous prefix of the outline: a student reading mid-build sees
    // section 1, 2, 3 … instead of chapter 50 landing before chapter 3.
    // The gate opens even when a section fails, so one bad section can never
    // strand the rest of the build behind it.
    let released = Promise.resolve();

    for (const [index, module] of outline.modules.entries()) {
      const moduleId = moduleIds[index];

      module.lessons.forEach((lesson, lessonIndex) => {
        if (alreadyWritten.has(`${moduleId}:${lessonIndex}`)) return;

        const predecessor = released;
        let release!: () => void;
        released = new Promise<void>((resolve) => {
          release = resolve;
        });

        jobs.push(
          (async () => {
            try {
              // Only this module's plan gates these sections: the lesson call
              // starts the moment its own plan lands, not after every module.
              const checks =
                (await plans[index])?.[lessonIndex]?.checks ?? defaultChecks(lesson);

              const transcript = transcriptLines(
                cuesBetween(lecture.cues, lesson.start, lesson.end),
              ).slice(0, 24_000);

              // Waiting for the earlier sections overlaps this section's own
              // model call, so ordering the arrival costs no build time.
              const [generated] = await Promise.all([
                nimJson<GeneratedLesson>({
                  system: lessonSystem(),
                  user: lessonUser({
                    courseTitle: lecture.title,
                    language,
                    moduleTitle: module.title,
                    moduleSummary: module.summary,
                    lessonTitle: lesson.title,
                    lessonSummary: lesson.summary,
                    lessonStart: lesson.start,
                    lessonEnd: lesson.end,
                    plan: checks,
                    transcript,
                  }),
                  maxTokens: 5_000,
                  priority: "background",
                  meta: { kind: "lesson", userId, courseId },
                  validate: validateLessonContent(lesson, checks, language),
                  repairHint:
                    "Notes need at least two blocks, each with a heading and 120 or more characters of Markdown prose. The exercises must match the assignment plan one for one.",
                }),
                predecessor,
              ]);

              if (aborted) return;

              await persistLesson({
                admin,
                courseId,
                moduleId,
                courseVideoId,
                position: lessonIndex,
                outline: lesson,
                generated,
                language,
              });

              written += 1;
              pendingPerModule[index] -= 1;
              if (pendingPerModule[index] === 0) chaptersWritten += 1;
              await setStatus(admin, courseId, { stage: stageLine() });
            } finally {
              release();
            }
          })(),
        );
      });
    }

    await Promise.all(jobs);

    // Nothing may ship as complete unless the rows in the database tile the
    // whole video — the in-memory outline already does, but a resumed attempt
    // can leave stale rows behind it. Playlist courses check only this video's
    // rows (global numbering happens at finalise).
    await assertCompleteCoverage(admin, courseId, duration, courseVideoId);

    return { language, level: outline.level, duration, chapters: outline.modules.length, sections: totalLessons };
  } catch (error) {
    aborted = true;
    console.error(`[generation] course ${courseId} video ${videoId} failed`, error);
    throw error;
  }
}

/**
 * Single entry point of the background job. Playlist courses (rows in
 * course_videos) fan out to one build per video; everything else keeps the
 * original single-video path.
 */
export async function runCourseGeneration(params: {
  courseId: string;
  userId: string;
  videoId: string;
}): Promise<void> {
  const { courseId, userId, videoId } = params;
  const admin = createSupabaseAdminClient();

  const { data: videos, error: videosError } = await admin
    .from("course_videos")
    .select("id,position,video_id,title,duration_seconds,status,attempts,error")
    .eq("course_id", courseId)
    .order("position");

  if (videosError) {
    await setStatus(admin, courseId, { status: "failed", stage: "Generation failed", error: videosError.message });
    return;
  }

  if (videos && videos.length > 0) {
    await runPlaylistGeneration({ admin, courseId, userId, videos: videos as CourseVideoRow[] });
    return;
  }

  // ---- single-video path (unchanged behaviour) ----
  try {
    const result = await buildVideo({
      admin,
      courseId,
      userId,
      videoId,
      courseVideoId: null,
      videoPosition: 0,
      label: "",
      isPrimary: true,
    });
    await setStatus(admin, courseId, {
      status: "ready",
      stage: `${result.chapters} modules · ${result.sections} sections`,
      error: null,
    });
  } catch (error) {
    await setStatus(admin, courseId, {
      status: "failed",
      stage: "Generation failed",
      error: friendlyError(error),
    });
  }
}

/** Caption requests back-to-back are what earns YouTube's 429 — pace every video. */
const VIDEO_PACE_MS = 3_000;
/** A throttled caption fetch is waited out in place: the error itself asks for minutes. */
const RATE_LIMIT_WAIT_MS = 60_000;
/** In-place waits per video per run before leaving it queued for a later run. */
const RATE_LIMIT_WAITS = 2;

/**
 * Old builds appended chapter numbers in build order, so a resumed run could
 * drop a fresh chapter into a slot another video already holds — the unique
 * (course_id, position) constraint would then fail the build. Move every
 * chapter to its video's slot first. Two phases (unique negatives, then the
 * real targets), so rows never clash mid-swap; rows already in place stay.
 */
async function normaliseChapterSlots(
  admin: SupabaseClient,
  courseId: string,
  videos: CourseVideoRow[],
): Promise<void> {
  const { data: rows, error } = await admin
    .from("modules")
    .select("id,course_video_id,start_seconds,position")
    .eq("course_id", courseId);
  if (error || !rows || rows.length === 0) return;

  type ModuleRow = {
    id: string;
    course_video_id: string | null;
    start_seconds: number;
    position: number;
  };
  const moduleRows = rows as ModuleRow[];

  const slotByVideo = new Map(videos.map((video) => [video.id, video.position * 1_000]));
  const byVideo = new Map<string, ModuleRow[]>();
  for (const row of moduleRows) {
    if (!row.course_video_id || !slotByVideo.has(row.course_video_id)) continue;
    const list = byVideo.get(row.course_video_id) ?? [];
    list.push(row);
    byVideo.set(row.course_video_id, list);
  }

  const targetById = new Map<string, number>();
  for (const [videoId, list] of byVideo) {
    const slot = slotByVideo.get(videoId) ?? 0;
    [...list]
      .sort((a, b) => a.start_seconds - b.start_seconds)
      .forEach((row, index) => targetById.set(row.id, slot + index));
  }

  const movers = moduleRows.filter((row) => {
    const target = targetById.get(row.id);
    return target !== undefined && target !== row.position;
  });
  if (movers.length === 0) return;

  for (const [index, row] of movers.entries()) {
    await admin.from("modules").update({ position: -(index + 1_000_000) }).eq("id", row.id);
  }
  for (const row of movers) {
    await admin.from("modules").update({ position: targetById.get(row.id) as number }).eq("id", row.id);
  }
}

/** One run over a playlist's work queue: build each queued video in order. */
async function runPlaylistGeneration(params: {
  admin: SupabaseClient;
  courseId: string;
  userId: string;
  videos: CourseVideoRow[];
}): Promise<void> {
  const { admin, courseId, userId, videos } = params;
  const total = videos.length;

  await normaliseChapterSlots(admin, courseId, videos);

  // Mutable queue: a video that fails its first try goes back in and gets its
  // second try within the same run.
  const queue = videos.filter((video) => video.status === "queued" || video.status === "building");
  let doneCount = videos.filter((video) => video.status === "done").length;
  let lastError: string | null = null;
  // One tail re-queue per throttled video per run, counted across visits.
  const throttledRequeues = new Map<string, number>();

  for (const video of queue) {
    const label = `Video ${video.position + 1} of ${total} · `;
    // Strikes count real build failures only — a YouTube 429 never burns one.
    let attempts = video.attempts;
    let rateLimitWaits = 0;

    // A throttled caption fetch is retried in place: waiting is what the error
    // asks for, and deferring the video to the tail of the queue would hit the
    // same rate limit again while later videos fill its chapter slot.
    for (;;) {
      await admin
        .from("course_videos")
        .update({ status: "building", attempts, error: null })
        .eq("id", video.id);
      await setStatus(admin, courseId, { status: "fetching", stage: `${label}Reading the captions`, error: null });

      try {
        const result = await buildVideo({
          admin,
          courseId,
          userId,
          videoId: video.video_id,
          courseVideoId: video.id,
          videoPosition: video.position,
          label,
          isPrimary: doneCount === 0,
        });
        await admin
          .from("course_videos")
          .update({ status: "done", duration_seconds: result.duration, error: null })
          .eq("id", video.id);
        doneCount += 1;
        break;
      } catch (error) {
        const message = friendlyError(error);
        lastError = message;
        console.error(`[generation] playlist video ${video.video_id} failed`, error);
        const throttled = error instanceof TranscriptError && error.code === "rate-limited";

        if (throttled && rateLimitWaits < RATE_LIMIT_WAITS) {
          rateLimitWaits += 1;
          const waitSeconds = (RATE_LIMIT_WAIT_MS * rateLimitWaits) / 1_000;
          await setStatus(admin, courseId, {
            stage: `${label}YouTube is rate-limiting captions — waiting ${waitSeconds}s`,
          });
          await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_WAIT_MS * rateLimitWaits));
          continue;
        }

        if (!throttled) attempts += 1;
        const exhausted = !throttled && attempts >= 2;
        await admin
          .from("course_videos")
          .update({ status: exhausted ? "failed" : "queued", error: message })
          .eq("id", video.id);

        if (throttled) {
          // One more chance at the tail of the run; if that fails too the
          // video stays queued — a rate limit is never a permanent failure,
          // so a later run finishes it and finalisePlaylist never drops it.
          const requeues = throttledRequeues.get(video.id) ?? 0;
          if (requeues < 1) {
            throttledRequeues.set(video.id, requeues + 1);
            queue.push({ ...video, status: "queued" });
          }
        } else if (!exhausted) {
          queue.push({ ...video, status: "queued", attempts });
        }
        break;
      }
    }

    // Caption requests back-to-back are what earns the 429 — pace every video.
    await new Promise((resolve) => setTimeout(resolve, VIDEO_PACE_MS));
  }

  if (doneCount === 0) {
    await setStatus(admin, courseId, {
      status: "failed",
      stage: "Generation failed",
      error: lastError ?? "No videos could be built.",
    });
    return;
  }

  // Videos still queued are the throttled ones whose waits ran out. Marking
  // the course ready now would ship it without them forever — "Try again" is
  // the only thing that restarts a job, and it only shows on `failed`. The
  // retry picks the queued rows straight back up; a permanently broken video
  // is `failed` here, not `queued`, so it never blocks finalise.
  const { data: endRows } = await admin
    .from("course_videos")
    .select("id,status")
    .eq("course_id", courseId);
  const pending = (endRows ?? []).filter(
    (row) => row.status === "queued" || row.status === "building",
  ).length;
  if (pending > 0) {
    await setStatus(admin, courseId, {
      status: "failed",
      stage: "Generation stopped",
      error: `YouTube kept rate-limiting captions, so ${pending} video${pending === 1 ? "" : "s"} did not finish. Wait a few minutes, then try again — the videos already built are kept.`,
    });
    return;
  }

  await finalisePlaylist(admin, courseId);
}

/**
 * The end of a playlist build: drop chapters of videos that failed for good,
 * fold videos shorter than five minutes into a neighbouring chapter, then
 * number chapters and sections globally (playlist order, then start time) and
 * mark the course ready.
 */
async function finalisePlaylist(admin: SupabaseClient, courseId: string): Promise<void> {
  const { data: videoRows } = await admin
    .from("course_videos")
    .select("id,position,status,duration_seconds")
    .eq("course_id", courseId)
    .order("position");
  const videos = (videoRows ?? []) as { id: string; position: number; status: string; duration_seconds: number }[];
  const done = videos.filter((video) => video.status === "done");

  // Chapters of videos that failed after their retries are removed entirely —
  // a half-built chapter would break the coverage tiling.
  const failedIds = videos.filter((video) => video.status !== "done").map((video) => video.id);
  if (failedIds.length > 0) {
    await admin.from("modules").delete().in("course_video_id", failedIds);
  }

  // Real durations: buildVideo knows the caption duration, the queue row may
  // only have the flat-playlist estimate (0 when unknown).
  const { data: moduleRows } = await admin
    .from("modules")
    .select("id,course_video_id,start_seconds,end_seconds")
    .eq("course_id", courseId);
  const modules = (moduleRows ?? []) as {
    id: string;
    course_video_id: string | null;
    start_seconds: number;
    end_seconds: number;
  }[];

  const durationByVideo = new Map<string, number>();
  for (const row of modules) {
    if (!row.course_video_id) continue;
    durationByVideo.set(
      row.course_video_id,
      Math.max(durationByVideo.get(row.course_video_id) ?? 0, row.end_seconds),
    );
  }
  for (const video of done) {
    const duration = durationByVideo.get(video.id) ?? video.duration_seconds;
    if (duration !== video.duration_seconds) {
      await admin.from("course_videos").update({ duration_seconds: duration }).eq("id", video.id);
      video.duration_seconds = duration;
    }
  }

  // A video shorter than five minutes cannot carry its own chapter (its
  // section would break the five-minute floor): move its sections into the
  // previous video's last chapter, else the next video's first. The sections
  // keep their own video and local timestamps — only the chapter they sit in
  // changes — so clicking one still plays the right video at the right time.
  // The video row stays too: lessons reference it (deleting it would cascade).
  const byVideo = new Map<string, typeof modules>();
  for (const row of modules) {
    if (!row.course_video_id) continue;
    const list = byVideo.get(row.course_video_id) ?? [];
    list.push(row);
    byVideo.set(row.course_video_id, list);
  }

  const order = [...done].sort((a, b) => a.position - b.position);
  for (const [index, video] of order.entries()) {
    const duration = durationByVideo.get(video.id) ?? video.duration_seconds;
    if (duration >= 5 * 60 || duration === 0) continue;

    const own = (byVideo.get(video.id) ?? []).sort((a, b) => a.start_seconds - b.start_seconds);
    if (own.length === 0) continue; // already folded by an earlier run

    // Target: previous video's last chapter, else the next video's first —
    // skipping videos that no longer hold chapters of their own.
    let target: (typeof modules)[number] | undefined;
    for (let i = index - 1; i >= 0 && !target; i--) {
      target = (byVideo.get(order[i].id) ?? []).sort((a, b) => a.start_seconds - b.start_seconds).at(-1);
    }
    for (let i = index + 1; i < order.length && !target; i++) {
      target = (byVideo.get(order[i].id) ?? []).sort((a, b) => a.start_seconds - b.start_seconds)[0];
    }
    if (!target) continue;

    // Re-parent section by section, parking each at a spare negative
    // position: (module_id, position) is unique and the host chapter already
    // holds 0, 1, 2 … The final renumber below rewrites them properly.
    const { data: ownLessonRows } = await admin
      .from("lessons")
      .select("id")
      .in(
        "module_id",
        own.map((row) => row.id),
      );
    for (const [lessonIndex, lesson] of (ownLessonRows ?? []).entries()) {
      await admin
        .from("lessons")
        .update({ module_id: target.id, position: -(video.position * 1_000 + lessonIndex + 100_000_000) })
        .eq("id", (lesson as { id: string }).id);
    }

    await admin.from("modules").delete().in(
      "id",
      own.map((row) => row.id),
    );
    byVideo.set(video.id, []); // this video no longer owns chapters
  }

  // Global numbering: chapters in playlist order (folded rows follow their
  // target video), sections by start time inside each chapter. Two phases —
  // temporary negative positions first, so (course_id, position) never clashes
  // while rows swap places.
  const { data: finalModuleRows } = await admin
    .from("modules")
    .select("id,course_video_id,start_seconds")
    .eq("course_id", courseId);
  const finalModules = ((finalModuleRows ?? []) as { id: string; course_video_id: string | null; start_seconds: number }[])
    .map((row) => {
      const video = row.course_video_id ? done.find((entry) => entry.id === row.course_video_id) : undefined;
      return { ...row, videoOrder: video?.position ?? Number.MAX_SAFE_INTEGER };
    })
    .sort((a, b) => a.videoOrder - b.videoOrder || a.start_seconds - b.start_seconds);

  for (const [index, module] of finalModules.entries()) {
    if (index === 0) continue;
    await admin.from("modules").update({ position: -(index + 1_000_000) }).eq("id", module.id);
  }
  for (const [index, module] of finalModules.entries()) {
    await admin.from("modules").update({ position: index }).eq("id", module.id);
  }

  const moduleIds = finalModules.map((module) => module.id);
  const { data: finalLessonRows } = await admin
    .from("lessons")
    .select("id,module_id,start_seconds,course_video_id")
    .eq("course_id", courseId)
    .in("module_id", moduleIds);
  const videoPosition = new Map(done.map((video) => [video.id, video.position]));
  const lessonsByModule = new Map<string, { id: string; start_seconds: number; course_video_id: string | null }[]>();
  for (const lesson of finalLessonRows ?? []) {
    const rows = lessonsByModule.get(lesson.module_id) ?? [];
    rows.push(lesson);
    lessonsByModule.set(lesson.module_id, rows);
  }
  for (const rows of lessonsByModule.values()) {
    // Playlist order first (a folded short video's sections follow their own
    // video), then local start time.
    const sorted = [...rows].sort(
      (a, b) =>
        (videoPosition.get(a.course_video_id ?? "") ?? Number.MAX_SAFE_INTEGER) -
          (videoPosition.get(b.course_video_id ?? "") ?? Number.MAX_SAFE_INTEGER) ||
        a.start_seconds - b.start_seconds,
    );
    for (const [index, lesson] of sorted.entries()) {
      if (index === 0) continue;
      await admin.from("lessons").update({ position: -(index + 1_000_000) }).eq("id", lesson.id);
    }
    for (const [index, lesson] of sorted.entries()) {
      await admin.from("lessons").update({ position: index }).eq("id", lesson.id);
    }
  }

  const duration = done.reduce((sum, video) => sum + video.duration_seconds, 0);
  const sections = (finalLessonRows ?? []).length;

  await setStatus(admin, courseId, {
    status: "ready",
    stage: `${done.length} of ${videos.length} videos built · ${finalModules.length} chapters · ${sections} sections`,
    duration_seconds: duration,
    error: null,
  });
}
