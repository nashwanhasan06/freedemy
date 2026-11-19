"use client";

import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signUpAction } from "@/lib/actions/auth";

/** Display name + password + security question. No email field exists. */
export function SignUpForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signUpAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      <label className="flex flex-col gap-1.5">
        <span className="text-[0.78rem] font-medium text-foreground">Display name</span>
        <Input
          name="name"
          autoComplete="nickname"
          required
          maxLength={60}
          placeholder="Ada Lovelace"
          className="h-11"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[0.78rem] font-medium text-foreground">Password</span>
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="At least 8 characters"
          className="h-11"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[0.78rem] font-medium text-foreground">Confirm password</span>
        <Input
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="Type it again"
          className="h-11"
        />
      </label>

      <div className="mt-1 rounded-xl border border-border bg-muted/40 p-3">
        <p className="mb-3 text-[0.78rem] font-medium text-foreground">
          Password recovery — no email needed
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.75rem] text-muted-foreground">Security question</span>
          <Input
            name="question"
            required
            placeholder="e.g. Anniversary date?"
            className="h-10"
          />
        </label>
        <label className="mt-2.5 flex flex-col gap-1.5">
          <span className="text-[0.75rem] text-muted-foreground">Your answer</span>
          <Input name="answer" required placeholder="e.g. 7th November" className="h-10" />
        </label>
      </div>

      {state?.error && (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[0.78rem] text-danger-ink"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="cta-glow h-11 gap-2 bg-gradient-to-r from-[#2753ff] via-[#4f46e5] to-[#7c3aed] text-white"
      >
        {pending ? (
          <>
            <Loader2 className="animate-spin" />
            Creating your account…
          </>
        ) : (
          <>
            Create account
            <ArrowRight className="size-4" />
          </>
        )}
      </Button>

      <p className="text-center text-[0.8rem] text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={`/login${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-primary underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
