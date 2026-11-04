"use server";

import type { SubmitAnswers, SubmitState } from "@/lib/actions/types";
import { nimJson } from "@/lib/ai/nim";
import { gradeSystem, gradeUser } from "@/lib/ai/prompts";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ExerciseError, ExerciseFeedback } from "@/lib/types";

type ExerciseRow = {
  id: string;
  kind: "mcq" | "short" | "code";
  prompt: string;
  options: string[];
  answer_index: number | null;
  keywords: string[];
  solution: string | null;
  language: string | null;
  at_seconds: number;
  points: number;
};

type ModelGrade = {
  exerciseId: string;
  correct: boolean;
  score: number;
  feedback: string;
  errors: ExerciseError[];
};

type ModelGradePayload = { results: ModelGrade[]; summary: string };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function validateGrades(expectedIds: string[]): (value: unknown) => ModelGradePayload | null {
  return (value: unknown) => {
    const root = value as { results?: unknown; summary?: unknown } | null;
    if (!Array.isArray(root?.results)) return null;

    const results: ModelGrade[] = [];
    for (const item of root.results as Record<string, unknown>[]) {
      if (typeof item?.exerciseId !== "string") continue;
      if (!expectedIds.includes(item.exerciseId)) continue;

      const errors: ExerciseError[] = Array.isArray(item.errors)
        ? (item.errors as Record<string, unknown>[])
            .map((error) => {
              const severity = String(error?.severity ?? "error");
              return {
                severity:
                  severity === "warning" || severity === "tip"
                    ? (severity as "warning" | "tip")
                    : ("error" as const),
                message: String(error?.message ?? "").slice(0, 500),
                line:
                  typeof error?.line === "number" && Number.isFinite(error.line)
                    ? Math.round(error.line)
                    : undefined,
                code: typeof error?.code === "string" ? error.code.slice(0, 300) : undefined,
              };
            })
            .filter((error) => error.message)
            .slice(0, 8)
        : [];

      results.push({
        exerciseId: item.exerciseId,
        correct: Boolean(item.correct),
        score: Number.isFinite(Number(item.score)) ? Math.round(Number(item.score)) : 0,
        feedback: String(item.feedback ?? "").slice(0, 1_200),
        errors,
      });
    }

    if (results.length === 0) return null;

    return {
      results,
      summary: String(root.summary ?? "").slice(0, 800),
    };
  };
}

