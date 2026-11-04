"use client";

import { ArrowRight, MessageSquare, Sparkles } from "lucide-react";
import Link from "next/link";

export function TutorCta({ href, lessonTitle }: { href: string; lessonTitle: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
            <Sparkles className="size-5" />
          </span>
          <div>
            <p className="flex items-center gap-1.5 text-[0.92rem] font-semibold">
              Assignment tutor
            </p>
            <p className="mt-0.5 max-w-md text-[0.8rem] leading-relaxed text-muted-foreground">
              A full chat page for “{lessonTitle}”. It knows this section&apos;s notes, quiz and
              coding tasks, points back to the moment in the video, and keeps the conversation so
              you can pick it up later.
            </p>
          </div>
        </div>

        <Link
          href={href}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-[0.82rem] font-medium text-primary-foreground transition-colors hover:bg-primary-deep"
        >
          <MessageSquare className="size-4" />
          Open the tutor
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
