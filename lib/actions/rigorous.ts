"use server";

import type {
  ChapterQuizAnswer,
  ChapterQuizQuestion,
  ChapterQuizReview,
  ChapterQuizStartState,
  ChapterQuizSubmitState,
  RigorousState,
} from "@/lib/actions/types";
import { requireUser } from "@/lib/auth";
import { nimJson } from "@/lib/ai/nim";
import { chapterQuizSystem, chapterQuizUser, gradeSystem, gradeUser } from "@/lib/ai/prompts";
import { getCourseBundle } from "@/lib/db/courses";
import { computeLocks } from "@/lib/locks";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { noteBody } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Questions per chapter exam. */
const QUIZ_SIZE = 5;

/**
 * What the model must produce; answers stay on the server until graded.
 * kind may be absent on papers cached before mixed formats existed — those
 * rows are all-mcq and are normalized on read (see normalizeQuestion).
 */
type StoredMcq = {
  kind: "mcq";
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
};

type StoredShort = {
  kind: "short";
  prompt: string;
  /** Model answer, revealed only in the post-grading review. */
  answer: string;
  keywords: string[];
  explanation: string;
};

type StoredCode = {
  kind: "code";
  prompt: string;
  language: string;
  /** Reference solution, revealed only in the post-grading review. */
  solution: string;
  explanation: string;
};

type StoredQuestion = StoredMcq | StoredShort | StoredCode;

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Per-question validation. A missing kind means a legacy all-mcq paper. */
function normalizeQuestion(item: unknown): StoredQuestion | null {
  const raw = item as Record<string, unknown> | null;
  if (!raw) return null;

  const prompt = cleanText(raw.prompt, 400);
  const explanation = cleanText(raw.explanation, 600);
  const kind = raw.kind === "short" ? "short" : raw.kind === "code" ? "code" : "mcq";
  if (!prompt) return null;

  if (kind === "short") {
    const answer = cleanText(raw.answer, 600);
    const keywords = Array.isArray(raw.keywords)
      ? (raw.keywords as unknown[]).map((keyword) => cleanText(keyword, 60)).filter(Boolean)
      : [];
    if (!answer) return null;
    return { kind, prompt, answer, keywords, explanation };
  }

  if (kind === "code") {
    const language = cleanText(raw.language, 40) || "text";
    const solution = cleanText(raw.solution, 2_000);
    if (!solution) return null;
    return { kind, prompt, language, solution, explanation };
  }

  const options = Array.isArray(raw.options)
    ? (raw.options as unknown[]).map((option) => cleanText(option, 300))
    : [];
  const answer = Number(raw.answer);
  if (options.length !== 4 || options.some((option) => !option)) return null;
  if (!Number.isInteger(answer) || answer < 0 || answer > 3) return null;
  return { kind, prompt, options, answer, explanation };
}

/** The paper shape the model must hit: 5 questions, one short, at most one code. */
function validateQuiz(value: unknown): StoredQuestion[] | null {
  const root = value as { questions?: unknown } | null;
  const list = root?.questions;
  if (!Array.isArray(list) || list.length !== QUIZ_SIZE) return null;

  const questions: StoredQuestion[] = [];
  for (const item of list) {
    const question = normalizeQuestion(item);
    if (!question) return null;
    questions.push(question);
  }

  const shorts = questions.filter((question) => question.kind === "short").length;
  const codes = questions.filter((question) => question.kind === "code").length;
  if (shorts !== 1 || codes > 1) return null;
  return questions;
}

/**
 * Papers written before mixed formats existed are all-mcq with no "kind" on
 * any row. They are regenerated on next open so every exam has the same shape
 * (scores and attempt counts in their own columns are untouched).
 */
function isLegacyPaper(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof (item as Record<string, unknown> | null)?.kind !== "string")
  );
}

/** Stored rows may hold any jsonb; only a well-formed paper counts as cached. */
function parseStored(value: unknown): StoredQuestion[] | null {
  if (!Array.isArray(value) || value.length !== QUIZ_SIZE) return null;
  const questions: StoredQuestion[] = [];
  for (const item of value) {
    const question = normalizeQuestion(item);
    if (!question) return null;
    questions.push(question);
  }
  return questions;
}

