import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { Brand } from "@/components/brand";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Reset your password" };
export const instant = false;

export default function ForgotPasswordPage() {
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
              Forgot your password?
            </h1>
            <p className="mt-1 text-[0.82rem] text-muted-foreground">
              Enter your email and we&rsquo;ll send you a link to choose a new one.
            </p>
          </div>
        </div>

        <ForgotPasswordForm />
      </div>
    </main>
  );
}
