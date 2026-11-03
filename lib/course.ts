import type { Chapter, Course, GradeMap, Lesson } from "@/lib/types";

export function courseLessons(course: Course): Lesson[] {
  return course.chapters.flatMap((chapter) => chapter.lessons);
}

export function courseLength(course: Course): number {
  return courseLessons(course).reduce(
    (total, lesson) => total + (lesson.end - lesson.start),
    0,
  );
}

export function chapterLength(chapter: Chapter): number {
  return chapter.lessons.reduce(
    (total, lesson) => total + (lesson.end - lesson.start),
    0,
  );
}

export function chapterOfLesson(course: Course, lessonId: string): Chapter | undefined {
  return course.chapters.find((chapter) =>
    chapter.lessons.some((lesson) => lesson.id === lessonId),
  );
}

export function adjacentLesson(
  course: Course,
  lessonId: string,
  direction: -1 | 1,
): Lesson | undefined {
  const lessons = courseLessons(course);
  const index = lessons.findIndex((lesson) => lesson.id === lessonId);
  if (index === -1) return undefined;
  return lessons[index + direction];
}

export function courseProgress(course: Course, grades: GradeMap): number {
  const lessons = courseLessons(course);
  if (lessons.length === 0) return 0;
  const done = lessons.filter((lesson) => grades[lesson.id] !== undefined).length;
  return Math.round((done / lessons.length) * 100);
}

export function averageScore(grades: GradeMap): number {
  const scores = Object.values(grades).map((grade) => grade.score);
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

/** Seeds the grade map from the demo course's saved progress. */
export function seedGrades(course: Course): GradeMap {
  const lessons = courseLessons(course);
  return Object.entries(course.seeded).reduce<GradeMap>((grades, [lessonId, score]) => {
    const lesson = lessons.find((item) => item.id === lessonId);
    if (!lesson) return grades;
    const total = lesson.questions.length + 1;
    grades[lessonId] = {
      score,
      total,
      correct: Math.round((score / 100) * total),
    };
    return grades;
  }, {});
}
