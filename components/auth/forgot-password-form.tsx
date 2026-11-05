"use client";

import { AlertCircle, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestPasswordResetAction } from "@/lib/actions/auth";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, null);

  if (state?.message) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <span className="grid size-11 place-items-center rounded-full bg-success-soft text-success-ink">
          <CheckCircle2 className="size-5" />
        </span>
        <p className="text-[0.9rem] leading-relaxed text-foreground">{state.message}</p>
        <Button
          variant="outline"
          className="mt-1 h-10"
          render={<Link href="/login" />}
          nativeButton={false}
        >
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[0.78rem] font-medium text-foreground">Email</span>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          className="h-11"
        />
      </label>

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
            Sending link…
          </>
        ) : (
          <>
            Send reset link
            <ArrowRight className="size-4" />
          </>
        )}
      </Button>

      <p className="text-center text-[0.8rem] text-muted-foreground">
        Remembered it?{" "}
        <Link
          href="/login"
          className="font-medium text-primary underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