/** The student-facing shape: no answers or rubrics before grading. */
function publicQuestions(questions: StoredQuestion[]): ChapterQuizQuestion[] {
  return questions.map((question, index) => {
    if (question.kind === "mcq") {
      return { id: `q${index}`, kind: "mcq" as const, prompt: question.prompt, options: question.options };
    }
    if (question.kind === "short") {
      return { id: `q${index}`, kind: "short" as const, prompt: question.prompt };
    }
    return { id: `q${index}`, kind: "code" as const, prompt: question.prompt, language: question.language };
  });
}

type ExamContext = {
  supabase: SupabaseClient;
  courseId: string;
  courseTitle: string;
  language: string;
  moduleId: string;
  chapterTitle: string;
  sections: { title: string; summary: string; notes: string }[];
};

/**
 * Everything the exam actions share: the chapter must be open (lib/locks.ts
 * decides — rigorous mode requires every section passed first; with the mode
 * off the exam is always available), so the server and the sidebar can never
 * disagree about a lock.
 */
async function loadExamContext(
  userId: string,
  moduleId: string,
): Promise<{ ok: true; context: ExamContext } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();

  const { data: moduleRow, error: moduleError } = await supabase
    .from("modules")
    .select("id,course_id,title")
    .eq("id", moduleId)
    .maybeSingle();

  if (moduleError) return { ok: false, error: moduleError.message };
  if (!moduleRow) return { ok: false, error: "That chapter does not exist." };

  const { data: courseRow, error: courseError } = await supabase
    .from("courses")
    .select("id,slug,title,language")
    .eq("id", (moduleRow as { course_id: string }).course_id)
    .maybeSingle();

  if (courseError) return { ok: false, error: courseError.message };
  if (!courseRow) return { ok: false, error: "That course does not exist." };

  const course = courseRow as { id: string; slug: string; title: string; language: string | null };

  const bundle = await getCourseBundle(supabase, userId, course.slug);
  if (!bundle) return { ok: false, error: "That course does not exist." };

  const chapterIndex = bundle.course.chapters.findIndex((chapter) => chapter.id === moduleId);
  if (chapterIndex === -1) return { ok: false, error: "That chapter does not exist." };

  const locks = computeLocks(
    bundle.course,
    bundle.grades,
    bundle.quizzes,
    Boolean(bundle.course.rigorous),
  );
  const state = locks.examState(chapterIndex);
  if (state === "locked") {
    return { ok: false, error: "Pass every section of this chapter before its end exam." };
  }

  const chapter = bundle.course.chapters[chapterIndex];
  return {
    ok: true,
    context: {
      supabase,
      courseId: course.id,
      courseTitle: course.title,
      language: course.language || "text",
      moduleId,
      chapterTitle: chapter.title,
      sections: chapter.lessons.map((lesson) => ({
        title: lesson.title,
        summary: lesson.summary,
        notes: lesson.notes.map(noteBody).join("\n\n"),
      })),
    },
  };
}

/** The per-course rigorous switch (default off). */
export async function setRigorousAction(
  courseId: string,
  enabled: boolean,
): Promise<RigorousState> {
  const user = await requireUser();

  try {
    const supabase = await createSupabaseServerClient();
    const { data: courseRow } = await supabase
      .from("courses")
      .select("id")
      .eq("id", courseId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!courseRow) return { ok: false, error: "That course does not exist." };

    const { error } = await supabase
      .from("courses")
      .update({ rigorous: enabled })
      .eq("id", courseId)
      .eq("user_id", user.id);

    if (error) {
      return {
        ok: false,
        error: /rigorous|schema cache/i.test(error.message)
          ? "This database has not run the latest supabase/schema.sql yet — apply it in the Supabase SQL editor first."
          : error.message,
      };
    }

    return { ok: true, rigorous: enabled };
  } catch (error) {
    console.error("[rigorous] toggle failed", error);
    return { ok: false, error: "Could not save that setting. Try again in a moment." };
  }
}

/**
 * Opens the chapter exam: returns the cached paper on every visit, or writes
 * one the first time. The answer indexes never leave here ungraded.
 */
