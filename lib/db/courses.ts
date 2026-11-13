import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Chapter,
  CodeExercise,
  Course,
  GradeMap,
  Lesson,
  Mcq,
  QuizProgressMap,
  ShortAnswer,
} from "@/lib/types";

import { listProjectCompletions } from "./projects";
import type { CourseRow, ExerciseRow, LessonRow, ModuleRow, ProgressRow } from "./types";

export type CourseBundle = {
  course: Course;
  grades: GradeMap;
  /** Chapter-end exam progress (rigorous study mode). */
  quizzes: QuizProgressMap;
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

type QuizRow = {
  module_id: string;
  best_score: number;
  attempts: number;
  passed: boolean;
};

function quizzesFrom(rows: QuizRow[]): QuizProgressMap {
  return rows.reduce<QuizProgressMap>((map, row) => {
    map[row.module_id] = {
      bestScore: row.best_score,
      attempts: row.attempts,
      passed: row.passed,
    };
    return map;
  }, {});
}

/**
 * A chapter is written when its sections tile the module's slice of video.
 * A build writes them in order, so a hole anywhere means the chapter is
 * still being generated (or never finished).
 */
function tilesRange(
  module: { start_seconds: number; end_seconds: number },
  lessons: { start_seconds: number; end_seconds: number }[],
): boolean {
  if (lessons.length === 0) return false;
  let cursor = module.start_seconds;
  for (const lesson of lessons) {
    if (lesson.start_seconds !== cursor) return false;
    cursor = lesson.end_seconds;
  }
  return cursor === module.end_seconds;
}

type VideoInfo = { videoId: string; done: boolean };

function buildChapters(
  modules: ModuleRow[],
  lessons: LessonRow[],
  exercises: ExerciseRow[],
  /** course_videos rows by id; empty on single-video courses. */
  videos: Map<string, VideoInfo>,
  /** The course's own video id — fallback for every section. */
  courseVideoId: string,
): Chapter[] {
  const exercisesByLesson = new Map<string, ExerciseRow[]>();
  for (const row of exercises) {
    const list = exercisesByLesson.get(row.lesson_id) ?? [];
    list.push(row);
    exercisesByLesson.set(row.lesson_id, list);
  }

  return byPosition(modules).map((module) => {
    const moduleLessons = byPosition(
      lessons.filter((lesson) => lesson.module_id === module.id),
    );

    return {
      id: module.id,
      title: module.title,
      // Playlist chapters belong to a video: written once that video finished
      // building (a merged chapter can hold sections of two videos, so tiling
      // would lie). Single-video chapters keep the tiling check.
      written: module.course_video_id
        ? videos.get(module.course_video_id)?.done ?? false
        : tilesRange(module, moduleLessons),
      lessons: moduleLessons.map((lesson) => {
        const rows = byPosition(exercisesByLesson.get(lesson.id) ?? []);
        const questions = rows.filter((row) => row.kind === "mcq").map(mcqFrom);
        const shortRow = rows.find((row) => row.kind === "short");
        const codeExercises = rows.filter((row) => row.kind === "code").map(codeExerciseFrom);

        const mapped: Lesson = {
          id: lesson.id,
          title: lesson.title,
          start: lesson.start_seconds,
          end: lesson.end_seconds,
          videoId:
            (lesson.course_video_id ? videos.get(lesson.course_video_id)?.videoId : undefined) ??
            courseVideoId,
          summary: lesson.summary,
          keyTerms: Array.isArray(lesson.key_terms) ? lesson.key_terms : [],
          notes: Array.isArray(lesson.notes) ? lesson.notes : [],
          questions,
          shortAnswer: shortRow ? shortAnswerFrom(shortRow) : undefined,
          practiceBank: [],
          codeExercises,
        };
        return mapped;
      }),
    };
  });
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

  const [
    { data: moduleData },
    { data: lessonData },
    { data: exerciseData },
    { data: progressData },
    { data: quizData, error: quizError },
    { data: videoData },
  ] = await Promise.all([
    supabase.from("modules").select("*").eq("course_id", courseRow.id),
    supabase.from("lessons").select("*").eq("course_id", courseRow.id),
    supabase.from("exercises").select("*").eq("course_id", courseRow.id),
    supabase
      .from("lesson_progress")
      .select("course_id,lesson_id,score,correct,total")
      .eq("user_id", userId)
      .eq("course_id", courseRow.id),
    supabase
      .from("chapter_quizzes")
      .select("module_id,best_score,attempts,passed")
      .eq("user_id", userId)
      .eq("course_id", courseRow.id),
    supabase.from("course_videos").select("id,video_id,status").eq("course_id", courseRow.id),
  ]);

  // A database that has not run the latest schema.sql has no chapter_quizzes
  // table; the course then simply behaves as if no exam had ever been taken.
  if (quizError && !/does not exist|schema cache/i.test(quizError.message)) {
    console.warn("[courses] could not load chapter quizzes", quizError.message);
  }

  const videos = new Map<string, VideoInfo>(
    ((videoData ?? []) as { id: string; video_id: string; status: string }[]).map((row) => [
      row.id,
      { videoId: row.video_id, done: row.status === "done" },
    ]),
  );

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
      videos,
      courseRow.video_id,
    ),
    seeded: {},
    status: courseRow.status,
    stage: courseRow.stage,
    error: courseRow.error,
    language: courseRow.language,
    durationSeconds: courseRow.duration_seconds,
    rigorous: Boolean(courseRow.rigorous),
  };

  return {
    course,
    grades: gradesFrom((progressData ?? []) as ProgressRow[]),
    quizzes: quizError ? {} : quizzesFrom((quizData ?? []) as QuizRow[]),
  };
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

  const [{ data: moduleData }, { data: lessonData }, { data: progressData }, { data: videoData }] =
    await Promise.all([
      supabase.from("modules").select("*").in("course_id", courseIds),
      supabase.from("lessons").select("*").in("course_id", courseIds),
      supabase
        .from("lesson_progress")
        .select("course_id,lesson_id,score,correct,total")
        .eq("user_id", userId)
        .in("course_id", courseIds),
      supabase.from("course_videos").select("id,video_id").in("course_id", courseIds),
    ]);

  const modules = (moduleData ?? []) as ModuleRow[];
  const lessons = (lessonData ?? []) as LessonRow[];
  const progress = (progressData ?? []) as ProgressRow[];
  const videoIds = new Map(
    ((videoData ?? []) as { id: string; video_id: string }[]).map((row) => [row.id, row.video_id]),
  );
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
        videoId:
          (lesson.course_video_id ? videoIds.get(lesson.course_video_id) : undefined) ??
          courseRow.video_id,
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
      // The dashboard never shows exams or locks, so no quiz rows are loaded.
      quizzes: {},
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
