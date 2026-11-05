import { ArrowUpRight, Layers } from "lucide-react";
import Link from "next/link";

import { CourseCover } from "@/components/course-cover";
import { CourseCard } from "@/components/course-card";
import { courseLessons } from "@/lib/course";
import { formatLength } from "@/lib/format";
import type { CourseSummary } from "@/lib/db/courses";
import type { Course } from "@/lib/types";

export function DemoCourses({
  courses,
  userCourses = [],
  signedIn = false,
}: {
  courses: Course[];
  userCourses?: CourseSummary[];
  signedIn?: boolean;
}) {
  const hasUserCourses = signedIn && userCourses.length > 0;

  // Signed-in users with no courses yet: hide the demo section entirely
  if (signedIn && !hasUserCourses) return null;

  if (hasUserCourses) {
    return (
      <section className="mx-auto w-full max-w-[1400px] px-4 pb-16 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[1.05rem] font-semibold tracking-tight">Recent courses</h2>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-[0.8rem] font-medium text-primary hover:underline"
          >
            All courses
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {userCourses.slice(0, 3).map((entry) => (
            <CourseCard
              key={entry.course.slug}
              course={entry.course}
              grades={entry.grades}
              progress={entry.progress}
              projectPassed={entry.projectPassed}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-[1400px] px-4 pb-16 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[1.05rem] font-semibold tracking-tight">
            Or open a finished course
          </h2>
          <p className="mt-1 text-[0.82rem] text-muted-foreground">
            Ready-made coding and CS courses — no setup, no waiting.
          </p>
        </div>
        {signedIn && (
          <Link
            href="/dashboard"
            className="hidden items-center gap-1 text-[0.8rem] font-medium text-primary hover:underline sm:inline-flex"
          >
            Your dashboard
            <ArrowUpRight className="size-3.5" />
          </Link>
        )}
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((course) => {
          const lessons = courseLessons(course);
          const minutes = lessons.reduce((sum, lesson) => sum + (lesson.end - lesson.start), 0);

          return (
            <Link
              key={course.slug}
              href={`/course/${course.slug}`}
              className="gradient-border-card group overflow-hidden rounded-2xl bg-card shadow-[0_1px_3px_rgba(16,24,40,0.06)] ring-1 ring-border/80 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_36px_-12px_rgba(123,80,253,0.28)]"
            >
              <div className="relative aspect-video overflow-hidden">
                <CourseCover course={course} className="absolute inset-0" />
                <span className="absolute bottom-2.5 left-3 flex items-center gap-1 rounded-md bg-black/25 px-1.5 py-0.5 text-[0.65rem] font-medium text-white backdrop-blur-sm">
                  <Layers className="size-3" />
                  {course.chapters.length} chapters · {lessons.length} sections
                </span>
              </div>

              <div className="flex flex-col gap-1 p-6">
                <p className="line-clamp-1 text-[0.9rem] font-semibold">{course.title}</p>
                <p className="text-[0.72rem] text-muted-foreground">
                  {course.channel} · {formatLength(minutes)} · {course.level}
                </p>
                <p className="mt-1.5 line-clamp-2 text-[0.78rem] leading-relaxed text-muted-foreground">
                  {course.description}
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-[0.78rem] font-medium text-primary">
                  Open course
                  <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
