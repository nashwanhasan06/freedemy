"use client";

import { AlertCircle, ArrowRight, Link2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCourseAction } from "@/lib/actions/courses";
import { cn } from "@/lib/utils";

const PLACEHOLDER = "Paste a coding lecture link…";

export function GenerateForm({
  signedIn,
  initialUrl = "",
}: {
  signedIn: boolean;
  /** Restored after the visitor signs in, so a pasted link is not lost. */
  initialUrl?: string;
}) {
  const formId = useId();
  const router = useRouter();
  const [value, setValue] = useState(initialUrl);
  const [state, formAction, pending] = useActionState(createCourseAction, null);

  const errorId = `${formId}-error`;
  const hintId = `${formId}-hint`;

  const isEmpty = value.trim().length === 0;
  const showError = Boolean(state?.error);

  // Building needs an account, and the action enforces that server-side too.
  // Visitors are sent to sign in first, with their link and this spot on the
  // page carried along so they land back here and can press Generate again.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (signedIn) return;
    event.preventDefault();
    const pasted = value.trim();
    const back = pasted ? `/?url=${encodeURIComponent(pasted)}#paste` : "/#paste";
    router.push(`/login?next=${encodeURIComponent(back)}`);
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="mx-auto w-full max-w-[640px]">
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
            name="url"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={PLACEHOLDER}
            aria-label="YouTube coding lecture link"
            aria-invalid={showError || undefined}
            aria-describedby={showError ? errorId : hintId}
            className="h-12 border-0 bg-transparent pr-4 pl-11 text-base shadow-none placeholder:text-muted-foreground focus-visible:ring-0 sm:h-14 dark:bg-transparent"
            autoComplete="off"
            spellCheck={false}
            required
          />
        </div>

        <Button
          type="submit"
          disabled={isEmpty || pending}
          className="cta-glow h-12 shrink-0 gap-2 rounded-xl bg-gradient-to-r from-[#2753ff] via-[#4f46e5] to-[#7c3aed] px-6 text-[0.92rem] font-semibold text-white shadow-lg transition-all duration-300 hover:brightness-110 disabled:bg-none disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:opacity-100 sm:h-14 sm:w-[214px] sm:rounded-l-none sm:rounded-r-2xl"
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Starting…
            </>
          ) : (
            <>
              Generate course
              <ArrowRight className="size-4 transition-transform group-hover/button:translate-x-0.5" />
            </>
          )}
        </Button>
      </div>

      {showError ? (
        <p
          id={errorId}
          role="alert"
          className="mt-3 flex items-start gap-1.5 text-left text-[0.78rem] text-danger"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>{state?.error}</span>
        </p>
      ) : (
        <p id={hintId} className="sr-only">
          Paste the link to a public YouTube lecture on coding or computer science, then choose
          Generate course.
        </p>
      )}

      <div className="mt-4 flex flex-col items-center gap-2 text-center">
        <p className="max-w-[480px] text-[0.78rem] leading-relaxed text-foreground/65">
          Coding and computer-science lectures only. Public videos with captions work best. Your
          notes, marks and tutor conversations are saved to your account.
        </p>
      </div>
    </form>
  );
}
