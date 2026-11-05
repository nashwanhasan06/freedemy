import { ArrowRight, Clock3, Trophy, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { CourseCover } from "@/components/course-cover";
import { CourseDeleteButton } from "@/components/course-delete-button";
import { Button } from "@/components/ui/button";
import { courseLessons } from "@/lib/course";
import { formatLength } from "@/lib/format";
import type { Course, GradeMap } from "@/lib/types";

export function CourseCard({
  course,
  grades,
  progress,
  projectPassed = false,
}: {
  course: Course;
  grades: GradeMap;
  progress: number;
  projectPassed?: boolean;
}) {
  const lessons = courseLessons(course);
  const done = lessons.filter((lesson) => grades[lesson.id]).length;
  const nextLesson = lessons.find((lesson) => !grades[lesson.id]) ?? lessons[0];
  const minutes = lessons.reduce((sum, lesson) => sum + (lesson.end - lesson.start), 0);
  const started = done > 0;

  const processing = Boolean(course.status && course.status !== "ready");
  const failed = course.status === "failed";

  return (
    <article className="gradient-border-card group flex flex-col overflow-hidden rounded-2xl bg-card shadow-[0_1px_3px_rgba(16,24,40,0.06)] ring-1 ring-border/80 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_36px_-12px_rgba(123,80,253,0.28)]">
      <div className="relative aspect-video overflow-hidden">
        <CourseCover course={course} className="absolute inset-0" />
        {projectPassed && (
          <span className="absolute top-2.5 left-2.5 flex items-center gap-1 rounded-md border border-success/50 bg-card/95 px-2 py-0.5 text-[0.65rem] font-semibold text-success-ink shadow-sm backdrop-blur">
            <Trophy className="size-3" />
            Project complete
          </span>
        )}
        {processing ? (
          <span className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-md border border-warning/40 bg-card/95 px-2 py-0.5 text-[0.65rem] font-semibold text-warning-ink shadow-sm backdrop-blur">
            {failed ? <TriangleAlert className="size-3" /> : <Clock3 className="size-3" />}
            {failed ? "Failed" : "Building"}
          </span>
        ) : progress > 0 ? (
          <span className="absolute top-2.5 right-2.5 rounded-md border border-primary/20 bg-card/95 px-2 py-0.5 text-[0.65rem] font-semibold tabular-nums text-foreground shadow-sm backdrop-blur">
            {progress}%
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-6">
        <div>
          <h2 className="line-clamp-2 text-[0.95rem] leading-snug font-semibold">
            {course.title}
          </h2>
          <p className="mt-1.5 text-[0.72rem] text-muted-foreground">
            {processing
              ? (course.stage ?? "Queued")
              : `${course.channel} · ${formatLength(minutes)} · ${course.level}`}
          </p>
        </div>

        <div className="mt-auto flex flex-col gap-3">
          <span className="text-[0.72rem] text-muted-foreground tabular-nums">
            {processing ? `${course.stage ?? "Starting…"}` : `${done} of ${lessons.length} sections`}
          </span>

          <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-gradient-to-r from-[#2753ff] via-[#6366f1] to-[#7c3aed] transition-all duration-500 shadow-[0_0_12px_rgba(39,83,255,0.5)]"
              style={{ width: `${processing ? 8 : progress}%` }}
            />
          </span>

          {processing && !failed && lessons.length > 0 ? (
            // Some sections are already saved, so the course is readable even
            // though the build is still running.
            <Button
              className="h-10 w-full justify-between px-3 text-[0.8rem]"
              render={<Link href={`/course/${course.slug}`} />}
              nativeButton={false}
            >
              Read {lessons.length} sections
              <ArrowRight className="size-3.5" />
            </Button>
          ) : processing ? (
            <Button
              variant="outlinePrimary"
              className="h-10 w-full justify-between px-3 text-[0.8rem]"
              render={<Link href={`/generating?course=${course.id ?? ""}`} />}
              nativeButton={false}
            >
              {failed ? "Open and retry" : "View progress"}
              <ArrowRight className="size-3.5" />
            </Button>
          ) : (
            <Button
              variant={started ? "default" : "outlinePrimary"}
              className="h-10 w-full justify-between px-3 text-[0.8rem]"
              render={<Link href={`/course/${course.slug}#lesson-${nextLesson?.id ?? ""}`} />}
              nativeButton={false}
            >
              {started ? "Continue" : "Start course"}
              <ArrowRight className="size-3.5 transition-transform group-hover/button:translate-x-0.5" />
            </Button>
          )}

          <CourseDeleteButton courseId={course.id} title={course.title} />
        </div>
      </div>
    </article>
  );
}
