import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { CourseWorkspace } from "@/components/course-workspace";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { courseLessons } from "@/lib/course";
import { getCourseBundle } from "@/lib/db/courses";
import { getProjectState } from "@/lib/db/projects";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The course page resolves its slug from the session's database rows, so it is
 * allowed to block on the request instead of prerendering a shell.
 */
export const instant = false;

export async function generateMetadata({
  params,
}: PageProps<"/course/[slug]">): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) return { title: "Course" };

  const supabase = await createSupabaseServerClient();
  const bundle = await getCourseBundle(supabase, user.id, slug);

  return { title: bundle?.course.title ?? "Course not found" };
}

export default async function CoursePage({ params }: PageProps<"/course/[slug]">) {
  await connection();
  const { slug } = await params;
  const user = await requireUser(`/course/${slug}`);
  const supabase = await createSupabaseServerClient();

  const bundle = await getCourseBundle(supabase, user.id, slug);

  if (!bundle) notFound();

  // Sections are saved one at a time, so a half-built course is already
  // readable. Only send students back to the progress screen while there is
  // nothing to read yet (or nothing was ever saved).
  if (bundle.course.status !== "ready" && courseLessons(bundle.course).length === 0) {
    redirect(`/generating?course=${bundle.course.id ?? ""}`);
  }

  const lookup = bundle.course.id
    ? await getProjectState(supabase, user.id, bundle.course.id)
    : ({ status: "empty" } as const);

  return (
    <CourseWorkspace
      course={bundle.course}
      initialGrades={bundle.grades}
      project={{
        exists: lookup.status === "ready",
        passed: lookup.status === "ready" ? lookup.state.passed : false,
      }}
    />
  );
}