export async function startChapterQuizAction(
  moduleId: string,
): Promise<ChapterQuizStartState> {
  const user = await requireUser();

  try {
    const loaded = await loadExamContext(user.id, moduleId);
    if (!loaded.ok) return loaded;
    const { context } = loaded;
    const { supabase } = context;

    const { data: row, error: rowError } = await supabase
      .from("chapter_quizzes")
      .select("questions")
      .eq("user_id", user.id)
      .eq("module_id", moduleId)
      .maybeSingle();

    if (rowError && !/does not exist|schema cache/i.test(rowError.message)) {
      return { ok: false, error: rowError.message };
    }

    const rawQuestions = (row as { questions?: unknown } | null)?.questions;
    // A pre-mixed-format paper is discarded here and rewritten below; its
    // best_score/attempts live in their own columns and survive untouched.
    const cached = isLegacyPaper(rawQuestions) ? null : parseStored(rawQuestions);
    if (cached) return { ok: true, questions: publicQuestions(cached) };

    const generated = await nimJson<StoredQuestion[]>({
      system: chapterQuizSystem(),
      user: chapterQuizUser({
        courseTitle: context.courseTitle,
        language: context.language,
        chapterTitle: context.chapterTitle,
        sections: context.sections,
      }),
      maxTokens: 3_200,
      temperature: 0.4,
      priority: "interactive",
      meta: { kind: "chapter-quiz", userId: user.id, courseId: context.courseId },
      validate: validateQuiz,
    });

    const { error: saveError } = await supabase.from("chapter_quizzes").upsert(
      {
        user_id: user.id,
        course_id: context.courseId,
        module_id: moduleId,
        questions: generated,
      },
      { onConflict: "user_id,module_id" },
    );

    if (saveError) {
      // Uncached is survivable, but submitting would fail next — say so now.
      return {
        ok: false,
        error: `The exam was written but could not be saved (${saveError.message}). Apply the latest supabase/schema.sql and reopen the exam.`,
      };
    }

    return { ok: true, questions: publicQuestions(generated) };
  } catch (error) {
    console.error("[rigorous] exam start failed", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message.slice(0, 400)
          : "Could not write the exam. Try again in a moment.",
    };
  }
}

type ExamGrade = {
  exerciseId: string;
  correct: boolean;
  score: number;
  feedback: string;
};

type ExamGradePayload = { results: ExamGrade[] };

/** Short/code answers are graded by the model; only well-formed batches count. */
function validateExamGrades(expectedIds: string[]): (value: unknown) => ExamGradePayload | null {
  return (value: unknown) => {
    const root = value as { results?: unknown } | null;
    if (!Array.isArray(root?.results)) return null;

    const results: ExamGrade[] = [];
    for (const item of root.results as Record<string, unknown>[]) {
      if (typeof item?.exerciseId !== "string" || !expectedIds.includes(item.exerciseId)) continue;
      results.push({
        exerciseId: item.exerciseId,
        correct: Boolean(item.correct),
        score: Number.isFinite(Number(item.score)) ? Math.round(Number(item.score)) : 0,
        feedback: String(item.feedback ?? "").slice(0, 1_200),
      });
    }
    return results.length > 0 ? { results } : null;
  };
}

