import { Check, Play, Rewind } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Decorative product preview for the hero.
 *
 * It is intentionally built from plain markup so it can be replaced later by a
 * real screenshot without touching the hero layout: swap the inner card for an
 * <Image src="/hero-course.png" … /> and keep the wrapper (tilt, glow, mask).
 */
const CURRICULUM = [
  { title: "Why Python", meta: "2 sections", state: "done" },
  { title: "Core types", meta: "2 sections", state: "active" },
  { title: "Control flow", meta: "2 sections", state: "todo" },
  { title: "Functions", meta: "1 section", state: "todo" },
] as const;

export function CoursePreview() {
  return (
    <div aria-hidden className="relative mx-auto mt-12 w-full max-w-4xl">
      {/* Accent bloom behind the mockup with rich purple-violet gradient */}
      <div className="pointer-events-none absolute inset-x-4 -top-8 h-48 rounded-full bg-gradient-to-r from-[#7b50fd]/30 via-[#a865fb]/25 to-[#c084fc]/20 blur-3xl sm:inset-x-16" />

      <div className="preview-fade relative px-1">
        <div className="gradient-border-card relative -rotate-[0.8deg] overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_40px_90px_-40px_rgba(123,80,253,0.35)] sm:-rotate-[1.4deg]">
          {/* Window chrome */}
          <div className="flex items-center gap-3 border-b border-border/70 bg-secondary/40 px-4 py-2.5">
            <span className="flex shrink-0 gap-1.5">
              <span className="size-2 rounded-full bg-foreground/15" />
              <span className="size-2 rounded-full bg-foreground/15" />
              <span className="size-2 rounded-full bg-foreground/15" />
            </span>
            <span className="mx-auto truncate rounded-full border border-border/70 bg-background/60 px-3 py-0.5 text-[0.6rem] text-muted-foreground">
              freedemy.app/course/python-fundamentals
            </span>
          </div>

          <div className="grid md:grid-cols-[1.65fr_1fr]">
            {/* Video + feedback */}
            <div className="flex flex-col gap-3 p-3 sm:p-4">
              <div className="relative aspect-video overflow-hidden rounded-xl bg-[#0d1018] ring-1 ring-white/10">
                <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_18%_0%,#2a3049_0%,#131722_55%,#0a0c12_100%)]" />

                <span className="absolute top-2.5 left-3 rounded bg-black/45 px-1.5 py-0.5 text-[0.55rem] font-medium tracking-wide text-white/80 uppercase">
                  Lecture 04 · Functions
                </span>

                <span className="absolute inset-0 grid place-items-center">
                  <span className="grid size-11 place-items-center rounded-full bg-white/10 ring-1 ring-white/25 backdrop-blur-sm">
                    <Play className="ml-0.5 size-4 fill-white/90 text-white/90" />
                  </span>
                </span>

                <div className="absolute inset-x-3 bottom-2.5 flex items-center gap-2">
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
                    <span className="block h-full w-[38%] rounded-full bg-gradient-to-r from-[#2753ff] via-[#6366f1] to-[#7c3aed] shadow-[0_0_8px_rgba(39,83,255,0.6)]" />
                  </span>
                  <span className="text-[0.55rem] font-medium text-white/70 tabular-nums">
                    04:38 / 12:10
                  </span>
                </div>
              </div>

              {/* Feedback card: the signature moment, so it overlaps the video. */}
              <div className="relative z-10 -mt-9 ml-auto w-[94%] rounded-xl border border-primary/30 bg-card/95 p-3 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.8)] backdrop-blur sm:-mt-10 sm:w-[88%] sm:p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold">
                    <span className="grid size-4 place-items-center rounded-full bg-warning-soft text-warning-ink">
                      <span className="text-[0.55rem] leading-none">!</span>
                    </span>
                    Not quite
                  </span>
                  <span className="text-[0.6rem] text-muted-foreground tabular-nums">
                    Question 2 of 5
                  </span>
                </div>

                <p className="mt-1.5 text-[0.68rem] leading-relaxed text-muted-foreground">
                  Assignment binds a second name to the same list — it never copies it.
                </p>

                <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[0.66rem] font-semibold text-primary">
                  <Rewind className="size-3" aria-hidden />
                  Rewatch 04:12
                </span>
              </div>
            </div>

            {/* Curriculum sidebar */}
            <aside className="border-t border-border/70 p-3 sm:p-4 md:border-t-0 md:border-l">
              <div className="flex items-center justify-between">
                <p className="text-[0.66rem] font-semibold tracking-wide text-muted-foreground uppercase">
                  Curriculum
                </p>
                <span className="text-[0.6rem] text-muted-foreground tabular-nums">4 chapters</span>
              </div>

              <ul className="mt-2.5 space-y-1">
                {CURRICULUM.map((item, index) => (
                  <li
                    key={item.title}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2 py-1.5",
                      item.state === "active" && "bg-primary/10 ring-1 ring-primary/25",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded-full text-[0.5rem] font-semibold",
                        item.state === "done" && "bg-primary/20 text-primary",
                        item.state === "active" && "bg-primary text-primary-foreground",
                        item.state === "todo" && "border border-border text-muted-foreground",
                      )}
                    >
                      {item.state === "done" ? (
                        <Check className="size-2.5" aria-hidden />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span
                      className={cn(
                        "truncate text-[0.68rem]",
                        item.state === "active"
                          ? "font-semibold text-foreground"
                          : "text-foreground/70",
                      )}
                    >
                      {item.title}
                    </span>
                    <span className="ml-auto hidden text-[0.55rem] text-muted-foreground sm:inline">
                      {item.meta}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 rounded-lg border border-border/70 bg-background/40 p-2.5">
                <div className="flex items-center justify-between text-[0.58rem] text-muted-foreground">
                  <span>Course progress</span>
                  <span className="font-medium text-foreground/80 tabular-nums">38%</span>
                </div>
                <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-foreground/10">
                  <span className="block h-full w-[38%] rounded-full bg-gradient-to-r from-[#2753ff] to-[#7c3aed]" />
                </span>
              </div>

              {/* Fills the sidebar on wide screens; hidden on mobile so the
                  preview stays compact where space is tight. */}
              <div className="mt-3 hidden rounded-lg border border-border/70 bg-background/40 p-2.5 sm:block">
                <p className="text-[0.55rem] font-semibold tracking-wide text-muted-foreground uppercase">
                  Note · 04:12
                </p>
                <p className="mt-1 text-[0.6rem] leading-relaxed text-foreground/65">
                  Names point at objects — b = a copies the reference, not the list.
                </p>
              </div>

              <div className="mt-3 hidden items-start gap-2 rounded-lg border border-dashed border-border/70 bg-background/30 p-2.5 sm:flex">
                <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-primary" />
                <p className="text-[0.6rem] leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground/80">Tutor</span> · Why does
                  04:12 explain this question?
                </p>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
