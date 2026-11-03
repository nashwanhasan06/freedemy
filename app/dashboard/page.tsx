import { GraduationCap, Plus } from "lucide-react";
import Link from "next/link";

import { CourseCard } from "@/components/course-card";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { courseProgress, seedGrades } from "@/lib/course";
import { DEMO_COURSES } from "@/lib/demo-data";

export const metadata = {
  title: "Your dashboard",
};

export default function DashboardPage() {
  const entries = DEMO_COURSES.map((course) => {
    const grades = seedGrades(course);
    return { course, grades, progress: courseProgress(course, grades) };
  });

  return (
    <>
      <SiteHeader />

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8 sm:px-8 lg:py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[1.5rem] font-semibold tracking-tight">Your courses</h1>
            <p className="mt-1 text-[0.85rem] text-muted-foreground">
              Pick up where you left off.
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
          <>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {entries.map((entry) => (
                <CourseCard
                  key={entry.course.slug}
                  course={entry.course}
                  grades={entry.grades}
                  progress={entry.progress}
                />
              ))}
            </div>
          </>
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
          Paste a YouTube lecture and we&apos;ll turn it into sections, notes and assignments in
          about a minute.
        </p>
      </div>
      <Button className="h-10 gap-1.5" render={<Link href="/#paste" />} nativeButton={false}>
        <Plus className="size-4" />
        Add your first course
      </Button>
    </div>
  );
}
