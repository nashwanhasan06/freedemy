"use client";

import {
  AlertTriangle,
  Check,
  Info,
  Lightbulb,
  Loader2,
  MessageSquare,
  RotateCcw,
  Terminal,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { FeedbackCard } from "@/components/feedback-card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { submitAssignmentAction } from "@/lib/actions/assignments";
import type { SubmitAnswers } from "@/lib/actions/types";
import type {
  AssignmentResult,
  CodeExercise,
  ExerciseError,
  GradedLesson,
  Lesson,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type Phase = "idle" | "grading" | "graded";

const LETTERS = ["A", "B", "C", "D", "E"];

function initialCode(exercises: CodeExercise[]): Record<string, string> {
  return exercises.reduce<Record<string, string>>((map, exercise) => {
    map[exercise.id] = exercise.starterCode;
    return map;
  }, {});
}

export function AssignmentPanel({
  lesson,
  tutorHref,
  onRewatch,
  onGraded,
  lastGrade,
}: {
  lesson: Lesson;
  tutorHref: string;
  onRewatch: (at: number) => void;
  onGraded: (lessonId: string, grade: GradedLesson) => void;
  lastGrade?: GradedLesson;
}) {
  const short = lesson.shortAnswer;
  const shortId = short?.id ?? "";
  const showShort = Boolean(short && shortId);
  const codeExercises = lesson.codeExercises ?? [];

  const [choices, setChoices] = useState<Record<string, number>>({});
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    initialCode(lesson.codeExercises ?? []),
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<AssignmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const answeredCount = Object.keys(choices).length;
  const shortFilled = !showShort || (texts[shortId] ?? "").trim().length > 3;
  const codeFilled = codeExercises.every(
    (exercise) => (texts[exercise.id] ?? "").trim().length > 0,
  );
  const canSubmit =
    phase === "idle" &&
    answeredCount === lesson.questions.length &&
    shortFilled &&
    codeFilled;

  const graded = phase === "graded" && result;

  function feedbackFor(exerciseId: string) {
    return result?.exercises.find((item) => item.exerciseId === exerciseId);
  }

  async function submit() {
    if (!canSubmit) return;
    setPhase("grading");
    setError(null);

    const answers: SubmitAnswers = {};
    for (const question of lesson.questions) {
      if (choices[question.id] === undefined) continue;
      answers[question.id] = { choice: choices[question.id] };
    }
    if (showShort) {
      answers[shortId] = { text: texts[shortId] ?? "" };
    }
    for (const exercise of codeExercises) {
      answers[exercise.id] = { text: texts[exercise.id] ?? "" };
    }

    try {
      const response = await submitAssignmentAction({ lessonId: lesson.id, answers });
      if (!response.ok) {
        setError(response.error);
        setPhase("idle");
        toast.error("Could not grade that attempt.");
        return;
      }

      setResult(response.result);
      setPhase("graded");
      onGraded(lesson.id, {
        score: response.result.score,
        correct: response.result.correct,
        total: response.result.total,
      });
      toast.success(
        response.result.score >= 70
          ? `Nice — ${response.result.score}% on this section`
          : `Graded — ${response.result.score}%. Read the feedback below.`,
      );
    } catch {
      setError("The grader did not respond. Try again in a moment.");
      setPhase("idle");
    }
  }

  function reset() {
    setChoices({});
    setTexts(initialCode(codeExercises));
    setPhase("idle");
    setResult(null);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[0.95rem] font-semibold tracking-tight">Check yourself</h2>
          <p className="text-[0.75rem] text-muted-foreground">
            {lesson.questions.length} multiple choice
            {showShort ? " · 1 short answer" : ""}
            {codeExercises.length > 0
              ? ` · ${codeExercises.length} coding task${codeExercises.length > 1 ? "s" : ""}`
              : ""}
            {!graded && lastGrade ? ` · best ${lastGrade.score}%` : ""}
          </p>
        </div>
        {graded && (
          <span className="text-[0.7rem] font-medium tabular-nums text-muted-foreground">
            {graded.correct} of {graded.total} correct
          </span>
        )}
      </div>

      <Link
        href={tutorHref}
        className="group flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-accent/40 px-4 py-3 transition-colors hover:border-primary/50 hover:bg-accent/70"
      >
        <span className="flex items-center gap-2 text-[0.82rem] font-medium text-accent-foreground">
          <MessageSquare className="size-4" />
          Stuck? Open the assignment tutor
        </span>
        <span className="text-[0.72rem] text-muted-foreground group-hover:text-foreground">
          Ask about this section →
        </span>
      </Link>

      {graded && (
        <div className="animate-rise rounded-xl border border-primary/20 bg-accent/50 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-accent-foreground/70 uppercase">
                Your score
              </p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums text-accent-foreground">
                {graded.score}%
              </p>
            </div>
            <div className="flex-1">
              <Progress value={graded.score} />
              <p className="mt-2 text-[0.72rem] text-accent-foreground/70">
                {graded.passed
                  ? "Saved to your progress — this section counts as complete."
                  : "Saved. You need 70% for this section to count as complete."}
              </p>
            </div>
          </div>
          {graded.summary && (
            <p className="mt-3 border-t border-primary/15 pt-2.5 text-[0.78rem] leading-relaxed text-accent-foreground/80">
              {graded.summary}
            </p>
          )}
        </div>
      )}

      <ol className="flex flex-col gap-3">
        {lesson.questions.map((question, index) => {
          const feedback = feedbackFor(question.id);
          const picked = choices[question.id];
          const wrong = graded && feedback && !feedback.correct;

          return (
            <li key={question.id} className="rounded-xl bg-card p-4 border border-border shadow-xs">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-muted text-[0.68rem] font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <p className="text-[0.9rem] leading-snug font-medium">{question.prompt}</p>
              </div>

              <div className="mt-3 grid gap-2">
                {question.options.map((option, optionIndex) => {
                  const selected = picked === optionIndex;
                  const correctOption = graded && optionIndex === question.answer;

                  return (
                    <button
                      key={`${question.id}-${optionIndex}`}
                      type="button"
                      disabled={phase !== "idle"}
                      aria-pressed={selected}
                      onClick={() =>
                        setChoices((current) => ({ ...current, [question.id]: optionIndex }))
                      }
                      className={cn(
                        "flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-[0.85rem] transition-colors",
                        "disabled:cursor-default",
                        !graded &&
                          (selected
                            ? "border-primary bg-accent/70 text-accent-foreground ring-1 ring-primary/25"
                            : "border-border bg-card hover:border-primary/40 hover:bg-accent/40"),
                        graded &&
                          (correctOption
                            ? "border-success/40 bg-success-soft text-success-ink"
                            : selected
                              ? "border-danger/40 bg-danger-soft text-danger-ink"
                              : "border-border/70 bg-card text-muted-foreground"),
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-6 shrink-0 place-items-center rounded-full border text-[0.68rem] font-semibold",
                          !graded && selected
                            ? "border-primary/40 bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground",
                          graded && correctOption && "border-success bg-success-ink text-white",
                          graded && selected && !correctOption && "border-danger bg-danger-ink text-white",
                        )}
                      >
                        {graded && correctOption ? (
                          <Check className="size-3.5" />
                        ) : graded && selected && !correctOption ? (
                          <X className="size-3.5" />
                        ) : (
                          LETTERS[optionIndex]
                        )}
                      </span>
                      <span className="leading-snug">{option}</span>
                    </button>
                  );
                })}
              </div>

              {wrong && (
                <div className="mt-3">
                  <FeedbackCard
                    misconception={question.misconception}
                    explanation={question.explanation}
                    at={question.at}
                    onRewatch={onRewatch}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {showShort && short && (
        <div className="rounded-xl bg-card p-4 border border-border shadow-xs">
          <p className="text-[0.9rem] font-medium">Short answer</p>
          <p className="mt-1 text-[0.85rem] leading-snug text-muted-foreground">{short.prompt}</p>
          <Textarea
            value={texts[shortId] ?? ""}
            onChange={(event) =>
              setTexts((current) => ({ ...current, [shortId]: event.target.value }))
            }
            disabled={phase !== "idle"}
            placeholder="Explain it in your own words…"
            rows={3}
            className="mt-3 min-h-24 resize-none text-[0.85rem]"
          />

          {graded && (
            <div className="mt-3 animate-rise">
              {feedbackFor(shortId)?.correct ? (
                <div className="rounded-lg border border-success/35 bg-success-soft p-3 text-[0.82rem]">
                  <p className="flex items-center gap-1.5 font-medium text-success-ink">
                    <Check className="size-3.5" /> Accepted
                  </p>
                  <p className="mt-1 leading-relaxed text-success-ink/75">{short.model}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[0.8rem] leading-relaxed text-danger-ink">
                    {feedbackFor(shortId)?.feedback ?? "This answer needed more of the key idea."}
                  </p>
                  <FeedbackCard
                    misconception={short.misconception}
                    explanation={`${short.explanation} Model answer: ${short.model}`}
                    at={short.at}
                    onRewatch={onRewatch}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {codeExercises.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-[0.7rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Coding tasks
          </p>

          {codeExercises.map((exercise) => {
            const feedback = feedbackFor(exercise.id);

            return (
              <div
                key={exercise.id}
                className="rounded-xl bg-card p-4 border border-border shadow-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <Terminal className="mt-0.5 size-4 shrink-0 text-primary" />
                    <p className="text-[0.9rem] leading-snug font-medium">{exercise.prompt}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.62rem] font-medium uppercase tracking-wide text-muted-foreground">
                    {exercise.language}
                  </span>
                </div>

                {exercise.hint && (
                  <p className="mt-2 flex items-start gap-1.5 text-[0.76rem] leading-relaxed text-muted-foreground">
                    <Lightbulb className="mt-px size-3.5 shrink-0 text-warning-ink" />
                    {exercise.hint}
                  </p>
                )}

                <Textarea
                  value={texts[exercise.id] ?? ""}
                  onChange={(event) =>
                    setTexts((current) => ({ ...current, [exercise.id]: event.target.value }))
                  }
                  disabled={phase !== "idle"}
                  spellCheck={false}
                  rows={9}
                  aria-label={`Your ${exercise.language} solution`}
                  className="mt-3 min-h-40 resize-y bg-background font-mono text-[0.8rem] leading-relaxed"
                />

                {graded && feedback && (
                  <div className="mt-3 flex flex-col gap-2">
                    <div
                      className={cn(
                        "rounded-lg border px-3 py-2 text-[0.8rem] leading-relaxed",
                        feedback.correct
                          ? "border-success/35 bg-success-soft text-success-ink"
                          : "border-danger/30 bg-danger-soft text-danger-ink",
                      )}
                    >
                      <p className="flex items-center gap-1.5 font-medium">
                        {feedback.correct ? (
                          <>
                            <Check className="size-3.5" /> Passed
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="size-3.5" /> Needs another pass
                          </>
                        )}
                        <span className="ml-auto text-[0.68rem] font-normal tabular-nums opacity-70">
                          {feedback.score}/{feedback.maxScore}
                        </span>
                      </p>
                      {feedback.feedback && <p className="mt-1">{feedback.feedback}</p>}
                    </div>

                    {feedback.errors.length > 0 && <ErrorList errors={feedback.errors} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[0.8rem] text-danger-ink"
        >
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {phase === "graded" ? (
          <Button variant="outline" onClick={reset} className="h-10 gap-1.5">
            <RotateCcw className="size-3.5" />
            Try this section again
          </Button>
        ) : (
          <Button onClick={submit} disabled={!canSubmit} className="h-10 min-w-32">
            {phase === "grading" ? (
              <>
                <Loader2 className="animate-spin" />
                Grading
              </>
            ) : (
              "Submit answers"
            )}
          </Button>
        )}

        {phase === "idle" && !canSubmit && (
          <p className="text-[0.75rem] text-muted-foreground">
            {answeredCount < lesson.questions.length
              ? `Answer all ${lesson.questions.length} multiple-choice questions.`
              : !shortFilled
                ? "Add a short answer to submit."
                : "Finish every coding task to submit."}
          </p>
        )}
      </div>
    </div>
  );
}

function ErrorList({ errors }: { errors: ExerciseError[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {errors.map((item, index) => (
        <li
          key={`${item.message}-${index}`}
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2 text-[0.78rem] leading-relaxed",
            item.severity === "error"
              ? "border-danger/25 bg-danger-soft/70 text-danger-ink"
              : item.severity === "warning"
                ? "border-warning/35 bg-warning-soft text-warning-ink"
                : "border-border bg-muted/50 text-muted-foreground",
          )}
        >
          {item.severity === "error" ? (
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          ) : item.severity === "warning" ? (
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          ) : (
            <Info className="mt-0.5 size-3.5 shrink-0" />
          )}
          <span className="min-w-0">
            {item.line !== undefined && (
              <span className="font-semibold tabular-nums">Line {item.line}: </span>
            )}
            {item.message}
            {item.code && (
              <code className="mt-1 block overflow-x-auto rounded bg-background/70 px-2 py-1 font-mono text-[0.72rem]">
                {item.code}
              </code>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
