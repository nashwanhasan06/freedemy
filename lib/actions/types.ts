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
