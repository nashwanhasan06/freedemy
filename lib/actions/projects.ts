"use server";

import { revalidatePath } from "next/cache";

import type { ProjectCreateState, ProjectSubmitState } from "@/lib/actions/types";
import { nimJson } from "@/lib/ai/nim";
import {
  projectReviewSystem,
  projectReviewUser,
  projectSystem,
  projectUser,
} from "@/lib/ai/prompts";
import { requireUser } from "@/lib/auth";
import { getProject, isMissingProjectSetup, type CourseProject } from "@/lib/db/projects";
import type { LessonRow, ModuleRow, ProjectRow } from "@/lib/db/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ExerciseError } from "@/lib/types";

const SETUP_HINT =
  "The final-project tables are missing. Run the course_projects block in supabase/schema.sql in the Supabase SQL editor, then reload this page.";

const MAX_CODE_LENGTH = 20_000;
const MAX_ATTEMPTS = 25;
const PASS_SCORE = 70;

type ModelProject = {
  title: string;
  brief: string;
  requirements: string[];
  starterCode: string;
  language: string;
};

type ModelReview = {
  passed: boolean;
  score: number;
  summary: string;
  checks: { requirement: string; met: boolean; note: string }[];
  errors: ExerciseError[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0)
    .slice(0, 8);
}

function validateProject(language: string): (value: unknown) => ModelProject | null {
  return (value: unknown) => {
    const root = value as Partial<ModelProject> | null;
    const requirements = lines(root?.requirements);
    const title = String(root?.title ?? "").trim().slice(0, 120);
    const brief = String(root?.brief ?? "").trim();

    if (!title || brief.length < 60 || requirements.length < 3) return null;

    return {
      title,
      brief: brief.slice(0, 4_000),
      requirements,
      starterCode: String(root?.starterCode ?? "").slice(0, 4_000),
      language,
    };
  };
}

function validateReview(requirements: string[]): (value: unknown) => ModelReview | null {
  return (value: unknown) => {
    const root = value as Partial<ModelReview> | null;
    if (!root || typeof root.passed !== "boolean") return null;

    const rawChecks = Array.isArray(root.checks)
      ? (root.checks as Record<string, unknown>[])
      : [];

    // One row per requirement the student was given, whatever the model returned,
    // so the checklist on screen always matches the brief.
    const checks = requirements.map((requirement, index) => {
      const row =
        rawChecks.find(
          (candidate) => String(candidate?.requirement ?? "").trim() === requirement,
        ) ?? rawChecks[index];

      return {
        requirement,
        met: Boolean(row?.met),
        note: String(row?.note ?? "").slice(0, 400),
      };
    });

    const errors: ExerciseError[] = Array.isArray(root.errors)
      ? (root.errors as Record<string, unknown>[])
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

    return {
      passed: root.passed,
      score: Number.isFinite(Number(root.score)) ? Math.round(Number(root.score)) : 0,
      summary: String(root.summary ?? "").slice(0, 1_200),
      checks,
      errors,
    };
  };
}

/**
 * Used when the model is unreachable or keeps returning unusable JSON: the
 * student still gets a brief tied to this course's own sections instead of a
 * dead end, and can be reviewed normally.
 */
