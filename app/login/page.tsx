import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";
import { Brand } from "@/components/brand";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };
export const instant = false;

function safeNext(value: string | string[] | undefined): string {
  const next = Array.isArray(value) ? value[0] : value;
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/dashboard";
}

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(params.next);

  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-16">
        <SetupNotice />
      </main>
    );
  }

  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-14">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Brand />
          <div>
            <h1 className="text-[1.25rem] font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-[0.82rem] text-muted-foreground">
              Your notes, marks and tutor conversations are waiting.
            </p>
          </div>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[0.78rem] text-danger-ink">
            {error}
          </p>
        )}

        <AuthForm mode="signin" next={next} />
      </div>
    </main>
  );
}
