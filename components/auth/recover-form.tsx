"use client";

import { AlertCircle, ArrowLeft, ArrowRight, Loader2, ShieldQuestion } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recoverAction } from "@/lib/actions/auth";

/**
 * Step two of recovery: the account's security question, the answer, and the
 * new password. A correct answer signs the user in immediately.
 */
export function RecoverForm({ name, question }: { name: string; question: string }) {
  const [state, formAction, pending] = useActionState(recoverAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="name" value={name} />

      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
        <ShieldQuestion className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="truncate text-[0.85rem] font-medium">{name}</p>
          <p className="text-[0.8rem] leading-relaxed text-muted-foreground">{question}</p>
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[0.78rem] font-medium text-foreground">Your answer</span>
        <Input name="answer" required autoFocus placeholder="Type the answer" className="h-11" />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[0.78rem] font-medium text-foreground">New password</span>
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
        <span className="text-[0.78rem] font-medium text-foreground">Confirm new password</span>
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
            Resetting…
          </>
        ) : (
          <>
            Set new password
            <ArrowRight className="size-4" />
          </>
        )}
      </Button>

      <div className="flex items-center justify-between text-[0.78rem] text-muted-foreground">
        <Link
          href="/recover"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          All accounts
        </Link>
        <Link href="/login" className="hover:text-foreground">
          Back to sign in
        </Link>
      </div>
    </form>
  );
}