function countWords(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

/**
 * Grades an attempt against the stored paper and keeps the best score.
 * mcq grade here by index; short and code answers go to the model grader
 * (the same gradeSystem/gradeUser pair the section assignments use).
 */
export async function submitChapterQuizAction(
  moduleId: string,
  answers: ChapterQuizAnswer[],
): Promise<ChapterQuizSubmitState> {
  const user = await requireUser();

  try {
    const loaded = await loadExamContext(user.id, moduleId);
    if (!loaded.ok) return loaded;
    const { context } = loaded;
    const { supabase } = context;

    const { data: row, error: rowError } = await supabase
      .from("chapter_quizzes")
      .select("questions,best_score,attempts")
      .eq("user_id", user.id)
      .eq("module_id", moduleId)
      .maybeSingle();

    if (rowError && !/does not exist|schema cache/i.test(rowError.message)) {
      return { ok: false, error: rowError.message };
    }

    const stored = parseStored((row as { questions?: unknown } | null)?.questions);
    if (!stored) {
      return { ok: false, error: "Open the exam first — it writes its questions on first open." };
    }

    const attemptsIn = Array.isArray(answers) ? answers : [];
    const review: ChapterQuizReview[] = [];
    const pending: { index: number; question: StoredShort | StoredCode; submitted: string }[] = [];

    stored.forEach((question, index) => {
      const attempt = attemptsIn[index] ?? {};

      if (question.kind === "mcq") {
        const pick = Number(attempt.choice);
        const picked =
          Number.isInteger(pick) && pick >= 0 && pick < question.options.length ? pick : null;
        review[index] = {
          kind: "mcq",
          picked,
          answer: question.answer,
          explanation: question.explanation,
        };
        return;
      }

      // Cap the payload so one student cannot send an unbounded prompt.
      const submitted = (typeof attempt.text === "string" ? attempt.text : "").slice(0, 8_000);
      const answer = question.kind === "short" ? question.answer : question.solution;
      if (
        !submitted.trim() ||
        (question.kind === "short" &&
          question.keywords.length > 0 &&
          countWords(submitted) < 2)
      ) {
        review[index] = {
          kind: question.kind,
          correct: false,
          submitted,
          answer,
          feedback: !submitted.trim()
            ? "You left this one empty."
            : "That answer is too short to judge — write at least a sentence.",
          explanation: question.explanation,
        };
        return;
      }

      pending.push({ index, question, submitted });
    });

    if (pending.length > 0) {
      const graded = await nimJson<ExamGradePayload>({
        system: gradeSystem(),
        user: gradeUser({
          lessonTitle: context.chapterTitle,
          lessonSummary: context.sections.map((section) => section.title).join("; "),
          language: context.language,
          exercises: pending.map(({ index, question, submitted }) => ({
            id: `q${index}`,
            kind: question.kind,
            prompt: question.prompt,
            points: 1,
            keywords: question.kind === "short" ? question.keywords : undefined,
            solution: question.kind === "short" ? question.answer : question.solution,
            submitted,
          })),
        }),
        maxTokens: 1_600,
        temperature: 0,
        priority: "interactive",
        meta: { kind: "chapter-quiz-grade", userId: user.id, courseId: context.courseId },
        validate: validateExamGrades(pending.map(({ index }) => `q${index}`)),
        repairHint: "Return one result per submitted question, keyed by exerciseId.",
      });

      const byId = new Map(graded.results.map((result) => [result.exerciseId, result]));
      for (const { index, question, submitted } of pending) {
        const result = byId.get(`q${index}`);
        review[index] = {
          kind: question.kind,
          correct: Boolean(result?.correct),
          submitted,
          answer: question.kind === "short" ? question.answer : question.solution,
          feedback:
            result?.feedback ||
            "The grader could not read this answer. Check the chapter notes and try again.",
          explanation: question.explanation,
        };
      }
    }

    const correct = review.filter((item) => item.kind === "mcq" && item.picked === item.answer)
      .length +
      review.filter((item) => item.kind !== "mcq" && item.correct).length;
    const score = Math.round((correct / stored.length) * 100);
    const previousBest = Number((row as { best_score?: number } | null)?.best_score ?? 0);
    const previousAttempts = Number((row as { attempts?: number } | null)?.attempts ?? 0);
    const bestScore = Math.max(previousBest, score);
    const attempts = previousAttempts + 1;

    const { error: saveError } = await supabase.from("chapter_quizzes").upsert(
      {
        user_id: user.id,
        course_id: context.courseId,
        module_id: moduleId,
        best_score: bestScore,
        attempts,
        passed: bestScore >= 80,
      },
      { onConflict: "user_id,module_id" },
    );

    if (saveError) {
      return { ok: false, error: `Could not save your score: ${saveError.message}` };
    }

    return { ok: true, score, correct, total: stored.length, bestScore, attempts, review };
  } catch (error) {
    console.error("[rigorous] exam submit failed", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message.slice(0, 400)
          : "Could not grade that attempt. Try again in a moment.",
    };
  }
}
