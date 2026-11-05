/** Shared content model. Rows from Supabase are mapped into these shapes. */

export type KeyTerm = {
  term: string;
  definition: string;
};

export type NoteBlock = {
  heading: string;
  /**
   * Markdown prose: paragraphs, lists, tables, fenced code and ```mermaid
   * diagrams. This is what the notes panel renders.
   */
  body?: string;
  /** Older courses and the demo fixtures only have bullets. */
  bullets?: string[];
};

/** Markdown for a note block, whichever shape it was stored in. */
export function noteBody(block: NoteBlock): string {
  if (block.body && block.body.trim()) return block.body;
  return (block.bullets ?? []).map((bullet) => `- ${bullet}`).join("\n");
}

export type Mcq = {
  id: string;
  prompt: string;
  options: string[];
  answer: number;
  /** One line naming what a wrong pick means the student believes. */
  misconception: string;
  explanation: string;
  /** Absolute second in the video where this is explained. */
  at: number;
  /** Practice questions are graded inline, not as part of the submission. */
  practice?: boolean;
};

export type ShortAnswer = {
  /** Exercise row id in Supabase; demo fixtures used for seeding have none. */
  id?: string;
  prompt: string;
  placeholder: string;
  /** Fallback grading fixture when the model is unavailable. */
  keywords: string[];
  model: string;
  misconception: string;
  explanation: string;
  at: number;
};

export type CodeExercise = {
  id: string;
  prompt: string;
  language: string;
  starterCode: string;
  hint: string;
  solution: string;
  explanation: string;
  at: number;
};

export type Lesson = {
  id: string;
  title: string;
  /** Absolute seconds inside the source video. */
  start: number;
  end: number;
  summary: string;
  keyTerms: KeyTerm[];
  notes: NoteBlock[];
  questions: Mcq[];
  shortAnswer?: ShortAnswer;
  /** Extra questions served by the "Try another question" button. */
  practiceBank: Mcq[];
  /** Coding tasks, graded by the tutor model against the exercise brief. */
  codeExercises?: CodeExercise[];
};

export type Chapter = {
  id: string;
  title: string;
  lessons: Lesson[];
};

export type Course = {
  /** Database id for generated courses; demo data used on the landing page has none. */
  id?: string;
  slug: string;
  title: string;
  channel: string;
  videoId: string;
  description: string;
  level: string;
  chapters: Chapter[];
  /** Lessons that already have a graded assignment, as lessonId -> score. */
  seeded: Record<string, number>;
  status?: string;
  stage?: string;
  error?: string | null;
  language?: string;
  durationSeconds?: number;
};

export type GradedLesson = {
  score: number;
  correct: number;
  total: number;
};

export type GradeMap = Record<string, GradedLesson>;

export type ExerciseError = {
  severity: "error" | "warning" | "tip";
  message: string;
  line?: number;
  code?: string;
};

export type ExerciseFeedback = {
  exerciseId: string;
  kind: "mcq" | "short" | "code";
  correct: boolean;
  score: number;
  maxScore: number;
  feedback: string;
  errors: ExerciseError[];
  at?: number;
};

export type AssignmentResult = {
  score: number;
  correct: number;
  total: number;
  passed: boolean;
  exercises: ExerciseFeedback[];
  summary?: string;
};
