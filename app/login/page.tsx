import type { Metadata } from "next";
import Link from "next/link";

import { AccountPicker } from "@/components/auth/account-picker";
import { Brand } from "@/components/brand";
import { adminDb } from "@/lib/storage";

export const metadata: Metadata = { title: "Sign in" };
export const instant = false;

function safeNext(value: string | string[] | undefined): string {
  const next = Array.isArray(value) ? value[0] : value;
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/dashboard";
}

/**
 * The account picker: every local account is a card, and clicking one asks
 * only for that account's password. There is no email field anywhere.
 */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(params.next);

  const { data } = await adminDb()
    .from("users")
    .select("id, display_name")
    .order("created_at", { ascending: true });
  const rows: { id: string; display_name: string }[] = data ?? [];
  const accounts = rows.map((row) => ({ id: row.id, name: row.display_name }));

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-14">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Brand />
          <div>
            <h1 className="text-[1.25rem] font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-[0.82rem] text-muted-foreground">
              {accounts.length > 0
                ? "Pick your account — your notes, marks and tutor conversations are waiting."
                : "No accounts on this machine yet."}
            </p>
          </div>
        </div>

        {accounts.length > 0 ? (
          <AccountPicker accounts={accounts} next={next} />
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-[0.85rem] leading-relaxed text-muted-foreground">
              Create the first account to start building courses.
            </p>
            <Link
              href={`/signup${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`}
              className="cta-glow inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-[#2753ff] via-[#4f46e5] to-[#7c3aed] px-6 text-[0.9rem] font-medium text-white"
            >
              Create an account
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
