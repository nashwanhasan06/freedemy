"use client";

import { CheckCircle2, Circle, Play } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { chapterLength, courseLessons } from "@/lib/course";
import { formatLength } from "@/lib/format";
import type { Course, GradeMap } from "@/lib/types";
import { cn } from "@/lib/utils";

type CurriculumProps = {
  course: Course;
  activeLessonId: string;
  grades: GradeMap;
  onSelect: (lessonId: string) => void;
};

export function Curriculum({ course, activeLessonId, grades, onSelect }: CurriculumProps) {
  return (
    <Accordion
      // Sections start expanded so a deep link to any lesson is visible immediately.
      defaultValue={course.chapters.map((chapter) => chapter.id)}
      className="w-full"
    >
      {course.chapters.map((chapter, index) => {
        const chapterLessons = chapter.lessons;
        // "complete" should mean passed, not just attempted — a 55% score isn't done.
        const mastered =
          chapterLessons.length > 0 &&
          chapterLessons.every((lesson) => (grades[lesson.id]?.score ?? 0) >= 70);

        return (
          <AccordionItem key={chapter.id} value={chapter.id} className="border-border/80">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <span className="flex min-w-0 flex-col gap-0.5 pr-2">
                <span className="flex items-center gap-2 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
                  Chapter {index + 1}
                  {mastered && (
                    <span className="text-[0.6rem] text-primary normal-case">complete</span>
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

                  return (
                    <li key={lesson.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(lesson.id)}
                        aria-current={isActive ? "true" : undefined}
                        className={cn(
                          "group flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors",
                          isActive
                            ? "border-l-2 border-primary bg-accent/70"
                            : "border-l-2 border-transparent hover:bg-muted/70",
                        )}
                      >
                        <span className="mt-0.5 shrink-0">
                          {grade ? (
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
                                : "text-foreground/85",
                            )}
                          >
                            {lesson.title}
                          </span>
                          <span className="mt-0.5 flex items-center gap-2 text-[0.68rem] text-muted-foreground tabular-nums">
                            {formatLength(lesson.end - lesson.start)}
                            {grade ? " · attempted" : ""}
                          </span>
                        </span>
                        {grade && <ScoreBadge score={grade.score} />}
                      </button>
                    </li>
                  );
                })}
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
