import type { CourseProject, ProjectReview } from "@/lib/db/projects";
import type { AssignmentResult } from "@/lib/types";

export type AuthState = {
  error?: string;
  message?: string;
} | null;

export type CourseFormState = {
  error?: string;
} | null;

export type SubmitAnswers = Record<string, { choice?: number; text?: string }>;

export type SubmitState =
  | { ok: true; result: AssignmentResult }
  | { ok: false; error: string };

export type TutorMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: number | null;
  createdAt: string;
};

export type TutorState =
  | { ok: true; message: TutorMessage }
  | { ok: false; error: string };

export type ProjectCreateState =
  | { ok: true; project: CourseProject }
  | { ok: false; error: string };

export type ProjectSubmitState =
  | { ok: true; review: ProjectReview }
  | { ok: false; error: string };

export type RigorousState =
  | { ok: true; rigorous: boolean }
  | { ok: false; error: string };

/** One exam question, student-facing: answers and rubrics never leave the server ungraded. */
export type ChapterQuizQuestion =
  | { id: string; kind: "mcq"; prompt: string; options: string[] }
  | { id: string; kind: "short"; prompt: string }
  | { id: string; kind: "code"; prompt: string; language: string };

export type ChapterQuizStartState =
  | { ok: true; questions: ChapterQuizQuestion[] }
  | { ok: false; error: string };

/** The student's attempt at one question, sent for grading. */
export type ChapterQuizAnswer = { choice?: number; text?: string };

export type ChapterQuizReview =
  | { kind: "mcq"; picked: number | null; answer: number; explanation: string }
  | {
      kind: "short" | "code";
      correct: boolean;
      submitted: string;
      /** Model answer (short) or reference solution (code), revealed after grading. */
      answer: string;
      feedback: string;
      explanation: string;
    };

export type ChapterQuizSubmitState =
  | {
      ok: true;
      score: number;
      correct: number;
      total: number;
      /** Best score across all attempts; >= 80 opens the next chapter. */
      bestScore: number;
      attempts: number;
      review: ChapterQuizReview[];
    }
  | { ok: false; error: string };
