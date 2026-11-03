/** Shared content model for the UI. All data in this build is static demo data. */

export type KeyTerm = {
  term: string;
  definition: string;
};

export type NoteBlock = {
  heading: string;
  bullets: string[];
};

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
  prompt: string;
  placeholder: string;
  /** Grading fixture: an answer that mentions any keyword is accepted. */
  keywords: string[];
  model: string;
  misconception: string;
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
  shortAnswer: ShortAnswer;
  /** Extra questions served by the "Try another question" button. */
  practiceBank: Mcq[];
};

export type Chapter = {
  id: string;
  title: string;
  lessons: Lesson[];
};

export type Course = {
  slug: string;
  title: string;
  channel: string;
  videoId: string;
  description: string;
  level: string;
  chapters: Chapter[];
  /** Lessons that already have a graded assignment, as lessonId -> score. */
  seeded: Record<string, number>;
};

export type GradedLesson = {
  score: number;
  correct: number;
  total: number;
};

export type GradeMap = Record<string, GradedLesson>;
