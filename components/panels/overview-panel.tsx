"use client";

import { Clock3, ExternalLink, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatClock, formatLength } from "@/lib/format";
import type { Lesson } from "@/lib/types";

type OverviewPanelProps = {
  lesson: Lesson;
  onRewatch: (at: number) => void;
  videoSource?: {
    videoId: string;
    channel: string;
  };
};

export function OverviewPanel({ lesson, onRewatch, videoSource }: OverviewPanelProps) {
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

            {videoSource && (
              <a
                href={`https://www.youtube.com/watch?v=${videoSource.videoId}`}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center justify-between gap-2 rounded-lg border border-border/80 bg-background/50 px-3 py-2 text-[0.74rem] text-muted-foreground transition-all duration-200 hover:border-border hover:bg-accent/40 hover:text-foreground"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="flex size-2 rounded-full bg-red-500/80" />
                  <span className="truncate">
                    Source lecture · <strong className="font-medium text-foreground">{videoSource.channel}</strong>
                  </span>
                </div>
                <ExternalLink className="size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
              </a>
            )}
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
