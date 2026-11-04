import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { countCourses } from "@/lib/db/courses";
import { DEMO_COURSES } from "@/lib/demo-data";

const inFlight = new Map<string, Promise<void>>();

function demoLanguage(slug: string): string {
  if (slug.includes("javascript")) return "javascript";
  if (slug.includes("sql")) return "sql";
  return "python";
}

/**
 * New accounts get the three authored demo courses as real database rows, so
 * the first visit already has something to study and every score they earn is
 * stored like any other course. Called once from signup — never from the
 * dashboard, which would resurrect courses the user deleted. Concurrent
 * renders await the same seed.
 */
export async function ensureStarterCourses(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const running = inFlight.get(userId);
  if (running) return running;

  const job = seedStarterCourses(supabase, userId).finally(() => {
    inFlight.delete(userId);
  });
  inFlight.set(userId, job);
  return job;
}

async function seedStarterCourses(supabase: SupabaseClient, userId: string): Promise<void> {
  const existing = await countCourses(supabase, userId);
  if (existing > 0) return;

  for (const demo of DEMO_COURSES) {
    const { data: courseRow, error: courseError } = await supabase
      .from("courses")
      .insert({
        user_id: userId,
        slug: demo.slug,
        title: demo.title,
        channel: demo.channel,
        video_id: demo.videoId,
        source_url: `https://www.youtube.com/watch?v=${demo.videoId}`,
        description: demo.description,
        level: demo.level,
        language: demoLanguage(demo.slug),
        duration_seconds: demo.chapters
          .flatMap((chapter) => chapter.lessons)
          .reduce((total, lesson) => Math.max(total, lesson.end), 0),
        status: "ready",
        stage: "Ready",
      })
      .select("id")
      .single();

    if (courseError || !courseRow) {
      // A concurrent request already seeded this slug; move on.
      if (courseError?.code === "23505") continue;
      console.error("[seed] could not create demo course", courseError?.message);
      continue;
    }

    const courseId = courseRow.id as string;
    let lessonPosition = 0;

    for (const [moduleIndex, chapter] of demo.chapters.entries()) {
      const { data: moduleRow, error: moduleError } = await supabase
        .from("modules")
        .insert({
          course_id: courseId,
          position: moduleIndex,
          title: chapter.title,
          summary: chapter.lessons[0]?.summary ?? "",
          start_seconds: chapter.lessons[0]?.start ?? 0,
          end_seconds: chapter.lessons.at(-1)?.end ?? 0,
        })
        .select("id")
        .single();

      if (moduleError || !moduleRow) {
        console.error("[seed] could not create module", moduleError?.message);
        continue;
      }

      for (const lesson of chapter.lessons) {
        const { data: lessonRow, error: lessonError } = await supabase
          .from("lessons")
          .insert({
            course_id: courseId,
            module_id: moduleRow.id as string,
            position: lessonPosition++,
            title: lesson.title,
            summary: lesson.summary,
            start_seconds: lesson.start,
            end_seconds: lesson.end,
            key_terms: lesson.keyTerms,
            notes: lesson.notes,
          })
          .select("id")
          .single();

        if (lessonError || !lessonRow) {
          console.error("[seed] could not create lesson", lessonError?.message);
          continue;
        }

        const rows: Record<string, unknown>[] = [];
        let position = 0;

        for (const question of lesson.questions) {
          rows.push({
            course_id: courseId,
            lesson_id: lessonRow.id,
            position: position++,
            kind: "mcq",
            prompt: question.prompt,
            options: question.options,
            answer_index: question.answer,
            keywords: [],
            starter_code: null,
            hint: "",
            language: null,
            explanation: question.explanation,
            misconception: question.misconception,
            at_seconds: question.at,
            points: 1,
          });
        }

        if (lesson.shortAnswer) {
          rows.push({
            course_id: courseId,
            lesson_id: lessonRow.id,
            position: position++,
            kind: "short",
            prompt: lesson.shortAnswer.prompt,
            options: [],
            answer_index: null,
            keywords: lesson.shortAnswer.keywords,
            starter_code: null,
            hint: "",
            language: null,
            solution: lesson.shortAnswer.model,
            explanation: lesson.shortAnswer.explanation,
            misconception: lesson.shortAnswer.misconception,
            at_seconds: lesson.shortAnswer.at,
            points: 1,
          });
        }

        if (rows.length > 0) {
          const { error: exerciseError } = await supabase.from("exercises").insert(rows);
          if (exerciseError) {
            console.error("[seed] could not create exercises", exerciseError.message);
          }
        }
      }
    }
  }
}
