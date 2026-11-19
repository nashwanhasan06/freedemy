"use client";

import { AlertCircle, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInAction } from "@/lib/actions/auth";

function initial(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

/**
 * Sign-in as clickable account cards. Picking one reveals a password prompt
 * for that account — no email, no username typing.
 */
export function AccountPicker({
  accounts,
  next,
}: {
  accounts: { id: string; name: string }[];
  next: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(signInAction, null);

  if (selected) {
    return (
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="name" value={selected} />

        <button
          type="button"
          onClick={() => setSelected(null)}
          className="inline-flex items-center gap-1.5 self-start text-[0.78rem] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          All accounts
        </button>

        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#2753ff] to-[#7c3aed] text-[0.95rem] font-semibold text-white">
            {initial(selected)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[0.92rem] font-medium">{selected}</p>
            <p className="text-[0.75rem] text-muted-foreground">Enter your password</p>
          </div>
        </div>

        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          placeholder="••••••••"
          className="h-11"
        />

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
              Signing in…
            </>
          ) : (
            <>
              Sign in
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>

        <p className="text-center text-[0.78rem] text-muted-foreground">
          <Link
            href={`/recover?name=${encodeURIComponent(selected)}`}
            className="underline underline-offset-4 hover:text-primary"
          >
            Forgot password?
          </Link>
        </p>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {accounts.map((account) => (
          <button
            key={account.id}
            type="button"
            onClick={() => setSelected(account.name)}
            className="group flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-left transition hover:border-primary/50 hover:bg-muted"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#2753ff] to-[#7c3aed] text-[0.95rem] font-semibold text-white">
              {initial(account.name)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[0.92rem] font-medium">
              {account.name}
            </span>
            <ArrowRight className="size-4 text-muted-foreground transition group-hover:text-primary" />
          </button>
        ))}
      </div>

      <p className="text-center text-[0.8rem] text-muted-foreground">
        New to Freedemy?{" "}
        <Link
          href={`/signup${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-primary underline underline-offset-4"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
