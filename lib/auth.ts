import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, verifySession } from "@/lib/auth/crypto";
import { adminDb } from "@/lib/storage";

export type CurrentUser = {
  id: string;
  email: string | null;
  name: string;
};

/**
 * Resolves the signed-in user from the session cookie. The cookie is
 * HMAC-verified (see `lib/auth/crypto.ts`) and the account must still exist
 * in the local `users` table — a forged or stale cookie resolves to null.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const userId = verifySession(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;

  const { data } = await adminDb()
    .from("users")
    .select("id, display_name")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;

  return { id: data.id, email: null, name: data.display_name };
}

/** Use in pages and server actions that must not render for anonymous users. */
export async function requireUser(nextPath?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  }
  return user;
}

export function displayName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