function fallbackProject(params: {
  courseTitle: string;
  language: string;
  modules: ModuleRow[];
  lessons: LessonRow[];
}): ModelProject {
  const skills = params.lessons
    .slice(0, 6)
    .map((lesson) => lesson.title.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return {
    title: `${params.courseTitle}: final project`,
    brief: [
      `Write one ${params.language} program that pulls the whole course together.`,
      "",
      `Pick a small dataset of your own (a CSV, a list of records, a public API response) and build a tool that uses the ideas from these sections: ${skills.join(", ") || "the sections you have finished"}.`,
      "",
      "Your program should load the data, do real work with it through the skills above, handle at least one bad input gracefully, and print a short summary a non-programmer could read.",
      "",
      "It will be reviewed against the checklist below, not against a reference solution.",
    ].join("\n"),
    requirements: [
      "Load input data from a file, an argument or a fetch — not hard-coded values.",
      "Use the course's core ideas from at least three of its sections.",
      `Handle one bad input (missing file, empty value, wrong type) without crashing.`,
      "Print a readable summary of what the program found.",
    ],
    starterCode: [
      `# ${params.courseTitle} — final project`,
      "# TODO: load the data",
      "# TODO: do the work this course taught",
      "# TODO: handle a bad input",
      "# TODO: print a readable summary",
      "",
      "def main() -> None:",
      "    ...",
      "",
      'if __name__ == "__main__":',
      "    main()",
    ].join("\n"),
    language: params.language,
  };
}

export async function createProjectAction(courseId: string): Promise<ProjectCreateState> {
  const user = await requireUser();

  try {
    if (typeof courseId !== "string" || !courseId) {
      return { ok: false, error: "Missing course." };
    }

    const supabase = await createSupabaseServerClient();

    const { data: courseData, error: courseError } = await supabase
      .from("courses")
      .select("id,slug,title,language,level,status")
      .eq("id", courseId)
      .maybeSingle();

    if (courseError) return { ok: false, error: courseError.message };
    if (!courseData) return { ok: false, error: "That course does not exist." };

    const course = courseData as {
      id: string;
      slug: string;
      title: string;
      language: string;
      level: string;
    };

    try {
      const existing = await getProject(supabase, course.id);
      if (existing) return { ok: true, project: existing };
    } catch (error) {
      if (isMissingProjectSetup(error as { code?: string; message?: string })) {
        return { ok: false, error: SETUP_HINT };
      }
      throw error;
    }

    const [{ data: moduleData }, { data: lessonData }] = await Promise.all([
      supabase.from("modules").select("*").eq("course_id", course.id).order("position"),
      supabase.from("lessons").select("*").eq("course_id", course.id).order("position"),
    ]);

    const modules = (moduleData ?? []) as ModuleRow[];
    const lessons = (lessonData ?? []) as LessonRow[];

    if (lessons.length === 0) {
      return { ok: false, error: "This course has no sections yet — build a few first." };
    }

    const language = course.language || "python";

    let model: ModelProject;
    try {
      model = await nimJson<ModelProject>({
        system: projectSystem(),
        user: projectUser({
          courseTitle: course.title,
          language,
          level: course.level,
          modules: modules.map((module) => ({
            title: module.title,
            summary: module.summary,
            lessons: lessons
              .filter((lesson) => lesson.module_id === module.id)
              .map((lesson) => ({
                title: lesson.title,
                summary: lesson.summary,
                terms: Array.isArray(lesson.key_terms)
                  ? lesson.key_terms.map((term) => term.term).slice(0, 6)
                  : [],
              })),
          })),
        }),
        maxTokens: 1_800,
        temperature: 0.3,
        priority: "interactive",
        meta: { kind: "project", userId: user.id, courseId: course.id },
        validate: validateProject(language),
      });
    } catch (error) {
      console.error("[projects] falling back to a templated brief", error);
      model = fallbackProject({
        courseTitle: course.title,
        language,
        modules,
        lessons,
      });
    }

    const { data: created, error: insertError } = await supabase
      .from("course_projects")
      .insert({
        course_id: course.id,
        title: model.title,
        brief: model.brief,
        requirements: model.requirements,
        starter_code: model.starterCode,
        language: model.language || language,
      })
      .select("*")
      .single();

    if (insertError) {
      if (isMissingProjectSetup(insertError)) return { ok: false, error: SETUP_HINT };
      // Another tab won the race: use whatever it stored.
      if (insertError.code === "23505") {
        const existing = await getProject(supabase, course.id);
        if (existing) return { ok: true, project: existing };
      }
      return { ok: false, error: insertError.message };
    }

    const row = created as ProjectRow;
    const project: CourseProject = {
      id: row.id,
      courseId: row.course_id,
      title: row.title,
      brief: row.brief,
      requirements: Array.isArray(row.requirements) ? (row.requirements as string[]) : [],
      starterCode: row.starter_code,
      language: row.language,
    };

    revalidatePath(`/course/${course.slug}/project`);
    return { ok: true, project };
  } catch (error) {
    console.error("[projects] could not build the project", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message.slice(0, 400)
          : "Could not build that project. Try again.",
    };
  }
}

export async function submitProjectAction(input: {
  courseId: string;
  code: string;
}): Promise<ProjectSubmitState> {
  const user = await requireUser();

  try {
    const courseId = typeof input?.courseId === "string" ? input.courseId : "";
    const code = typeof input?.code === "string" ? input.code : "";

    if (!courseId) return { ok: false, error: "Missing course." };
    if (code.trim().length < 20) {
      return { ok: false, error: "Write something first — that is shorter than one line." };
    }
    if (code.length > MAX_CODE_LENGTH) {
      return {
        ok: false,
        error: `That submission is too long (${code.length} characters). Keep it under ${MAX_CODE_LENGTH}.`,
      };
    }

    const supabase = await createSupabaseServerClient();

    const { data: courseData, error: courseError } = await supabase
      .from("courses")
      .select("id,slug,title,language")
      .eq("id", courseId)
      .maybeSingle();

    if (courseError) return { ok: false, error: courseError.message };
    if (!courseData) return { ok: false, error: "That course does not exist." };

    const course = courseData as { id: string; slug: string; title: string; language: string };

    let project: CourseProject | null;
    try {
      project = await getProject(supabase, course.id);
    } catch (error) {
      if (isMissingProjectSetup(error as { code?: string; message?: string })) {
        return { ok: false, error: SETUP_HINT };
      }
      throw error;
    }

    if (!project) {
      return { ok: false, error: "Build the project brief first, then submit your code." };
    }

    const { count } = await supabase
      .from("project_submissions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("course_id", course.id);

    if ((count ?? 0) >= MAX_ATTEMPTS) {
      return {
        ok: false,
        error: `That is ${MAX_ATTEMPTS} reviews on this project. Ask the tutor in a section for help before trying again.`,
      };
    }

    const review = await nimJson<ModelReview>({
      system: projectReviewSystem(),
      user: projectReviewUser({
        courseTitle: course.title,
        language: project.language,
        title: project.title,
        brief: project.brief,
        requirements: project.requirements,
        code,
      }),
      maxTokens: 1_800,
      temperature: 0,
      priority: "interactive",
      meta: { kind: "project:review", userId: user.id, courseId: course.id },
      validate: validateReview(project.requirements),
      repairHint: "Keep one checks row per requirement, in the same order.",
    });

    const score = clamp(review.score, 0, 100);
    const passed = review.passed && score >= PASS_SCORE;

    const { error: insertError } = await supabase.from("project_submissions").insert({
      user_id: user.id,
      course_id: course.id,
      project_id: project.id,
      code,
      score,
      passed,
      summary: review.summary,
      checks: review.checks,
      errors: review.errors,
    });

    if (insertError) {
      if (isMissingProjectSetup(insertError)) return { ok: false, error: SETUP_HINT };
      console.error("[projects] could not save the submission", insertError.message);
      return { ok: false, error: "The review ran, but saving it failed. Try again." };
    }

    revalidatePath(`/course/${course.slug}/project`);
    revalidatePath(`/course/${course.slug}`);
    revalidatePath("/dashboard");

    return {
      ok: true,
      review: {
        score,
        passed,
        summary: review.summary,
        checks: review.checks,
        errors: review.errors,
        createdAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("[projects] review failed", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message.slice(0, 400)
          : "Could not review that submission.",
    };
  }
}
