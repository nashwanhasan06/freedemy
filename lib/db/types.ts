/** Row shapes for the tables in supabase/schema.sql. */

export type CourseRow = {
  id: string;
  user_id: string;
  slug: string;
  title: string;
  channel: string;
  video_id: string;
  source_url: string;
  description: string;
  level: string;
  language: string;
  duration_seconds: number;
  status: "queued" | "fetching" | "outlining" | "writing" | "ready" | "failed";
  stage: string;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type ModuleRow = {
  id: string;
  course_id: string;
  position: number;
  title: string;
  summary: string;
  start_seconds: number;
  end_seconds: number;
};

export type LessonRow = {
  id: string;
  course_id: string;
  module_id: string;
  position: number;
  title: string;
  summary: string;
  start_seconds: number;
  end_seconds: number;
  key_terms: { term: string; definition: string }[];
  notes: { heading: string; body?: string; bullets?: string[] }[];
};

export type ExerciseRow = {
  id: string;
  course_id: string;
  lesson_id: string;
  position: number;
  kind: "mcq" | "short" | "code";
  prompt: string;
  options: string[];
  answer_index: number | null;
  keywords: string[];
  starter_code: string | null;
  solution: string | null;
  explanation: string;
  misconception: string;
  hint: string;
  language: string | null;
  at_seconds: number;
  points: number;
};

export type SubmissionRow = {
  id: string;
  user_id: string;
  course_id: string;
  lesson_id: string;
  exercise_id: string;
  answer: Record<string, unknown>;
  score: number;
  max_score: number;
  passed: boolean;
  feedback: string;
  errors: unknown[];
  created_at: string;
};

export type ProgressRow = {
  user_id: string;
  course_id: string;
  lesson_id: string;
  score: number;
  correct: number;
  total: number;
  attempts: number;
  completed: boolean;
  updated_at: string;
};

export type ProjectRow = {
  id: string;
  course_id: string;
  title: string;
  brief: string;
  requirements: string[];
  starter_code: string;
  language: string;
  created_at: string;
};

export type ProjectSubmissionRow = {
  id: string;
  user_id: string;
  course_id: string;
  project_id: string;
  code: string;
  score: number;
  passed: boolean;
  summary: string;
  checks: unknown[];
  errors: unknown[];
  created_at: string;
};

export type TutorMessageRow = {
  id: string;
  user_id: string;
  course_id: string;
  lesson_id: string;
  role: "user" | "assistant";
  content: string;
  at_seconds: number | null;
  created_at: string;
};
