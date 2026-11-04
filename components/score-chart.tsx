import { cn } from "@/lib/utils";

export type ScoreDatum = {
  id: string;
  label: string;
  score: number | null;
};

export function ScoreChart({ data }: { data: ScoreDatum[] }) {
  const attempted = data.filter((item) => item.score !== null);
  const average =
    attempted.length === 0
      ? null
      : Math.round(
          attempted.reduce((sum, item) => sum + (item.score ?? 0), 0) / attempted.length,
        );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[0.7rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Score per section
        </p>
        <p className="text-[0.72rem] text-muted-foreground">
          {average === null ? "No attempts yet" : `${average}% average`}
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        {data.map((item) => {
          const value = item.score;
          const strong = value !== null && value >= 70;

          return (
            <div key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
              <span className="truncate text-[0.78rem] text-foreground/80">{item.label}</span>
              <span
                className={cn(
                  "text-[0.72rem] font-medium tabular-nums",
                  value === null ? "text-muted-foreground/70" : "text-foreground",
                )}
              >
                {value === null ? "—" : `${value}%`}
              </span>
              <div className="col-span-2 h-2 overflow-hidden rounded-full bg-muted">
                {value === null ? (
                  <div className="h-full w-full bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,var(--color-border)_4px,var(--color-border)_8px)] opacity-60" />
                ) : (
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-700",
                      strong ? "bg-primary" : "bg-warning",
                    )}
                    style={{ width: `${Math.max(3, value)}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
