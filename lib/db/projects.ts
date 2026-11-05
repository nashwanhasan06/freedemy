import type { SupabaseClient } from "@supabase/supabase-js";

import type { ExerciseError } from "@/lib/types";

import type { ProjectRow, ProjectSubmissionRow } from "./types";

export type CourseProject = {
  id: string;
  courseId: string;
  title: string;
  /** Markdown: the problem, the input, what the finished program must do. */
  brief: string;
  requirements: string[];
  starterCode: string;
  language: string;
};

export type ProjectCheck = {
  requirement: string;
  met: boolean;
  note: string;
};

export type ProjectReview = {
  score: number;
  passed: boolean;
  summary: string;
  checks: ProjectCheck[];
  errors: ExerciseError[];
  createdAt: string;
};

/** Everything the project page and the course sidebar need in one read. */
export type ProjectState = {
  project: CourseProject;
  /** Best attempt, for the badge and the "what is still missing" list. */
  best: ProjectReview | null;
  latest: ProjectReview | null;
  /** The code they sent last, so a revision starts from their own work. */
  lastCode: string | null;
  attempts: number;
  passed: boolean;
  completedAt: string | null;
};

export type ProjectLookup =
  | { status: "ready"; state: ProjectState }
  | { status: "empty" }
  | { status: "setup" }
  | { status: "error" };

/**
 * A project table that has not been created yet is a setup step, not a bug: the
 * schema block ships in supabase/schema.sql. Everything else is a real error.
 */
export function isMissingProjectSetup(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  return /does not exist|schema cache|no such table/i.test(error.message ?? "");
}

function projectFrom(row: ProjectRow): CourseProject {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    brief: row.brief,
    requirements: Array.isArray(row.requirements) ? (row.requirements as string[]) : [],
    starterCode: row.starter_code,
    language: row.language,
  };
}

function reviewFrom(row: ProjectSubmissionRow): ProjectReview {
  return {
    score: row.score,
    passed: row.passed,
    summary: row.summary,
    checks: Array.isArray(row.checks) ? (row.checks as ProjectCheck[]) : [],
    errors: Array.isArray(row.errors) ? (row.errors as ExerciseError[]) : [],
    createdAt: row.created_at,
  };
}

/** The cached brief for a course, if one was already generated. */
export async function getProject(
  supabase: SupabaseClient,
  courseId: string,
): Promise<CourseProject | null> {
  const { data, error } = await supabase
    .from("course_projects")
    .select("*")
    .eq("course_id", courseId)
    .maybeSingle();

  if (error) throw error;
  return data ? projectFrom(data as ProjectRow) : null;
}

/** The brief plus the student's attempts, for the project page. */
export async function getProjectState(
  supabase: SupabaseClient,
  userId: string,
  courseId: string,
): Promise<ProjectLookup> {
  let project: CourseProject | null;
  try {
    project = await getProject(supabase, courseId);
  } catch (error) {
    if (isMissingProjectSetup(error as { code?: string; message?: string })) {
      return { status: "setup" };
    }
    return { status: "error" };
  }

  if (!project) return { status: "empty" };

  const { data, error } = await supabase
    .from("project_submissions")
    .select("score,passed,summary,checks,errors,code,created_at")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    if (isMissingProjectSetup(error as { code?: string; message?: string })) {
      return { status: "setup" };
    }
    return { status: "error" };
  }

  const rows = (data ?? []) as ProjectSubmissionRow[];
  const latest = rows[0] ? reviewFrom(rows[0]) : null;
  const best = rows.reduce<ProjectReview | null>((bestRow, row) => {
    const review = reviewFrom(row);
    if (!bestRow) return review;
    if (review.passed && !bestRow.passed) return review;
    return review.score > bestRow.score && !bestRow.passed ? review : bestRow;
  }, null);
  const passing = rows.find((row) => row.passed);

  return {
    status: "ready",
    state: {
      project,
      best,
      latest,
      lastCode: rows[0]?.code ?? null,
      attempts: rows.length,
      passed: Boolean(passing),
      completedAt: passing?.created_at ?? null,
    },
  };
}

/**
 * Which of these courses already have a passed project. Used for the dashboard
 * badges, so a missing table just means "no completions yet".
 */
export async function listProjectCompletions(
  supabase: SupabaseClient,
  userId: string,
  courseIds: string[],
): Promise<Set<string>> {
  if (courseIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from("project_submissions")
    .select("course_id")
    .eq("user_id", userId)
    .eq("passed", true)
    .in("course_id", courseIds);

  if (error) return new Set();
  return new Set((data ?? []).map((row) => row.course_id as string));
}
