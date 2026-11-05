"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CircleDashed,
  Loader2,
  RotateCcw,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import Link from "next/link";

import { useState } from "react";
import { toast } from "sonner";

import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { createProjectAction, submitProjectAction } from "@/lib/actions/projects";
import type { CourseProject, ProjectLookup, ProjectReview } from "@/lib/db/projects";
import type { ExerciseError } from "@/lib/types";
import { cn } from "@/lib/utils";

type Phase = "idle" | "building" | "reviewing";

export function ProjectWorkspace({
  courseId,
  courseSlug,
  courseTitle,
  lookup,
}: {
  courseId: string;
  courseSlug: string;
  courseTitle: string;
  lookup: ProjectLookup;
}) {
  const initial = lookup.status === "ready" ? lookup.state : null;

  const [project, setProject] = useState<CourseProject | null>(initial?.project ?? null);
  const [code, setCode] = useState(
    initial?.lastCode ?? initial?.project.starterCode ?? "",
  );
  const [review, setReview] = useState<ProjectReview | null>(initial?.latest ?? null);
  const [passed, setPassed] = useState(Boolean(initial?.passed));
  const [completedAt, setCompletedAt] = useState(initial?.completedAt ?? null);
  const [attempts, setAttempts] = useState(initial?.attempts ?? 0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  // The checklist always comes from the brief, even before a review exists:
  // the student should see what will be checked.
  const requirements = project?.requirements ?? [];
  const metByRequirement = new Map(
    (review?.checks ?? []).map((check) => [check.requirement, check]),
  );

  async function build() {
    setPhase("building");
    setError(null);

    try {
      const response = await createProjectAction(courseId);
      if (!response.ok) {
        setError(response.error);
        toast.error("Could not build the project brief.");
        return;
      }

      setProject(response.project);
      setCode(response.project.starterCode);
      toast.success("Your final project is ready.");
    } catch {
      setError("The project builder did not respond. Try again in a moment.");
    } finally {
      setPhase("idle");
    }
  }

  async function submit() {
    if (!project) return;
    setPhase("reviewing");
    setError(null);

    try {
      const response = await submitProjectAction({ courseId, code });
      if (!response.ok) {
        setError(response.error);
        toast.error("Could not review that submission.");
        return;
      }

      setReview(response.review);
      setAttempts((current) => current + 1);
      if (response.review.passed) {
        setPassed(true);
        setCompletedAt(response.review.createdAt);
        toast.success("Project passed — this course is complete.");
      } else {
        toast.warning(`Reviewed — ${response.review.score}%. Read the checklist below.`);
      }
    } catch {
      setError("The reviewer did not respond. Try again in a moment.");
    } finally {
      setPhase("idle");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Button
          variant="outline"
          size="sm"
          className="mb-6 h-8 gap-2 rounded-lg border-border bg-card px-3 text-xs font-semibold text-foreground shadow-xs transition-all hover:border-primary/50 hover:bg-accent/40 hover:text-primary"
          render={<Link href={`/course/${courseSlug}`} />}
          nativeButton={false}
        >
          <ArrowLeft className="size-3.5" />
          <span>Back to the course</span>
        </Button>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[0.68rem] font-semibold tracking-[0.12em] text-primary uppercase">
              Final project
            </p>
            <h1 className="mt-1 text-[1.35rem] font-semibold tracking-tight">
              {project?.title ?? "Build something with the whole course"}
            </h1>
            <p className="mt-1 text-[0.8rem] text-muted-foreground">
              {courseTitle}
              {project ? ` · ${project.language}` : ""}
              {attempts > 0 ? ` · ${attempts} ${attempts === 1 ? "attempt" : "attempts"}` : ""}
            </p>
          </div>
        </div>
      </div>

      {lookup.status === "setup" && <SetupCard />}

      {lookup.status === "error" && (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[0.82rem] text-danger-ink"
        >
          <AlertTriangle className="mt-px size-4 shrink-0" />
          The project could not be loaded. Reload the page, and if it keeps failing check the
          server log.
        </p>
      )}

      {passed && (
        <div className="animate-rise rounded-xl border border-success/40 bg-success-soft p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-success-ink text-white">
              <Trophy className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-[0.95rem] font-semibold text-success-ink">
                Project complete — course finished
              </p>
              <p className="mt-1 text-[0.8rem] leading-relaxed text-success-ink/80">
                Your submission passed review
                {review ? ` at ${review.score}%` : ""}
                {completedAt
                  ? ` on ${new Date(completedAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}`
                  : ""}
                . It stays on your dashboard as the completed course.
              </p>
            </div>
          </div>
        </div>
      )}

      {!project && lookup.status !== "setup" && (
        <div className="rounded-xl border border-dashed border-border bg-card/60 p-6">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 size-4.5 shrink-0 text-primary" />
            <div>
              <h2 className="text-[0.95rem] font-semibold tracking-tight">
                One project, built from this course
              </h2>
              <p className="mt-1 max-w-prose text-[0.84rem] leading-relaxed text-muted-foreground">
                The tutor writes a single brief from the sections you have studied: one program,
                a short list of requirements, and a starter stub. Submit your code and it is
                reviewed against that list — pass it and the course counts as complete.
              </p>
              <Button
                className="mt-4 h-10 gap-1.5"
                disabled={phase === "building"}
                onClick={build}
              >
                {phase === "building" ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Writing your project
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    Build my project
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {project && (
        <>
          <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <h2 className="text-[0.85rem] font-semibold tracking-tight">The brief</h2>
            <Markdown content={project.brief} className="mt-3" />
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[0.85rem] font-semibold tracking-tight">
                What it has to do
              </h2>
              <span className="text-[0.7rem] text-muted-foreground">
                {review
                  ? `${review.checks.filter((check) => check.met).length} of ${requirements.length} met`
                  : "Every line is checked"}
              </span>
            </div>

            <ul className="mt-3 flex flex-col gap-2">
              {requirements.map((requirement, index) => {
                const check = metByRequirement.get(requirement);
                return (
                  <li
                    key={`${requirement}-${index}`}
                    className={cn(
                      "flex items-start gap-2.5 rounded-lg border px-3 py-2 text-[0.84rem] leading-relaxed",
                      check?.met
                        ? "border-success/35 bg-success-soft text-success-ink"
                        : check
                          ? "border-danger/25 bg-danger-soft/60 text-danger-ink"
                          : "border-border bg-background/40 text-foreground/80",
                    )}
                  >
                    {check?.met ? (
                      <Check className="mt-0.5 size-4 shrink-0" />
                    ) : check ? (
                      <X className="mt-0.5 size-4 shrink-0" />
                    ) : (
                      <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span>
                      {requirement}
                      {check?.note ? (
                        <span className="mt-0.5 block text-[0.78rem] opacity-80">
                          {check.note}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[0.85rem] font-semibold tracking-tight">Your code</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[0.62rem] font-medium tracking-wide text-muted-foreground uppercase">
                {project.language}
              </span>
            </div>

            <Textarea
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={phase === "reviewing"}
              spellCheck={false}
              rows={18}
              aria-label="Your final project code"
              className="mt-3 min-h-72 resize-y bg-background font-mono text-[0.8rem] leading-relaxed"
            />

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                className="h-10 min-w-36 gap-1.5"
                disabled={phase === "reviewing" || code.trim().length < 20}
                onClick={submit}
              >
                {phase === "reviewing" ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Reviewing
                  </>
                ) : (
                  <>
                    <Check className="size-4" />
                    {attempts === 0 ? "Submit project" : "Submit again"}
                  </>
                )}
              </Button>

              <p className="text-[0.74rem] text-muted-foreground">
                Reviewed line by line against the list above. Nothing is executed.
              </p>
            </div>
          </section>

          {review && (
            <section
              className={cn(
                "rounded-xl border p-5 shadow-xs",
                review.passed
                  ? "border-success/40 bg-success-soft/60"
                  : "border-border bg-card",
              )}
            >
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                    Last review
                  </p>
                  <p className="mt-0.5 text-2xl font-semibold tabular-nums">{review.score}%</p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[0.7rem] font-semibold",
                    review.passed
                      ? "bg-success-ink text-white"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {review.passed ? "Passed" : "Not passed yet"}
                </span>
              </div>

              <Progress value={review.score} className="mt-3" />

              {review.summary && (
                <p className="mt-3 text-[0.84rem] leading-relaxed text-foreground/90">
                  {review.summary}
                </p>
              )}

              {review.errors.length > 0 && <ErrorList errors={review.errors} />}

              {!review.passed && (
                <Button
                  variant="outline"
                  className="mt-4 h-9 gap-1.5"
                  onClick={() => setReview(null)}
                >
                  <RotateCcw className="size-3.5" />
                  Revise and resubmit
                </Button>
              )}
            </section>
          )}
        </>
      )}

      {error && (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[0.82rem] text-danger-ink"
        >
          <AlertTriangle className="mt-px size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

function SetupCard() {
  return (
    <div className="rounded-xl border border-warning/40 bg-warning-soft p-5">
      <h2 className="flex items-center gap-1.5 text-[0.9rem] font-semibold text-warning-ink">
        <AlertTriangle className="size-4" />
        One-time database setup
      </h2>
      <p className="mt-2 text-[0.82rem] leading-relaxed text-warning-ink/90">
        Final projects need two tables that are not in your database yet. Open the Supabase SQL
        editor, paste the <code className="rounded bg-warning/15 px-1 py-0.5">course_projects</code>{" "}
        block from <code className="rounded bg-warning/15 px-1 py-0.5">supabase/schema.sql</code>
        , run it once, then reload this page. Everything else on the site keeps working.
      </p>
    </div>
  );
}

function ErrorList({ errors }: { errors: ExerciseError[] }) {
  return (
    <ul className="mt-3 flex flex-col gap-1.5">
      {errors.map((item, index) => (
        <li
          key={`${item.message}-${index}`}
          className={cn(
            "rounded-lg border px-3 py-2 text-[0.78rem] leading-relaxed",
            item.severity === "error"
              ? "border-danger/25 bg-danger-soft/70 text-danger-ink"
              : item.severity === "warning"
                ? "border-warning/35 bg-warning-soft text-warning-ink"
                : "border-border bg-muted/40 text-muted-foreground",
          )}
        >
          <p className="font-medium">
            {item.line ? `Line ${item.line}: ` : ""}
            {item.message}
          </p>
          {item.code && (
            <pre className="mt-1 overflow-x-auto rounded bg-background/70 px-2 py-1 font-mono text-[0.72rem]">
              {item.code}
            </pre>
          )}
        </li>
      ))}
    </ul>
  );
}
