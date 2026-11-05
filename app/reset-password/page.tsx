import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Brand } from "@/components/brand";
import { SetupNotice } from "@/components/setup-notice";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Choose a new password" };
export const instant = false;

export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-16">
        <SetupNotice />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-14">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Brand />
          <div>
            <h1 className="text-[1.25rem] font-semibold tracking-tight">
              Choose a new password
            </h1>
            <p className="mt-1 text-[0.82rem] text-muted-foreground">
              {token
                ? "Pick a new password for your account — you'll be signed in right after."
                : "This reset link looks incomplete or has expired."}
            </p>
          </div>
        </div>

        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <span className="grid size-11 place-items-center rounded-full bg-danger-soft text-danger-ink">
              <AlertCircle className="size-5" />
            </span>
            <p className="text-[0.87rem] leading-relaxed text-foreground">
              Reset links work once and expire after an hour. Request a fresh one
              and use it right away.
            </p>
            <Button
              variant="outline"
              className="mt-1 h-10"
              render={<Link href="/forgot-password" />}
              nativeButton={false}
            >
              Request a new link
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
