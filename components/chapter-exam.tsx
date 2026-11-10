"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardList,
  Loader2,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  startChapterQuizAction,
  submitChapterQuizAction,
} from "@/lib/actions/rigorous";
import type {
  ChapterQuizAnswer,
  ChapterQuizQuestion,
  ChapterQuizReview,
} from "@/lib/actions/types";
import { CHAPTER_EXAM_PASS } from "@/lib/locks";
import type { ChapterQuizProgress } from "@/lib/types";
import { cn } from "@/lib/utils";

const LETTERS = ["A", "B", "C", "D"];

type Phase = "intro" | "loading" | "taking" | "grading" | "graded" | "error";

type GradedResult = {
  score: number;
  correct: number;
  total: number;
  bestScore: number;
  attempts: number;
  review: ChapterQuizReview[];
};

/**
 * The chapter-end exam, available in every mode. Papers mix multiple choice,
 * a written answer and (when the chapter shows code) a coding task; they are
 * written once on first open and cached server-side, so retakes ask the same
 * paper. In rigorous study mode a cleared run (>= 80%) also opens the next
 * chapter — otherwise it simply records the score.
 */
export function ChapterExam({
  chapterIndex,
  chapterTitle,
  moduleId,
  progress,
  rigorous,
  hasNextChapter,
  onProgress,
  onClose,
  onNextChapter,
}: {
  chapterIndex: number;
  chapterTitle: string;
  moduleId: string;
  progress?: ChapterQuizProgress;
  /** Whether a cleared exam gates the next chapter (rigorous study mode). */
  rigorous: boolean;
  hasNextChapter: boolean;
  onProgress: (moduleId: string, progress: ChapterQuizProgress) => void;
  onClose: () => void;
  onNextChapter: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [questions, setQuestions] = useState<ChapterQuizQuestion[]>([]);
  const [choices, setChoices] = useState<Record<number, number>>({});
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [result, setResult] = useState<GradedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const answered =
    questions.filter((question, index) =>
      question.kind === "mcq"
        ? choices[index] !== undefined
        : Boolean((texts[index] ?? "").trim()),
    ).length;
  const canSubmit = questions.length > 0 && answered === questions.length;

  async function begin() {
    setPhase("loading");
    setError(null);

    const response = await startChapterQuizAction(moduleId);
    if (!response.ok) {
      setError(response.error);
      setPhase("error");
      return;
    }
    setQuestions(response.questions);
    setChoices({});
    setTexts({});
    setResult(null);
    setPhase("taking");
  }

  async function submit() {
    if (!canSubmit) return;
    setPhase("grading");

    const answers: ChapterQuizAnswer[] = questions.map((question, index) =>
      question.kind === "mcq"
        ? { choice: choices[index] ?? -1 }
        : { text: texts[index] ?? "" },
    );
    const response = await submitChapterQuizAction(moduleId, answers);

    if (!response.ok) {
      setError(response.error);
      setPhase("error");
      return;
    }

    setResult({
      score: response.score,
      correct: response.correct,
      total: response.total,
      bestScore: response.bestScore,
      attempts: response.attempts,
      review: response.review,
    });
    setPhase("graded");
    onProgress(moduleId, {
      bestScore: response.bestScore,
      attempts: response.attempts,
      passed: response.bestScore >= CHAPTER_EXAM_PASS,
    });

    if (response.score >= CHAPTER_EXAM_PASS) {
      toast.success(`Chapter cleared — ${response.score}%`);
    } else {
      toast(`${response.score}% — you need ${CHAPTER_EXAM_PASS}%. Retake any time.`);
    }
  }

  function retake() {
    setChoices({});
    setTexts({});
    setResult(null);
    setError(null);
    setPhase("taking");
  }

  const cleared = (result?.score ?? 0) >= CHAPTER_EXAM_PASS;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="mb-2 inline-flex items-center gap-1.5 text-[0.75rem] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Back to the section
          </button>
          <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-primary">
            Chapter {chapterIndex + 1} end exam
          </p>
          <h2 className="truncate text-base font-bold tracking-tight sm:text-lg">{chapterTitle}</h2>
          <p className="mt-1 text-[0.78rem] text-muted-foreground">
            5 questions from this chapter&apos;s notes · need {CHAPTER_EXAM_PASS}%
            {rigorous ? " to open the next chapter" : ""} · unlimited retakes
            {progress && progress.attempts > 0 && (
              <>
                {" · best "}
                <span className="font-medium tabular-nums text-foreground">
                  {progress.bestScore}%
                </span>
                {` · ${progress.attempts} attempt${progress.attempts === 1 ? "" : "s"}`}
              </>
            )}
          </p>
        </div>
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl border",
            progress?.passed
              ? "border-success/40 bg-success-soft text-success-ink"
              : "border-primary/40 bg-primary/10 text-primary",
          )}
        >
          {progress?.passed ? (
            <ShieldCheck className="size-5" />
          ) : (
            <ClipboardList className="size-5" />
          )}
        </span>
      </div>

      {(phase === "intro" || phase === "error") && (
        <div className="animate-rise rounded-xl border border-primary/20 bg-accent/50 p-5">
          <p className="text-[0.88rem] leading-relaxed text-accent-foreground/85">
            This exam covers everything the chapter taught.{" "}
            {rigorous
              ? `Score ${CHAPTER_EXAM_PASS}% and the next chapter opens — below that, read the feedback and retake it as often as you like.`
              : `Score ${CHAPTER_EXAM_PASS}% to clear it — below that, read the feedback and retake it as often as you like.`}
          </p>
          {error && (
            <p
              role="alert"
              className="mt-3 flex items-start gap-1.5 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[0.8rem] text-danger-ink"
            >
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              {error}
            </p>
          )}
          <Button onClick={begin} className="mt-4 h-10 min-w-36">
            {phase === "error" ? "Try again" : progress?.attempts ? "Retake the exam" : "Begin exam"}
          </Button>
        </div>
      )}

      {phase === "loading" && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-5 text-[0.85rem] text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" />
          Preparing the exam from this chapter&apos;s notes…
        </div>
      )}

      {(phase === "taking" || phase === "grading") && (
        <>
          <ol className="flex flex-col gap-3">
            {questions.map((question, index) => {
              if (question.kind === "mcq") {
                const picked = choices[index];

                return (
                  <li
                    key={question.id}
                    className="rounded-xl border border-border bg-card p-4 shadow-xs"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-muted text-[0.68rem] font-semibold text-muted-foreground">
                        {index + 1}
                      </span>
                      <p className="text-[0.9rem] leading-snug font-medium">{question.prompt}</p>
                    </div>

                    <div className="mt-3 grid gap-2">
                      {question.options.map((option, optionIndex) => {
                        const selected = picked === optionIndex;

                        return (
                          <button
                            key={`${question.id}-${optionIndex}`}
                            type="button"
                            disabled={phase === "grading"}
                            aria-pressed={selected}
                            onClick={() =>
                              setChoices((current) => ({ ...current, [index]: optionIndex }))
                            }
                            className={cn(
                              "flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-[0.85rem] transition-colors disabled:cursor-default",
                              selected
                                ? "border-primary bg-accent/70 text-accent-foreground ring-1 ring-primary/25"
                                : "border-border bg-card hover:border-primary/40 hover:bg-accent/40",
                            )}
                          >
                            <span
                              className={cn(
                                "grid size-6 shrink-0 place-items-center rounded-full border text-[0.68rem] font-semibold",
                                selected
                                  ? "border-primary/40 bg-primary text-primary-foreground"
                                  : "border-border text-muted-foreground",
                              )}
                            >
                              {LETTERS[optionIndex]}
                            </span>
                            <span className="leading-snug">{option}</span>
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              }

              const value = texts[index] ?? "";

              return (
                <li
                  key={question.id}
                  className="rounded-xl border border-border bg-card p-4 shadow-xs"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-muted text-[0.68rem] font-semibold text-muted-foreground">
                        {index + 1}
                      </span>
                      <p className="text-[0.9rem] leading-snug font-medium">{question.prompt}</p>
                    </div>
                    <span className="shrink-0 rounded-none bg-muted px-1.5 py-0.5 text-[0.62rem] font-semibold tracking-wide text-muted-foreground uppercase">
                      {question.kind === "short" ? "written" : question.language}
                    </span>
                  </div>

                  <Textarea
                    value={value}
                    disabled={phase === "grading"}
                    onChange={(event) =>
                      setTexts((current) => ({ ...current, [index]: event.target.value }))
                    }
                    rows={question.kind === "code" ? 7 : 3}
                    spellCheck={question.kind !== "code"}
                    placeholder={
                      question.kind === "short"
                        ? "Write your answer in your own words…"
                        : `Write your ${question.language} here…`
                    }
                    className={cn(
                      "mt-3 text-[0.85rem]",
                      question.kind === "code" && "font-mono text-[0.78rem]",
                    )}
                  />
                </li>
              );
            })}
          </ol>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={submit} disabled={!canSubmit || phase === "grading"} className="h-10 min-w-32">
              {phase === "grading" ? (
                <>
                  <Loader2 className="animate-spin" />
                  Grading
                </>
              ) : (
                "Submit exam"
              )}
            </Button>
            {!canSubmit && (
              <p className="text-[0.75rem] text-muted-foreground">
                Answer all {questions.length} questions to submit.
              </p>
            )}
          </div>
        </>
      )}

      {phase === "graded" && result && (
        <>
          <div
            className={cn(
              "animate-rise rounded-xl border p-4",
              cleared ? "border-success/30 bg-success-soft/70" : "border-warning/40 bg-warning-soft/60",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Your score
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-2xl font-semibold tabular-nums",
                    cleared ? "text-success-ink" : "text-warning-ink",
                  )}
                >
                  {result.score}%
                </p>
              </div>
              <div className="min-w-48 flex-1">
                <Progress value={result.score} />
                <p className="mt-2 text-[0.72rem] text-muted-foreground">
                  {result.correct} of {result.total} correct · best {result.bestScore}% · need{" "}
                  {CHAPTER_EXAM_PASS}%
                </p>
              </div>
            </div>
            <p
              className={cn(
                "mt-3 border-t border-border/60 pt-2.5 text-[0.8rem] leading-relaxed",
                cleared ? "text-success-ink" : "text-warning-ink",
              )}
            >
              {cleared
                ? !rigorous
                  ? "Chapter cleared — this chapter's exam is passed."
                  : hasNextChapter
                    ? "Chapter cleared — the next chapter is open."
                    : "Chapter cleared — every chapter of this course is now open."
                : "Not cleared yet. Read the review below and retake it — attempts are unlimited."}
            </p>
          </div>

          <ol className="flex flex-col gap-3">
            {questions.map((question, index) => {
              const review = result.review[index];
              const correct = review
                ? review.kind === "mcq"
                  ? review.picked !== null && review.picked === review.answer
                  : review.correct
                : false;
              const isCode = question.kind === "code";

              return (
                <li
                  key={question.id}
                  className="rounded-xl border border-border bg-card p-4 shadow-xs"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-muted text-[0.68rem] font-semibold text-muted-foreground">
                      {index + 1}
                    </span>
                    <p className="text-[0.9rem] leading-snug font-medium">{question.prompt}</p>
                    <span
                      className={cn(
                        "ml-auto grid size-5 shrink-0 place-items-center rounded-full text-white",
                        correct ? "bg-success-ink" : "bg-danger-ink",
                      )}
                    >
                      {correct ? <Check className="size-3" /> : <X className="size-3" />}
                    </span>
                  </div>

                  {question.kind === "mcq" && review?.kind === "mcq" && (
                    <div className="mt-3 grid gap-1.5">
                      {question.options.map((option, optionIndex) => {
                        const isAnswer = review.answer === optionIndex;
                        const isPick = review.picked === optionIndex;

                        return (
                          <span
                            key={`${question.id}-${optionIndex}`}
                            className={cn(
                              "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[0.82rem] leading-snug",
                              isAnswer
                                ? "border-success/40 bg-success-soft text-success-ink"
                                : isPick
                                  ? "border-danger/40 bg-danger-soft text-danger-ink"
                                  : "border-border/70 bg-card text-muted-foreground",
                            )}
                          >
                            <span className="text-[0.68rem] font-semibold">{LETTERS[optionIndex]}</span>
                            {option}
                            {isPick && !isAnswer && (
                              <span className="ml-auto text-[0.66rem] font-medium uppercase">your pick</span>
                            )}
                            {isAnswer && (
                              <span className="ml-auto text-[0.66rem] font-medium uppercase">answer</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {review && review.kind !== "mcq" && (
                    <div className="mt-3 flex flex-col gap-2">
                      <div
                        className={cn(
                          "rounded-lg border px-3 py-2",
                          review.correct
                            ? "border-success/40 bg-success-soft"
                            : "border-danger/40 bg-danger-soft",
                        )}
                      >
                        <p className="text-[0.64rem] font-semibold tracking-wide text-muted-foreground uppercase">
                          Your {isCode ? "code" : "answer"}
                        </p>
                        <p
                          className={cn(
                            "mt-1 text-[0.8rem] leading-relaxed whitespace-pre-wrap",
                            review.correct ? "text-success-ink" : "text-danger-ink",
                            isCode && "font-mono text-[0.74rem]",
                          )}
                        >
                          {review.submitted || "(empty)"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-success/40 bg-success-soft px-3 py-2">
                        <p className="text-[0.64rem] font-semibold tracking-wide text-muted-foreground uppercase">
                          {isCode ? "Reference solution" : "Model answer"}
                        </p>
                        <p
                          className={cn(
                            "mt-1 text-[0.8rem] leading-relaxed whitespace-pre-wrap text-success-ink",
                            isCode && "font-mono text-[0.74rem]",
                          )}
                        >
                          {review.answer}
                        </p>
                      </div>
                      {review.feedback && (
                        <p className="text-[0.78rem] leading-relaxed text-muted-foreground">
                          {review.feedback}
                        </p>
                      )}
                    </div>
                  )}

                  {review?.explanation && (
                    <p className="mt-3 border-t border-border/70 pt-2.5 text-[0.78rem] leading-relaxed text-muted-foreground">
                      {review.explanation}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="flex flex-wrap items-center gap-3">
            {!cleared && (
              <Button onClick={retake} variant="outline" className="h-10 gap-1.5">
                <RotateCcw className="size-3.5" />
                Retake the exam
              </Button>
            )}
            {cleared && hasNextChapter && (
              <Button onClick={onNextChapter} className="h-10 gap-1.5">
                Continue to chapter {chapterIndex + 2}
                <ArrowRight className="size-3.5" />
              </Button>
            )}
            {cleared && !hasNextChapter && (
              <Button onClick={onNextChapter} className="h-10 gap-1.5">
                Back to the course
                <ArrowRight className="size-3.5" />
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
