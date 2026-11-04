"use client";

import { AlertTriangle, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";

type FeedbackCardProps = {
  misconception: string;
  explanation: string;
  at: number;
  onRewatch: (at: number) => void;
  onPractice?: () => void;
  className?: string;
};

export function FeedbackCard({
  misconception,
  explanation,
  at,
  onRewatch,
  onPractice,
  className,
}: FeedbackCardProps) {
  return (
    <div
      className={cn(
        "animate-pop relative overflow-hidden rounded-xl border border-warning/35 bg-warning-soft py-3.5 pr-4 pl-5",
        className,
      )}
    >
      <span className="absolute inset-y-0 left-0 w-[3px] bg-warning" aria-hidden />

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="size-3.5 text-warning-ink" />
          <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-warning-ink uppercase">
            Misconception
          </p>
        </div>

        <p className="text-[0.92rem] leading-snug font-semibold text-foreground">
          {misconception}
        </p>

        <p className="text-[0.83rem] leading-relaxed text-foreground/70">{explanation}</p>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => onRewatch(at)}
            className="h-8 gap-1.5 rounded-full px-3 text-[0.78rem]"
          >
            <span className="grid size-3.5 place-items-center">
              <svg viewBox="0 0 24 24" className="size-3 fill-current">
                <path d="M8 5v14l11-7L8 5Z" />
              </svg>
            </span>
            Rewatch {formatClock(at)}
          </Button>

          {onPractice && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onPractice}
              className="h-8 gap-1.5 px-2.5 text-[0.78rem] text-foreground/70 hover:text-foreground"
            >
              Try another question
              <ChevronRight className="size-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
