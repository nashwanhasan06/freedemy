"use client";

import { AlertCircle, ArrowRight, Link2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const YOUTUBE_URL =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

const SAMPLE_HREF = "/course/python-fundamentals";

const PLACEHOLDER = "Paste a YouTube link…";

function parseVideoId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.match(YOUTUBE_URL)?.[1] ?? null;
}

export function GenerateForm() {
  const router = useRouter();
  const formId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const errorId = `${formId}-error`;
  const hintId = `${formId}-hint`;

  const videoId = parseVideoId(value);
  const isEmpty = value.trim().length === 0;
  const showError = !videoId && !isEmpty && (touched || submitted);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);

    if (!videoId) {
      setTouched(true);
      inputRef.current?.focus();
      return;
    }

    router.push(`/generating?v=${videoId}`);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mx-auto w-full max-w-[640px]">
      {/* One composite control: the shell owns the border and the glow, the
          input is transparent, and the button shares the shell's corners so
          the two halves read as a single field. */}
      <div
        className={cn(
          "group/form relative flex flex-col gap-2 rounded-2xl border bg-card/90 backdrop-blur-md p-2 transition-all duration-300 sm:flex-row sm:items-center sm:gap-0 sm:p-0",
          "shadow-[0_20px_50px_-25px_rgba(123,80,253,0.35)] focus-within:ring-4 focus-within:ring-primary/20",
          showError
            ? "border-danger/60 focus-within:ring-danger/15"
            : "border-primary/30 hover:border-primary/50 focus-within:border-primary",
        )}
      >
        <div className="relative flex flex-1 items-center">
          <Link2
            className="pointer-events-none absolute left-4 size-4 text-muted-foreground transition-colors group-focus-within/form:text-primary"
            aria-hidden
          />
          <Input
            ref={inputRef}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setSubmitted(false);
            }}
            onBlur={() => setTouched(true)}
            placeholder={PLACEHOLDER}
            aria-label="YouTube course link"
            aria-invalid={showError || undefined}
            aria-describedby={showError ? errorId : hintId}
            className="h-12 border-0 bg-transparent pr-4 pl-11 text-base shadow-none placeholder:text-muted-foreground focus-visible:ring-0 sm:h-14 dark:bg-transparent"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <Button
          type="submit"
          disabled={isEmpty}
          className="cta-glow h-12 shrink-0 gap-2 rounded-xl bg-gradient-to-r from-[#2753ff] via-[#4f46e5] to-[#7c3aed] px-6 text-[0.92rem] font-semibold text-white shadow-lg transition-all duration-300 hover:brightness-110 disabled:bg-none disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:opacity-100 sm:h-14 sm:w-[204px] sm:rounded-l-none sm:rounded-r-2xl"
        >
          Generate course
          <ArrowRight className="size-4 transition-transform group-hover/button:translate-x-0.5" />
        </Button>
      </div>

      {showError ? (
        <p
          id={errorId}
          role="alert"
          className="mt-3 flex items-start gap-1.5 text-left text-[0.78rem] text-danger"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            That isn&apos;t a YouTube video link. Paste one like
            youtube.com/watch?v=… or youtu.be/…
          </span>
        </p>
      ) : (
        <p id={hintId} className="sr-only">
          Paste the link to a public YouTube lecture, then choose Generate course.
        </p>
      )}

      <div className="mt-4 flex flex-col items-center gap-2 text-center">
        <p className="text-[0.82rem] text-muted-foreground">
          No link?{" "}
          <Link
            href={SAMPLE_HREF}
            className="font-medium text-primary underline underline-offset-4 transition-colors hover:text-primary-deep dark:hover:text-foreground"
          >
            Try a sample course
          </Link>
        </p>

        <p className="max-w-[460px] text-[0.78rem] leading-relaxed text-foreground/65">
          Public videos with captions work best. No account needed. Progress is saved
          locally.
        </p>
      </div>
    </form>
  );
}
