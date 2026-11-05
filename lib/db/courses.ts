import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Chapter,
  CodeExercise,
  Course,
  GradeMap,
  Lesson,
  Mcq,
  ShortAnswer,
} from "@/lib/types";

import { listProjectCompletions } from "./projects";
import type { CourseRow, ExerciseRow, LessonRow, ModuleRow, ProgressRow } from "./types";

export type CourseBundle = {
  course: Course;
  grades: GradeMap;
};

export type CourseSummary = CourseBundle & {
  progress: number;
  lessonCount: number;
  /** A final-project submission passed, so the course is finished. */
  projectPassed: boolean;
};

function byPosition<T extends { position: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.position - b.position);
}

function mcqFrom(row: ExerciseRow): Mcq {
  return {
    id: row.id,
    prompt: row.prompt,
    options: Array.isArray(row.options) ? row.options : [],
    answer: row.answer_index ?? 0,
    misconception: row.misconception,
    explanation: row.explanation,
    at: row.at_seconds,
  };
}

function shortAnswerFrom(row: ExerciseRow): ShortAnswer {
  return {
    id: row.id,
    prompt: row.prompt,
    placeholder: "Type your answer…",
    keywords: row.keywords ?? [],
    model: row.solution ?? "",
    misconception: row.misconception,
    explanation: row.explanation,
    at: row.at_seconds,
  };
}

function codeExerciseFrom(row: ExerciseRow): CodeExercise {
  return {
    id: row.id,
    prompt: row.prompt,
    language: row.language ?? "python",
    starterCode: row.starter_code ?? "",
    hint: row.hint,
    solution: row.solution ?? "",
    explanation: row.explanation,
    at: row.at_seconds,
  };
}

function gradesFrom(rows: ProgressRow[]): GradeMap {
  return rows.reduce<GradeMap>((map, row) => {
    map[row.lesson_id] = { score: row.score, correct: row.correct, total: row.total };
    return map;
  }, {});
}

function buildChapters(
  modules: ModuleRow[],
  lessons: LessonRow[],
  exercises: ExerciseRow[],
): Chapter[] {
  const exercisesByLesson = new Map<string, ExerciseRow[]>();
  for (const row of exercises) {
    const list = exercisesByLesson.get(row.lesson_id) ?? [];
    list.push(row);
    exercisesByLesson.set(row.lesson_id, list);
  }

  return byPosition(modules).map((module) => ({
    id: module.id,
    title: module.title,
    lessons: byPosition(lessons.filter((lesson) => lesson.module_id === module.id)).map(
      (lesson) => {
        const rows = byPosition(exercisesByLesson.get(lesson.id) ?? []);
        const questions = rows.filter((row) => row.kind === "mcq").map(mcqFrom);
        const shortRow = rows.find((row) => row.kind === "short");
        const codeExercises = rows.filter((row) => row.kind === "code").map(codeExerciseFrom);

        const mapped: Lesson = {
          id: lesson.id,
          title: lesson.title,
          start: lesson.start_seconds,
          end: lesson.end_seconds,
          summary: lesson.summary,
          keyTerms: Array.isArray(lesson.key_terms) ? lesson.key_terms : [],
          notes: Array.isArray(lesson.notes) ? lesson.notes : [],
          questions,
          shortAnswer: shortRow ? shortAnswerFrom(shortRow) : undefined,
          practiceBank: [],
          codeExercises,
        };
        return mapped;
      },
    ),
  }));
}

/** Full course with notes, exercises and the student's grades. */
export async function getCourseBundle(
  supabase: SupabaseClient,
  userId: string,
  slug: string,
): Promise<CourseBundle | null> {
  const { data: courseData, error } = await supabase
    .from("courses")
    .select("*")
    .eq("user_id", userId)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!courseData) return null;

  const courseRow = courseData as CourseRow;

  const [{ data: moduleData }, { data: lessonData }, { data: exerciseData }, { data: progressData }] =
    await Promise.all([
      supabase.from("modules").select("*").eq("course_id", courseRow.id),
      supabase.from("lessons").select("*").eq("course_id", courseRow.id),
      supabase.from("exercises").select("*").eq("course_id", courseRow.id),
      supabase
        .from("lesson_progress")
        .select("course_id,lesson_id,score,correct,total")
        .eq("user_id", userId)
        .eq("course_id", courseRow.id),
    ]);

  const course: Course = {
    id: courseRow.id,
    slug: courseRow.slug,
    title: courseRow.title,
    channel: courseRow.channel,
    videoId: courseRow.video_id,
    description: courseRow.description,
    level: courseRow.level,
    chapters: buildChapters(
      (moduleData ?? []) as ModuleRow[],
      (lessonData ?? []) as LessonRow[],
      (exerciseData ?? []) as ExerciseRow[],
    ),
    seeded: {},
    status: courseRow.status,
    stage: courseRow.stage,
    error: courseRow.error,
    language: courseRow.language,
    durationSeconds: courseRow.duration_seconds,
  };

  return { course, grades: gradesFrom((progressData ?? []) as ProgressRow[]) };
}

/**
 * Dashboard listing. Lessons are loaded without exercises because the cards
 * only need ids, titles and durations.
 */
export async function listCourseSummaries(
  supabase: SupabaseClient,
  userId: string,
): Promise<CourseSummary[]> {
  const { data: courseData, error } = await supabase
    .from("courses")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const courses = (courseData ?? []) as CourseRow[];
  if (courses.length === 0) return [];

  const courseIds = courses.map((course) => course.id);

  const [{ data: moduleData }, { data: lessonData }, { data: progressData }] = await Promise.all([
    supabase.from("modules").select("*").in("course_id", courseIds),
    supabase.from("lessons").select("*").in("course_id", courseIds),
    supabase
      .from("lesson_progress")
      .select("course_id,lesson_id,score,correct,total")
      .eq("user_id", userId)
      .in("course_id", courseIds),
  ]);

  const modules = (moduleData ?? []) as ModuleRow[];
  const lessons = (lessonData ?? []) as LessonRow[];
  const progress = (progressData ?? []) as ProgressRow[];
  const completed = await listProjectCompletions(supabase, userId, courseIds);

  return courses.map((courseRow) => {
    const chapters: Chapter[] = byPosition(
      modules.filter((module) => module.course_id === courseRow.id),
    ).map((module) => ({
      id: module.id,
      title: module.title,
      lessons: byPosition(
        lessons.filter((lesson) => lesson.module_id === module.id),
      ).map<Lesson>((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        start: lesson.start_seconds,
        end: lesson.end_seconds,
        summary: lesson.summary,
        keyTerms: [],
        notes: [],
        questions: [],
        practiceBank: [],
        codeExercises: [],
      })),
    }));

    const grades = gradesFrom(progress.filter((row) => row.course_id === courseRow.id));
    const lessonCount = chapters.reduce((total, chapter) => total + chapter.lessons.length, 0);
    const done = Object.keys(grades).length;

    const course: Course = {
      id: courseRow.id,
      slug: courseRow.slug,
      title: courseRow.title,
      channel: courseRow.channel,
      videoId: courseRow.video_id,
      description: courseRow.description,
      level: courseRow.level,
      chapters,
      seeded: {},
      status: courseRow.status,
      stage: courseRow.stage,
      error: courseRow.error,
      language: courseRow.language,
      durationSeconds: courseRow.duration_seconds,
    };

    return {
      course,
      grades,
      progress: lessonCount === 0 ? 0 : Math.round((done / lessonCount) * 100),
      lessonCount,
      projectPassed: completed.has(courseRow.id),
    };
  });
}

export async function countCourses(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("courses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return count ?? 0;
}
