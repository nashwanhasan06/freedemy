import { ArrowUpRight, Target } from "lucide-react";
import Link from "next/link";

import type { ScoreDatum } from "@/components/score-chart";

export type WeakTopic = ScoreDatum & {
  courseSlug: string;
  lessonId: string;
};

export function WeakTopics({ items }: { items: WeakTopic[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/60 p-4 text-[0.8rem] text-muted-foreground">
        Nothing weak yet — submit an assignment and any topic under 70% will show up here.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        <Target className="size-3" />
        Weak topics
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Link
            key={`${item.courseSlug}-${item.lessonId}`}
            href={`/course/${item.courseSlug}#lesson-${item.lessonId}`}
            className="group inline-flex items-center gap-1.5 rounded-full border border-warning/35 bg-warning-soft py-1 pr-2 pl-2.5 text-[0.75rem] text-warning-ink transition-colors hover:border-warning/60 hover:bg-warning/15"
          >
            <span className="max-w-52 truncate">{item.label}</span>
            <span className="rounded-full bg-warning/25 px-1.5 text-[0.65rem] font-semibold tabular-nums">
              {item.score}%
            </span>
            <ArrowUpRight className="size-3 opacity-50 transition-opacity group-hover:opacity-100" />
          </Link>
        ))}
      </div>
    </div>
  );
}
