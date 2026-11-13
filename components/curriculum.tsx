"use client";

import { useMemo, useState } from "react";

import { CheckCircle2, Circle, ClipboardList, Lock, Play, ShieldCheck } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { chapterLength, courseLessons } from "@/lib/course";
import { formatLength } from "@/lib/format";
import { CHAPTER_EXAM_PASS, type Locks } from "@/lib/locks";
import type { Course, GradeMap, QuizProgressMap } from "@/lib/types";
import { cn } from "@/lib/utils";

type CurriculumProps = {
  course: Course;
  activeLessonId: string;
  grades: GradeMap;
  locks: Locks;
  quizzes: QuizProgressMap;
  onSelect: (lessonId: string) => void;
  /** Opens a chapter's end exam. */
  onExam: (chapterId: string) => void;
};

export function Curriculum({
  course,
  activeLessonId,
  grades,
  locks,
  quizzes,
  onSelect,
  onExam,
}: CurriculumProps) {
  const chapterIds = useMemo(
    () => course.chapters.map((chapter) => chapter.id),
    [course.chapters],
  );

  // Controlled open state: an uncontrolled `defaultValue` re-serialized on
  // every refresh trips Base UI's "changed the default value" warning as soon
  // as the chapter list differs — a course switch or a build writing a new
  // chapter. Sections start expanded so a deep link to any lesson is visible
  // immediately; ids that vanish are dropped and newly written chapters join
  // expanded, while a student's own toggles survive a refresh. The chapter
  // list is reconciled during render (react.dev: storing information from
  // previous renders) rather than in an effect.
  const [openIds, setOpenIds] = useState<string[]>(chapterIds);
  const [prevChapterIds, setPrevChapterIds] = useState(chapterIds);
  if (prevChapterIds !== chapterIds) {
    const known = new Set(chapterIds);
    const kept = openIds.filter((id) => known.has(id));
    const added = chapterIds.filter((id) => !openIds.includes(id));
    setPrevChapterIds(chapterIds);
    setOpenIds(
      kept.length === openIds.length && added.length === 0
        ? openIds
        : [...kept, ...added],
    );
  }

  return (
    <Accordion
      value={openIds}
      onValueChange={(next) => setOpenIds(next as string[])}
      className="w-full"
    >
      {course.chapters.map((chapter, index) => {
        const chapterLessons = chapter.lessons;
        // "complete" should mean passed, not just attempted — a 55% score isn't done.
        const mastered =
          chapterLessons.length > 0 &&
          chapterLessons.every((lesson) => (grades[lesson.id]?.score ?? 0) >= 70);
        const sealed = locks.rigorous && !locks.chapterUnlocked(index);
        const exam = locks.examState(index);
        const bestScore = quizzes[chapter.id]?.bestScore ?? 0;

        return (
          <AccordionItem key={chapter.id} value={chapter.id} className="border-border/80">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <span className="flex min-w-0 flex-col gap-0.5 pr-2">
                <span className="flex items-center gap-2 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
                  Chapter {index + 1}
                  {sealed && <Lock className="size-3" aria-label="Sealed chapter" />}
                  {chapter.written && course.status !== "ready" && (
                    <span className="text-[0.6rem] text-success-ink normal-case">written</span>
                  )}
                  {mastered && (
                    <span className="text-[0.6rem] text-primary normal-case">complete</span>
                  )}
                  {exam === "passed" && (
                    <span className="text-[0.6rem] text-success-ink normal-case">exam passed</span>
                  )}
                </span>
                <span className="text-[0.86rem] leading-snug font-medium text-foreground">
                  {chapter.title}
                </span>
                <span className="text-[0.7rem] font-normal text-muted-foreground">
                  {chapterLessons.length} lesson{chapterLessons.length === 1 ? "" : "s"} ·{" "}
                  {formatLength(chapterLength(chapter))}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-2">
              <ul className="flex flex-col">
                {chapterLessons.map((lesson) => {
                  const grade = grades[lesson.id];
                  const isActive = lesson.id === activeLessonId;
                  const locked = locks.rigorous && !locks.lessonUnlocked(lesson.id);

                  return (
                    <li key={lesson.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(lesson.id)}
                        aria-current={isActive ? "true" : undefined}
                        title={
                          locked
                            ? "Locked — pass the previous section's assignment to open it"
                            : undefined
                        }
                        className={cn(
                          "group flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors",
                          isActive
                            ? "border-l-2 border-primary bg-accent/70"
                            : "border-l-2 border-transparent hover:bg-muted/70",
                          locked && !isActive && "opacity-70",
                        )}
                      >
                        <span className="mt-0.5 shrink-0">
                          {locked ? (
                            <Lock className="size-4 text-muted-foreground/70" />
                          ) : grade ? (
                            <CheckCircle2 className="size-4 text-primary" />
                          ) : isActive ? (
                            <Play className="size-4 fill-primary text-primary" />
                          ) : (
                            <Circle className="size-4 text-muted-foreground/45" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block text-[0.82rem] leading-snug",
                              isActive
                                ? "font-medium text-accent-foreground"
                                : locked
                                  ? "text-muted-foreground"
                                  : "text-foreground/85",
                            )}
                          >
                            {lesson.title}
                          </span>
                          <span className="mt-0.5 flex items-center gap-2 text-[0.68rem] text-muted-foreground tabular-nums">
                            {formatLength(lesson.end - lesson.start)}
                            {locked ? " · locked" : grade ? " · attempted" : ""}
                          </span>
                        </span>
                        {grade && !locked && <ScoreBadge score={grade.score} />}
                      </button>
                    </li>
                  );
                })}

                <li>
                    <ExamRow
                      state={exam}
                      bestScore={bestScore}
                      rigorous={locks.rigorous}
                      disabled={exam === "locked"}
                      onClick={() => onExam(chapter.id)}
                    />
                  </li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        );
      })}

      <p className="px-4 py-3 text-[0.7rem] text-muted-foreground">
        {courseLessons(course).length} sections total
      </p>
    </Accordion>
  );
}

