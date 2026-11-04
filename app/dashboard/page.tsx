import { GraduationCap, Plus } from "lucide-react";
import { connection } from "next/server";
import Link from "next/link";

import { AuthNav } from "@/components/auth-nav";
import { CourseCard } from "@/components/course-card";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { listCourseSummaries } from "@/lib/db/courses";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Your dashboard",
};
export const instant = false;

export default async function DashboardPage() {
  await connection();
  const user = await requireUser("/dashboard");
  const supabase = await createSupabaseServerClient();

  // Starter courses are seeded once at signup, never here: re-seeding on an
  // empty dashboard would resurrect courses the user deliberately deleted.
  const entries = await listCourseSummaries(supabase, user.id);

  return (
    <>
      <SiteHeader right={<AuthNav user={user} />} />

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8 sm:px-8 lg:py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[1.5rem] font-semibold tracking-tight">Your courses</h1>
            <p className="mt-1 text-[0.85rem] text-muted-foreground">
              Pick up where you left off — every score is saved to your account.
            </p>
          </div>
          <Button className="h-10 gap-1.5" render={<Link href="/#paste" />} nativeButton={false}>
            <Plus className="size-4" />
            Add a course
          </Button>
        </div>

        {entries.length === 0 ? (
          <EmptyCourses />
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {entries.map((entry) => (
              <CourseCard
                key={entry.course.slug}
                course={entry.course}
                grades={entry.grades}
                progress={entry.progress}
                projectPassed={entry.projectPassed}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function EmptyCourses() {
  return (
    <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
        <GraduationCap className="size-6" />
      </span>
      <div>
        <h2 className="text-[1.05rem] font-semibold tracking-tight">No courses yet</h2>
        <p className="mx-auto mt-1 max-w-sm text-[0.85rem] leading-relaxed text-muted-foreground">
          Paste a YouTube lecture and the tutor will build sections, notes and coding exercises
          from its transcript.
        </p>
      </div>
      <Button className="h-10 gap-1.5" render={<Link href="/#paste" />} nativeButton={false}>
        <Plus className="size-4" />
        Add your first course
      </Button>
    </div>
  );
}
