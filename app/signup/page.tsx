import type { Metadata } from "next";

import { SignUpForm } from "@/components/auth/signup-form";
import { Brand } from "@/components/brand";

export const metadata: Metadata = { title: "Create an account" };
export const instant = false;

function safeNext(value: string | string[] | undefined): string {
  const next = Array.isArray(value) ? value[0] : value;
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/dashboard";
}

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const params = await searchParams;
  const next = safeNext(params.next);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-14">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Brand />
          <div>
            <h1 className="text-[1.25rem] font-semibold tracking-tight">Create your account</h1>
            <p className="mt-1 text-[0.82rem] text-muted-foreground">
              A display name, a password and a security question — everything stays on this
              machine.
            </p>
          </div>
        </div>

        <SignUpForm next={next} />
      </div>
    </main>
  );
}
