import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { Brand } from "@/components/brand";
import { ProjectWorkspace } from "@/components/project/project-workspace";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireUser } from "@/lib/auth";
import { courseLessons } from "@/lib/course";
import { getCourseBundle } from "@/lib/db/courses";
import { getProjectState } from "@/lib/db/projects";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Final project" };
export const instant = false;

export default async function ProjectPage({ params }: PageProps<"/course/[slug]/project">) {
  await connection();
  const { slug } = await params;
  const user = await requireUser(`/course/${slug}/project`);
  const supabase = await createSupabaseServerClient();

  const bundle = await getCourseBundle(supabase, user.id, slug);
  if (!bundle || !bundle.course.id) notFound();

  // A capstone is only meaningful once there is material to build it from.
  if (bundle.course.status !== "ready" && courseLessons(bundle.course).length === 0) {
    redirect(`/generating?course=${bundle.course.id}`);
  }

  const lookup = await getProjectState(supabase, user.id, bundle.course.id);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1100px] items-center justify-between gap-4 px-4 sm:px-8">
          <Brand className="min-w-0 shrink-0" />
          <div className="flex items-center gap-2">
            <SignOutButton className="h-8 px-2.5 text-[0.8rem]" />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-6 sm:px-8">
        <ProjectWorkspace
          courseId={bundle.course.id}
          courseSlug={slug}
          courseTitle={bundle.course.title}
          lookup={lookup}
        />
      </main>
    </div>
  );
}
