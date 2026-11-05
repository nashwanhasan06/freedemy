"use client";

import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetPasswordAction } from "@/lib/actions/auth";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

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
          placeholder="Repeat it"
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
            Updating password…
          </>
        ) : (
          <>
            Set new password
            <ArrowRight className="size-4" />
          </>
        )}
      </Button>
    </form>
  );
}
