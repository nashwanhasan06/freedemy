"use client";

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { retryCourseAction } from "@/lib/actions/courses";
import { cn } from "@/lib/utils";

type CourseStatus = {
  id: string;
  slug: string;
  title: string;
  status: "queued" | "fetching" | "outlining" | "writing" | "ready" | "failed";
  stage: string;
  error: string | null;
  lessons: number;
  modules: number;
};

const STEPS = [
  {
    id: "transcript",
    label: "Fetching the transcript",
    detail: "Captions, description and video details",
    statuses: ["queued", "fetching"],
  },
  {
    id: "sections",
    label: "Finding the structure",
    detail: "Timestamped topics, then modules and lessons",
    statuses: ["outlining"],
  },
  {
    id: "writing",
    label: "Writing notes and exercises",
    detail: "Notes, quizzes and coding tasks per section",
    statuses: ["writing"],
  },
];

function stepIndex(status: CourseStatus["status"]): number {
  if (status === "queued" || status === "fetching") return 0;
  if (status === "outlining") return 1;
  if (status === "writing") return 2;
  return 3;
}

function progressFor(course: CourseStatus | null): number {
  if (!course) return 4;
  if (course.status === "ready") return 100;

  const written = /Writing\s+(\d+)\s+of\s+(\d+)/i.exec(course.stage);
  if (written) {
    const done = Number(written[1]);
    const total = Math.max(1, Number(written[2]));
    return Math.min(96, 45 + Math.round((done / total) * 50));
  }

  if (course.status === "writing") return 45;
  if (course.status === "outlining") return 32;
  if (course.status === "fetching") return 18;
  return 6;
}

export function GeneratingPipeline({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [course, setCourse] = useState<CourseStatus | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function poll() {
      try {
        const response = await fetch(`/api/courses/${courseId}/status`, {
          cache: "no-store",
        });

        if (!response.ok) {
          if (!cancelled) {
            setFetchError(
              response.status === 404
                ? "That course no longer exists."
                : response.status === 401
                  ? "Your session expired. Sign in again to continue."
                  : "Lost contact with the server — retrying.",
            );
          }
          return;
        }

        const data = (await response.json()) as CourseStatus;
        if (cancelled) return;

        setCourse(data);
        setFetchError(null);

        if (data.status === "ready") {
          window.setTimeout(() => {
            if (!cancelled) router.replace(`/course/${data.slug}`);
          }, 700);
          return;
        }

        if (data.status !== "failed") {
          timer = window.setTimeout(poll, 1_600);
        }
      } catch {
        if (!cancelled) {
          setFetchError("Lost contact with the server — retrying.");
          timer = window.setTimeout(poll, 2_500);
        }
      }
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [courseId, router]);

  const failed = course?.status === "failed";
  const active = course ? stepIndex(course.status) : 0;
  const value = progressFor(course);
  const ready = course?.status === "ready";

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="pt-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[0.68rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  {ready ? "Course ready" : failed ? "Generation stopped" : "Generating course"}
                </p>
                <h1 className="mt-1 text-[1.05rem] font-semibold tracking-tight">
                  {ready || failed ? (course?.title ?? "Your course") : "Reading the video…"}
                </h1>
                <p className="mt-0.5 text-[0.75rem] text-muted-foreground">
                  {course?.stage ?? "Queued"}
                  {course && course.lessons > 0
                    ? ` · ${course.modules} modules · ${course.lessons} sections`
                    : ""}
                </p>
                {!ready && !failed && course && course.lessons > 0 && (
                  <p className="mt-1 text-[0.72rem] text-muted-foreground">
                    Finished sections are readable now — the rest arrive as they&apos;re written.
                  </p>
                )}
              </div>
              {course && course.lessons > 0 && (
                <Button
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => router.replace(`/course/${course.slug}`)}
                >
                  {ready ? "Open" : "Start reading"}
                  <ArrowRight className="size-3.5" />
                </Button>
              )}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <Progress value={value} className="flex-1" />
              <span className="text-[0.72rem] font-medium tabular-nums text-muted-foreground">
                {value}%
              </span>
            </div>

            <ol className="mt-4 flex flex-col">
              {STEPS.map((item, index) => {
                const complete = ready || index < active;
                const running = !failed && index === active;

                return (
                  <li
                    key={item.id}
                    className={cn(
                      "flex items-start gap-3 border-l-2 py-2.5 pl-3 transition-colors",
                      complete
                        ? "border-primary/30"
                        : running
                          ? "border-primary"
                          : failed && index === active
                            ? "border-destructive/50"
                            : "border-border/70",
                    )}
                  >
                    <span className="mt-0.5">
                      {complete ? (
                        <CheckCircle2 className="size-4 text-primary" />
                      ) : failed && index === active ? (
                        <AlertCircle className="size-4 text-destructive" />
                      ) : running ? (
                        <Loader2 className="size-4 animate-spin text-primary" />
                      ) : (
                        <Circle className="size-4 text-muted-foreground/40" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "text-[0.85rem] leading-tight font-medium",
                          complete || running ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {item.label}
                      </p>
                      <p className="mt-0.5 text-[0.72rem] text-muted-foreground">
                        {complete ? "Done" : running ? course?.stage ?? item.detail : item.detail}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        {failed && (
          <Card className="animate-rise border-destructive/25">
            <CardContent className="pt-1">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div className="min-w-0">
                  <p className="text-[0.9rem] font-medium">We couldn&apos;t build this course</p>
                  <p className="mt-1 text-[0.82rem] leading-relaxed text-muted-foreground">
                    {course?.error ?? "The transcript could not be processed."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="h-9 gap-1.5"
                      disabled={retrying}
                      onClick={() => {
                        setRetrying(true);
                        void retryCourseAction(courseId).finally(() => setRetrying(false));
                      }}
                    >
                      {retrying ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="size-3.5" />
                      )}
                      Try again
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={() => router.push("/#paste")}
                    >
                      Use a different video
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {fetchError && !failed && (
          <p className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-[0.8rem] text-warning-ink">
            {fetchError}
          </p>
        )}
      </div>

      <div className="hidden lg:block">
        <div className="sticky top-20 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-muted-foreground">
            Building your course page
          </p>
          <Skeleton className="mt-3 aspect-video w-full rounded-lg" />
          <div className="mt-4 flex flex-col gap-2.5">
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <div className="mt-5 flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center gap-2">
                <Skeleton className="size-4 rounded-full" />
                <Skeleton className="h-2.5 flex-1" />
              </div>
            ))}
          </div>
          <p className="mt-5 text-[0.7rem] leading-relaxed text-muted-foreground">
            The model reads the transcript in windows, then writes each module. Requests are
            paced to stay inside the account&apos;s rate limit, so a long lecture can take a
            couple of minutes.
          </p>
        </div>
      </div>
    </div>
  );
}
