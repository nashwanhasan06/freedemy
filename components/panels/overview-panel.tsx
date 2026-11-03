"use client";

import { Clock3, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatClock, formatLength } from "@/lib/format";
import type { Lesson } from "@/lib/types";

type OverviewPanelProps = {
  lesson: Lesson;
  onRewatch: (at: number) => void;
};

export function OverviewPanel({ lesson, onRewatch }: OverviewPanelProps) {
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-[0.95rem]">What this section covers</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[0.9rem] leading-relaxed text-muted-foreground">
              {lesson.summary}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-[0.95rem]">Key terms</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {lesson.keyTerms.map((term) => (
              <div key={term.term} className="flex flex-col gap-0.5 border-l-2 border-primary/25 pl-3">
                <p className="text-[0.84rem] font-semibold text-foreground">{term.term}</p>
                <p className="text-[0.82rem] leading-relaxed text-muted-foreground">
                  {term.definition}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-[0.8rem] uppercase tracking-wide text-muted-foreground">
              In the video
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-[0.85rem] tabular-nums">
              <Clock3 className="size-4 text-primary" />
              <span className="font-medium">
                {formatClock(lesson.start)} – {formatClock(lesson.end)}
              </span>
            </div>
            <p className="text-[0.78rem] text-muted-foreground">
              {formatLength(lesson.end - lesson.start)} of the original lecture, played from
              the timestamp above.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-full justify-center gap-1.5"
              onClick={() => onRewatch(lesson.start)}
            >
              <Play className="size-3.5 fill-primary text-primary" />
              Rewatch from start
            </Button>
          </CardContent>
        </Card>

        <Card size="sm" className="bg-muted/40 ring-border/60">
          <CardContent className="pt-4">
            <p className="text-[0.78rem] leading-relaxed text-muted-foreground">
              Everything on this page comes from this section only — not the full video.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