function countWords(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

export async function submitAssignmentAction(input: {
  lessonId: string;
  answers: SubmitAnswers;
}): Promise<SubmitState> {
  const user = await requireUser();

  try {
    const lessonId = typeof input?.lessonId === "string" ? input.lessonId : "";
    const answers = input?.answers && typeof input.answers === "object" ? input.answers : {};

    if (!lessonId) return { ok: false, error: "Missing lesson." };

    const supabase = await createSupabaseServerClient();

    const { data: lessonData, error: lessonError } = await supabase
      .from("lessons")
      .select("id,course_id,title,summary,start_seconds,end_seconds")
      .eq("id", lessonId)
      .maybeSingle();

    if (lessonError) return { ok: false, error: lessonError.message };
    if (!lessonData) return { ok: false, error: "That lesson does not exist." };

    const lesson = lessonData as {
      id: string;
      course_id: string;
      title: string;
      summary: string;
    };

    const [{ data: exerciseData }, { data: courseData }] = await Promise.all([
      supabase.from("exercises").select("*").eq("lesson_id", lessonId).order("position"),
      supabase.from("courses").select("id,language").eq("id", lesson.course_id).maybeSingle(),
    ]);

    const exercises = (exerciseData ?? []) as ExerciseRow[];
    if (exercises.length === 0) {
      return { ok: false, error: "This lesson has no exercises yet." };
    }

    const language = (courseData?.language as string | undefined) ?? "python";

    const feedback: ExerciseFeedback[] = [];
    const pending: { exercise: ExerciseRow; submitted: string }[] = [];

    for (const exercise of exercises) {
      const answer = answers[exercise.id] ?? {};

      if (exercise.kind === "mcq") {
        const picked =
          typeof answer.choice === "number" && Number.isFinite(answer.choice)
            ? Math.round(answer.choice)
            : -1;
        const correct = picked === (exercise.answer_index ?? -1);
        feedback.push({
          exerciseId: exercise.id,
          kind: "mcq",
          correct,
          score: correct ? exercise.points : 0,
          maxScore: exercise.points,
          feedback: correct ? "" : "That option doesn't match what the lesson says.",
          errors: [],
          at: exercise.at_seconds,
        });
        continue;
      }

      // Cap the payload so one student cannot send an unbounded prompt.
      const submitted = (typeof answer.text === "string" ? answer.text : "").slice(0, 8_000);
      if (!submitted.trim()) {
        feedback.push({
          exerciseId: exercise.id,
          kind: exercise.kind,
          correct: false,
          score: 0,
          maxScore: exercise.points,
          feedback: "You left this one empty.",
          errors: [],
          at: exercise.at_seconds,
        });
        continue;
      }

      if (exercise.kind === "short" && exercise.keywords.length > 0 && countWords(submitted) < 2) {
        feedback.push({
          exerciseId: exercise.id,
          kind: "short",
          correct: false,
          score: 0,
          maxScore: exercise.points,
          feedback: "That answer is too short to judge — write at least a sentence.",
          errors: [],
          at: exercise.at_seconds,
        });
        continue;
      }

      pending.push({ exercise, submitted });
    }

    let summary = "";

    if (pending.length > 0) {
      const graded = await nimJson<ModelGradePayload>({
        system: gradeSystem(),
        user: gradeUser({
          lessonTitle: lesson.title,
          lessonSummary: lesson.summary,
          language,
          exercises: pending.map(({ exercise, submitted }) => ({
            id: exercise.id,
            kind: exercise.kind,
            prompt: exercise.prompt,
            points: exercise.points,
            options: exercise.options,
            answerIndex: exercise.answer_index ?? undefined,
            keywords: exercise.keywords,
            solution: exercise.solution ?? undefined,
            submitted,
          })),
        }),
        maxTokens: 2_200,
        temperature: 0,
        priority: "interactive",
        meta: { kind: "grade", userId: user.id, courseId: lesson.course_id },
        validate: validateGrades(pending.map(({ exercise }) => exercise.id)),
      });

      summary = graded.summary;
      const byId = new Map(graded.results.map((result) => [result.exerciseId, result]));

      for (const { exercise } of pending) {
        const result = byId.get(exercise.id);
        const score = result ? clamp(result.score, 0, exercise.points) : 0;

        feedback.push({
          exerciseId: exercise.id,
          kind: exercise.kind,
          correct: result ? result.correct || score >= exercise.points : false,
          score,
          maxScore: exercise.points,
          feedback:
            result?.feedback ||
            "The grader could not read this answer. Check the lesson notes and try again.",
          errors: result?.errors ?? [],
          at: exercise.at_seconds,
        });
      }
    }

    const totalPoints = exercises.reduce((total, exercise) => total + exercise.points, 0);
    const earned = feedback.reduce((total, item) => total + item.score, 0);
    const score = totalPoints === 0 ? 0 : Math.round((earned / totalPoints) * 100);
    const correctCount = feedback.filter((item) => item.correct).length;

    const { error: submissionError } = await supabase.from("submissions").insert(
      feedback.map((item) => {
        const exercise = exercises.find((row) => row.id === item.exerciseId);
        const answer = answers[item.exerciseId] ?? {};
        return {
          user_id: user.id,
          course_id: lesson.course_id,
          lesson_id: lessonId,
          exercise_id: item.exerciseId,
          answer: exercise?.kind === "mcq" ? { choice: answer.choice ?? null } : { text: answer.text ?? "" },
          score: item.score,
          max_score: item.maxScore,
          passed: item.correct,
          feedback: item.feedback,
          errors: item.errors,
        };
      }),
    );

    if (submissionError) {
      console.error("[assignments] could not save submissions", submissionError.message);
    }

    const { data: previous } = await supabase
      .from("lesson_progress")
      .select("score,attempts")
      .eq("user_id", user.id)
      .eq("lesson_id", lessonId)
      .maybeSingle();

    const bestScore = Math.max(score, (previous?.score as number | undefined) ?? 0);

    const { error: progressError } = await supabase.from("lesson_progress").upsert(
      {
        user_id: user.id,
        course_id: lesson.course_id,
        lesson_id: lessonId,
        score: bestScore,
        correct: correctCount,
        total: feedback.length,
        attempts: ((previous?.attempts as number | undefined) ?? 0) + 1,
        completed: bestScore >= 70,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,lesson_id" },
    );

    if (progressError) {
      console.error("[assignments] could not save progress", progressError.message);
    }

    return {
      ok: true,
      result: {
        score,
        correct: correctCount,
        total: feedback.length,
        passed: score >= 70,
        exercises: feedback,
        ...(summary ? { summary } : {}),
      },
    };
  } catch (error) {
    console.error("[assignments] submission failed", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message.slice(0, 400)
          : "Could not grade that submission.",
    };
  }
}