function ExamRow({
  state,
  bestScore,
  rigorous,
  disabled,
  onClick,
}: {
  state: "locked" | "available" | "passed";
  bestScore: number;
  /** With rigorous mode off the exam never gates anything — copy says so. */
  rigorous: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const passed = state === "passed";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={
        state === "locked"
          ? "Pass every section of this chapter first"
          : rigorous
            ? `Score ${CHAPTER_EXAM_PASS}% or higher to open the next chapter`
            : `Score ${CHAPTER_EXAM_PASS}% or higher · unlimited retakes`
      }
      className={cn(
        "group flex w-full items-center gap-2.5 border-l-2 px-4 py-2.5 text-left transition-colors",
        disabled
          ? "cursor-default border-transparent opacity-60"
          : "border-transparent hover:bg-muted/70",
        passed && "border-transparent",
      )}
    >
      <span className="mt-0.5 shrink-0">
        {passed ? (
          <ShieldCheck className="size-4 text-success-ink" />
        ) : state === "available" ? (
          <ClipboardList className="size-4 text-primary" />
        ) : (
          <Lock className="size-4 text-muted-foreground/70" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[0.82rem] leading-snug",
            state === "available" ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          Chapter end exam
        </span>
        <span className="mt-0.5 block text-[0.68rem] text-muted-foreground tabular-nums">
          {passed
            ? `cleared · best ${bestScore}%`
            : state === "locked"
              ? "pass every section first"
              : rigorous
                ? `pass ${CHAPTER_EXAM_PASS}% to open the next chapter`
                : `pass ${CHAPTER_EXAM_PASS}% · unlimited retakes`}
        </span>
      </span>
      {passed && (
        <Badge
          variant="ghost"
          className="mt-0.5 h-5 shrink-0 rounded-none bg-success-soft px-0 text-[0.65rem] font-semibold tabular-nums text-success-ink"
        >
          {bestScore}%
        </Badge>
      )}
    </button>
  );
}

export function ScoreBadge({ score, className }: { score: number; className?: string }) {
  const strong = score >= 70;
  return (
    <Badge
      variant="ghost"
      className={cn(
        "mt-0.5 h-5 shrink-0 rounded-none bg-transparent px-0 text-[0.65rem] font-semibold tabular-nums",
        strong ? "bg-success-soft text-success-ink" : "bg-warning-soft text-warning-ink",
        className,
      )}
    >
      {score}%
    </Badge>
  );
}
