"use server";

import type { TutorMessage, TutorState } from "@/lib/actions/types";
import { nimJson } from "@/lib/ai/nim";
import { tutorSystem, type TutorMaterial } from "@/lib/ai/prompts";
import { loadTutorThread } from "@/lib/ai/tutor-session";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { KeyTerm, NoteBlock } from "@/lib/types";

type LessonRow = {
  id: string;
  course_id: string;
  module_id: string;
  position: number;
  title: string;
  summary: string;
  start_seconds: number;
  end_seconds: number;
  key_terms: KeyTerm[];
  notes: NoteBlock[];
};

type ExerciseRow = {
  kind: "mcq" | "short" | "code";
  prompt: string;
  language: string | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function validateReply(lessonStart: number, lessonEnd: number) {
  return (value: unknown): { answer: string; at: number | null } | null => {
    const root = value as { answer?: unknown; at?: unknown } | null;
    const answer = typeof root?.answer === "string" ? root.answer.trim() : "";
    if (!answer) return null;

    const raw = Number(root?.at);
    const at =
      Number.isFinite(raw) && raw >= 0
        ? clamp(Math.round(raw), lessonStart, Math.max(lessonStart, lessonEnd - 1))
        : null;

    return { answer: answer.slice(0, 4_000), at };
  };
}

export async function askTutorAction(input: {
  lessonId: string;
  question: string;
}): Promise<TutorState> {
  const user = await requireUser();

  try {
    const lessonId = typeof input?.lessonId === "string" ? input.lessonId : "";
    const question = typeof input?.question === "string" ? input.question.trim() : "";

    if (!lessonId || !question) {
      return { ok: false, error: "Ask a question first." };
    }
    if (question.length > 2_000) {
      return { ok: false, error: "That question is too long — keep it under 2000 characters." };
    }

    const supabase = await createSupabaseServerClient();

    const { data: lessonData, error: lessonError } = await supabase
      .from("lessons")
      .select("id,course_id,module_id,position,title,summary,start_seconds,end_seconds,key_terms,notes")
      .eq("id", lessonId)
      .maybeSingle();

    if (lessonError) return { ok: false, error: lessonError.message };
    if (!lessonData) return { ok: false, error: "That lesson does not exist." };

    const lesson = lessonData as LessonRow;

    const [
      { data: courseData },
      { data: exerciseData },
      { data: moduleData },
      thread,
    ] = await Promise.all([
      supabase.from("courses").select("id,title").eq("id", lesson.course_id).maybeSingle(),
      supabase
        .from("exercises")
        .select("kind,prompt,language")
        .eq("lesson_id", lessonId)
        .order("position"),
      supabase
        .from("modules")
        .select("id,title,summary")
        .eq("id", lesson.module_id)
        .maybeSingle(),
      // The summary plus the turns still inside the verbatim window; folds
      // older turns itself when the thread has outgrown the budget.
      loadTutorThread(supabase, {
        userId: user.id,
        lessonId,
        courseId: lesson.course_id,
        lessonTitle: lesson.title,
      }),
    ]);

    // The tutor teaches a section inside a module, so it needs to know what
    // comes before and after it to point the student at the right place.
    const { data: siblingData } = await supabase
      .from("lessons")
      .select("title,position")
      .eq("module_id", lesson.module_id)
      .order("position");

    const neighbours = ((siblingData ?? []) as { title: string; position: number }[])
      .filter(
        (sibling) =>
          sibling.position === lesson.position - 1 || sibling.position === lesson.position + 1,
      )
      .map((sibling) => sibling.title);

    const exercises = (exerciseData ?? []) as ExerciseRow[];

    const material: TutorMaterial = {
      title: lesson.title,
      start: lesson.start_seconds,
      end: lesson.end_seconds,
      summary: lesson.summary,
      notes: Array.isArray(lesson.notes) ? lesson.notes : [],
      keyTerms: Array.isArray(lesson.key_terms) ? lesson.key_terms : [],
      questions: exercises
        .filter((exercise) => exercise.kind === "mcq")
        .map((exercise) => ({ prompt: exercise.prompt })),
      shortAnswer: exercises.find((exercise) => exercise.kind === "short") ?? null,
      codeExercises: exercises
        .filter((exercise) => exercise.kind === "code")
        .map((exercise) => ({ prompt: exercise.prompt, language: exercise.language ?? "python" })),
      moduleTitle: moduleData?.title ?? undefined,
      moduleSummary: moduleData?.summary ?? undefined,
      neighbours,
    };

    const { error: insertError } = await supabase.from("tutor_messages").insert({
      user_id: user.id,
      course_id: lesson.course_id,
      lesson_id: lessonId,
      role: "user",
      content: question,
    });

    if (insertError) return { ok: false, error: insertError.message };

    // Older turns were folded into `summary`; the window carries what the
    // student is most likely still talking about. Labelled as the tutor's own
    // transcript, because the model otherwise treats it as another document
    // and refuses to answer questions that refer back to it.
    const transcript = [
      ...thread.recent.map(
        (message) => `${message.role === "user" ? "Student" : "Tutor"}: ${message.content}`,
      ),
      `Student: ${question}`,
    ].join("\n\n");

    const conversation = thread.summary
      ? `Your earlier turns with this student were condensed into this summary — it is your own memory of the conversation, not a document:\n${thread.summary}\n\nThe messages after it are the rest of the thread:\n\n${transcript}`
      : transcript;

    const systemPrompt = tutorSystem(
      material,
      (courseData?.title as string | undefined) ?? "Course",
    );

    const reply = await nimJson<{ answer: string; at: number | null }>({
      system: systemPrompt,
      user: `Conversation:\n${conversation}`,
      // A teaching answer with one worked example needs more room than a
      // one-paragraph summary.
      maxTokens: 1_500,
      temperature: 0.4,
      priority: "interactive",
      meta: { kind: "tutor", userId: user.id, courseId: lesson.course_id },
      validate: validateReply(lesson.start_seconds, lesson.end_seconds),
    });

    const { data: saved, error: saveError } = await supabase
      .from("tutor_messages")
      .insert({
        user_id: user.id,
        course_id: lesson.course_id,
        lesson_id: lessonId,
        role: "assistant",
        content: reply.answer,
        at_seconds: reply.at,
      })
      .select("id,role,content,at_seconds,created_at")
      .single();

    if (saveError || !saved) {
      return { ok: false, error: saveError?.message ?? "Could not save the tutor reply." };
    }

    const message: TutorMessage = {
      id: saved.id as string,
      role: "assistant",
      content: saved.content as string,
      at: (saved.at_seconds as number | null) ?? null,
      createdAt: saved.created_at as string,
    };

    return { ok: true, message };
  } catch (error) {
    console.error("[tutor] failed", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message.slice(0, 400) : "The tutor could not answer just now.",
    };
  }
}
