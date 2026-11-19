import type { Metadata } from "next";
import Link from "next/link";

import { RecoverForm } from "@/components/auth/recover-form";
import { Brand } from "@/components/brand";
import { adminDb } from "@/lib/storage";

export const metadata: Metadata = { title: "Recover your password" };
export const instant = false;

/**
 * Recovery by security question, in two server-rendered steps: pick the
 * account, then answer its question and set a new password. The question for
 * the chosen account is the only one ever sent to the browser.
 */
export default async function RecoverPage({ searchParams }: PageProps<"/recover">) {
  const params = await searchParams;
  const requested = typeof params.name === "string" ? params.name : "";

  const { data } = await adminDb()
    .from("users")
    .select("id, display_name, security_question")
    .order("created_at", { ascending: true });
  const accounts: { id: string; display_name: string; security_question: string }[] = data ?? [];

  const account = requested
    ? accounts.find(
        (row) => row.display_name.toLowerCase() === requested.toLowerCase(),
      )
    : undefined;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-14">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Brand />
          <div>
            <h1 className="text-[1.25rem] font-semibold tracking-tight">Recover access</h1>
            <p className="mt-1 text-[0.82rem] text-muted-foreground">
              {account
                ? `Answer the security question for ${account.display_name}.`
                : "Whose password do you need to reset?"}
            </p>
          </div>
        </div>

        {account ? (
          <RecoverForm name={account.display_name} question={account.security_question} />
        ) : accounts.length > 0 ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              {accounts.map((row) => (
                <Link
                  key={row.id}
                  href={`/recover?name=${encodeURIComponent(row.display_name)}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-[0.92rem] font-medium transition hover:border-primary/50 hover:bg-muted"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#2753ff] to-[#7c3aed] text-[0.85rem] font-semibold text-white">
                    {row.display_name.trim().slice(0, 1).toUpperCase() || "?"}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{row.display_name}</span>
                </Link>
              ))}
            </div>
            <p className="text-center text-[0.8rem] text-muted-foreground">
              <Link
                href="/login"
                className="font-medium text-primary underline underline-offset-4"
              >
                Back to sign in
              </Link>
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-[0.85rem] text-muted-foreground">No accounts on this machine.</p>
            <Link
              href="/signup"
              className="font-medium text-primary underline underline-offset-4"
            >
              Create an account
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
