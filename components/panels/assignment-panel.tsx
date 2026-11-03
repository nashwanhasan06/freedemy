"use client";

import { Check, Loader2, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { FeedbackCard } from "@/components/feedback-card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import type { GradedLesson, Lesson, Mcq } from "@/lib/types";
import { cn } from "@/lib/utils";

type Phase = "idle" | "grading" | "graded";

type Result = {
  score: number;
  correct: number;
  total: number;
  answers: Record<string, number>;
  shortOk: boolean;
  shortText: string;
};

type PracticeItem = { question: Mcq; picked: number | null };

const LETTERS = ["A", "B", "C", "D", "E"];

export function AssignmentPanel({
  lesson,
  onRewatch,
  onGraded,
  lastGrade,
}: {
  lesson: Lesson;
  onRewatch: (at: number) => void;
  onGraded: (lessonId: string, grade: GradedLesson) => void;
  lastGrade?: GradedLesson;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [shortText, setShortText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [practice, setPractice] = useState<PracticeItem[]>([]);
  const [bankIndex, setBankIndex] = useState(0);
  const timerRef = useRef<number | null>(null);

  // The panel is keyed per section, so mounting is the reset. Only the pending
  // grading timer needs cleaning up.
  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const answeredCount = Object.keys(answers).length;
  const canSubmit =
    phase === "idle" &&
    answeredCount === lesson.questions.length &&
    shortText.trim().length > 3;

  function submit() {
    if (!canSubmit) return;
    setPhase("grading");

    timerRef.current = window.setTimeout(() => {
      const shortOk = lesson.shortAnswer.keywords.some((keyword) =>
        shortText.toLowerCase().includes(keyword.toLowerCase()),
      );
      const correctMcq = lesson.questions.filter(
        (question) => answers[question.id] === question.answer,
      ).length;
      const total = lesson.questions.length + 1;
      const correct = correctMcq + (shortOk ? 1 : 0);
      const score = Math.round((correct / total) * 100);

      setResult({ score, correct, total, answers, shortOk, shortText });
      setPhase("graded");
      onGraded(lesson.id, { score, correct, total });
      toast.success(
        score >= 70 ? `Nice — ${score}% on this section` : `Graded — ${score}%. See the feedback below.`,
      );
    }, 900);
  }

  function reset() {
    setAnswers({});
    setShortText("");
    setPhase("idle");
    setResult(null);
    setPractice([]);
    setBankIndex(0);
  }

  function addPractice() {
    const next = lesson.practiceBank[bankIndex];
    if (!next) {
      toast.info("That's every practice question for this section.");
      return;
    }
    setPractice((current) => [...current, { question: next, picked: null }]);
    setBankIndex((index) => index + 1);
  }

  const graded = phase === "graded" && result;
  const wrongQuestions = graded
    ? lesson.questions.filter((question) => graded.answers[question.id] !== question.answer)
    : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[0.95rem] font-semibold tracking-tight">Check yourself</h2>
          <p className="text-[0.75rem] text-muted-foreground">
            {lesson.questions.length} multiple choice · 1 short answer
            {!graded && lastGrade ? ` · last attempt ${lastGrade.score}%` : ""}
          </p>
        </div>
        {graded && (
          <span className="text-[0.7rem] font-medium tabular-nums text-muted-foreground">
            {graded.correct} of {graded.total} correct
          </span>
        )}
      </div>

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
                {wrongQuestions.length === 0
                  ? "Everything correct — move to the next section."
                  : `${wrongQuestions.length} answer${wrongQuestions.length > 1 ? "s" : ""} to revisit below.`}
              </p>
            </div>
          </div>
        </div>
      )}

      <ol className="flex flex-col gap-3">
        {lesson.questions.map((question, index) => {
          const picked = graded ? graded.answers[question.id] : answers[question.id];
          const isWrong = graded && picked !== question.answer;

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
                      key={option}
                      type="button"
                      disabled={phase !== "idle"}
                      aria-pressed={selected}
                      onClick={() =>
                        setAnswers((current) => ({ ...current, [question.id]: optionIndex }))
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

              {isWrong && (
                <div className="mt-3">
                  <FeedbackCard
                    misconception={question.misconception}
                    explanation={question.explanation}
                    at={question.at}
                    onRewatch={onRewatch}
                    onPractice={addPractice}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="rounded-xl bg-card p-4 border border-border shadow-xs">
        <p className="text-[0.9rem] font-medium">Short answer</p>
        <p className="mt-1 text-[0.85rem] leading-snug text-muted-foreground">
          {lesson.shortAnswer.prompt}
        </p>
        <Textarea
          value={graded ? graded.shortText : shortText}
          onChange={(event) => setShortText(event.target.value)}
          disabled={phase !== "idle"}
          placeholder={lesson.shortAnswer.placeholder}
          rows={3}
          className="mt-3 min-h-24 resize-none text-[0.85rem]"
        />

        {graded && (
          <div className="mt-3 animate-rise">
            {graded.shortOk ? (
              <div className="rounded-lg border border-success/35 bg-success-soft p-3 text-[0.82rem]">
                <p className="flex items-center gap-1.5 font-medium text-success-ink">
                  <Check className="size-3.5" /> Accepted
                </p>
                <p className="mt-1 leading-relaxed text-success-ink/75">
                  {lesson.shortAnswer.model}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <FeedbackCard
                  misconception={lesson.shortAnswer.misconception}
                  explanation={`${lesson.shortAnswer.explanation} Model answer: ${lesson.shortAnswer.model}`}
                  at={lesson.shortAnswer.at}
                  onRewatch={onRewatch}
                  onPractice={addPractice}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {practice.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-[0.7rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Fresh practice
          </p>
          {practice.map((item) => (
            <PracticeCard
              key={item.question.id}
              item={item}
              onPick={(optionIndex) =>
                setPractice((current) =>
                  current.map((entry) =>
                    entry.question.id === item.question.id
                      ? { ...entry, picked: optionIndex }
                      : entry,
                  ),
                )
              }
              onRewatch={onRewatch}
            />
          ))}
        </div>
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

        {!canSubmit && phase === "idle" && (
          <p className="text-[0.75rem] text-muted-foreground">
            {answeredCount === lesson.questions.length
              ? "Add a short answer to submit."
              : `Answer all ${lesson.questions.length + 1} questions to submit.`}
          </p>
        )}
      </div>
    </div>
  );
}

function PracticeCard({
  item,
  onPick,
  onRewatch,
}: {
  item: PracticeItem;
  onPick: (optionIndex: number) => void;
  onRewatch: (at: number) => void;
}) {
  const { question, picked } = item;
  const answered = picked !== null;
  const isCorrect = answered && picked === question.answer;

  return (
    <div className="animate-rise rounded-xl bg-card p-4 border border-border shadow-xs">
      <div className="flex items-center gap-2">
        <span className="text-[0.62rem] font-semibold tracking-[0.12em] text-primary uppercase">
          Practice
        </span>
      </div>
      <p className="mt-2 text-[0.88rem] leading-snug font-medium">{question.prompt}</p>

      <div className="mt-3 grid gap-2">
        {question.options.map((option, optionIndex) => {
          const selected = picked === optionIndex;
          const correctOption = answered && optionIndex === question.answer;

          return (
            <button
              key={option}
              type="button"
              disabled={answered}
              onClick={() => onPick(optionIndex)}
              className={cn(
                "flex min-h-11 items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-[0.84rem] transition-colors",
                !answered && "border-border bg-card hover:border-primary/40 hover:bg-accent/40",
                correctOption && "border-success/40 bg-success-soft text-success-ink",
                answered && !correctOption && selected && "border-danger/40 bg-danger-soft text-danger-ink",
                answered && !correctOption && !selected && "border-border/60 bg-card text-muted-foreground",
              )}
            >
              <span className="grid size-5 shrink-0 place-items-center rounded-full border border-current/25 text-[0.62rem] font-semibold">
                {LETTERS[optionIndex]}
              </span>
              <span className="leading-snug">{option}</span>
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="mt-3 animate-fade">
          {isCorrect ? (
            <p className="rounded-lg border border-success/35 bg-success-soft px-3 py-2 text-[0.8rem] leading-relaxed text-success-ink">
              {question.explanation}
            </p>
          ) : (
            <FeedbackCard
              misconception={question.misconception}
              explanation={question.explanation}
              at={question.at}
              onRewatch={onRewatch}
            />
          )}
        </div>
      )}
    </div>
  );
}
