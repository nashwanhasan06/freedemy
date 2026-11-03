"use client";

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Circle,
  FileText,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getCourseByVideoId, FEATURED_COURSE } from "@/lib/demo-data";
import { courseLessons } from "@/lib/course";
import type { Course } from "@/lib/types";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "transcript", label: "Fetching transcript", detail: "Reading the video's captions", ms: 1500 },
  { id: "sections", label: "Finding sections", detail: "Matching chapter timestamps", ms: 1400 },
  { id: "notes", label: "Writing notes", detail: "Summaries and key terms per section", ms: 2100 },
  { id: "assignments", label: "Building assignments", detail: "Questions, answers and timestamps", ms: 1800 },
];

type Stage = "running" | "transcript-error" | "ai-error" | "done";

export function GeneratingPipeline() {
  const router = useRouter();
  const params = useSearchParams();
  const videoId = params.get("v") ?? "";

  const sourceCourse = useMemo(() => getCourseByVideoId(videoId), [videoId]);
  const [target, setTarget] = useState<Course | null>(sourceCourse ?? null);
  const [stage, setStage] = useState<Stage>("running");
  const [step, setStep] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);

  useEffect(() => {
    if (stage !== "running") return;

    if (!target) {
      const timer = window.setTimeout(() => setStage("transcript-error"), 1200);
      return () => window.clearTimeout(timer);
    }

    if (step >= STEPS.length) {
      const complete = window.setTimeout(() => setStage("done"), 250);
      const navigate = window.setTimeout(() => router.push(`/course/${target.slug}`), 1450);
      return () => {
        window.clearTimeout(complete);
        window.clearTimeout(navigate);
      };
    }

    const timer = window.setTimeout(() => setStep((value) => value + 1), STEPS[step].ms);
    return () => window.clearTimeout(timer);
  }, [stage, step, target, router]);

  function restart() {
    setStep(0);
    setStage("running");
  }

  function submitTranscript() {
    const words = transcript.trim().split(/\s+/).filter(Boolean).length;
    if (words < 120) {
      setStage("ai-error");
      return;
    }
    setTarget(FEATURED_COURSE);
    setPasteOpen(false);
    restart();
    toast.success("Transcript accepted — rebuilding the course");
  }

  const value = Math.round((Math.min(step, STEPS.length) / STEPS.length) * 100);
  const lessonCount = target ? courseLessons(target).length : 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="pt-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[0.68rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  {stage === "done" ? "Course ready" : "Generating course"}
                </p>
                <h1 className="mt-1 text-[1.05rem] font-semibold tracking-tight">
                  {target ? target.title : "Reading the video…"}
                </h1>
                <p className="mt-0.5 text-[0.75rem] text-muted-foreground">
                  {target ? `${target.channel} · ${lessonCount} sections` : videoId}
                </p>
              </div>
              {stage === "done" && target && (
                <Button
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => router.push(`/course/${target.slug}`)}
                >
                  Open
                  <ArrowRight className="size-3.5" />
                </Button>
              )}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <Progress value={stage === "done" ? 100 : value} className="flex-1" />
              <span className="text-[0.72rem] font-medium tabular-nums text-muted-foreground">
                {stage === "done" ? 100 : value}%
              </span>
            </div>

            <ol className="mt-4 flex flex-col">
              {STEPS.map((item, index) => {
                const complete = step > index || stage === "done";
                const active = step === index && stage === "running";
                const failed =
                  (stage === "transcript-error" || stage === "ai-error") && index === step;

                return (
                  <li
                    key={item.id}
                    className={cn(
                      "flex items-start gap-3 border-l-2 py-2.5 pl-3 transition-colors",
                      complete
                        ? "border-primary/30"
                        : active
                          ? "border-primary"
                          : failed
                            ? "border-destructive/50"
                            : "border-border/70",
                    )}
                  >
                    <span className="mt-0.5">
                      {complete ? (
                        <CheckCircle2 className="size-4 text-primary" />
                      ) : active ? (
                        <Loader2 className="size-4 animate-spin text-primary" />
                      ) : failed ? (
                        <AlertCircle className="size-4 text-destructive" />
                      ) : (
                        <Circle className="size-4 text-muted-foreground/40" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "text-[0.85rem] leading-tight font-medium",
                          complete || active ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {item.label}
                      </p>
                      <p className="mt-0.5 text-[0.72rem] text-muted-foreground">
                        {complete ? "Done" : active ? item.detail : "Waiting"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        {stage === "transcript-error" && (
          <Card className="animate-rise border-destructive/20">
            <CardContent className="pt-1">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div className="min-w-0">
                  <p className="text-[0.9rem] font-medium">
                    We couldn&apos;t fetch the transcript
                  </p>
                  <p className="mt-1 text-[0.82rem] leading-relaxed text-muted-foreground">
                    Captions are disabled on this video, or YouTube blocked the request.
                    Paste the transcript yourself and we&apos;ll finish from there.
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="h-9 gap-1.5"
                      onClick={() => setPasteOpen((open) => !open)}
                    >
                      <FileText className="size-3.5" />
                      Paste a transcript
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={restart}>
                      <RotateCcw className="size-3.5" />
                      Try again
                    </Button>
                  </div>

                  {pasteOpen && (
                    <div className="mt-3 flex flex-col gap-2">
                      <Textarea
                        value={transcript}
                        onChange={(event) => setTranscript(event.target.value)}
                        rows={5}
                        placeholder="Paste the captions or your own notes from the video…"
                        className="min-h-28 resize-y text-[0.82rem]"
                      />
                      <div className="flex items-center gap-2">
                        <Button size="sm" className="h-9" onClick={submitTranscript}>
                          Build course
                        </Button>
                        <span className="text-[0.7rem] text-muted-foreground">
                          {transcript.trim().split(/\s+/).filter(Boolean).length} words
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {stage === "ai-error" && (
          <Card className="animate-rise border-destructive/20">
            <CardContent className="pt-1">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div>
                  <p className="text-[0.9rem] font-medium">
                    The model couldn&apos;t finish this one
                  </p>
                  <p className="mt-1 text-[0.82rem] leading-relaxed text-muted-foreground">
                    Transcript was too short to build a course from. Add more of the
                    video&apos;s content, or try a different lecture.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" className="h-9 gap-1.5" onClick={() => setPasteOpen(true)}>
                      <FileText className="size-3.5" />
                      Edit transcript
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={restart}>
                      <RotateCcw className="size-3.5" />
                      Retry
                    </Button>
                  </div>
                  {pasteOpen && (
                    <div className="mt-3 flex flex-col gap-2">
                      <Textarea
                        value={transcript}
                        onChange={(event) => setTranscript(event.target.value)}
                        rows={5}
                        className="min-h-28 resize-y text-[0.82rem]"
                      />
                      <Button size="sm" className="h-9 w-fit" onClick={submitTranscript}>
                        Build course
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
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
            Sections build in parallel — most lectures are done in under a minute.
          </p>
        </div>
      </div>
    </div>
  );
}
