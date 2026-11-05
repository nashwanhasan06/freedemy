import "server-only";

import { redirect } from "next/navigation";

import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
  name: string;
};

/**
 * Resolves the signed-in user from the auth cookie. `getUser()` verifies the
 * token with Supabase instead of trusting the cookie contents.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const name =
    (profile?.full_name as string | null) ||
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split("@")[0] ||
    "Student";

  return { id: user.id, email: user.email ?? null, name };
}

/** Use in pages and server actions that must not render for anonymous users. */
export async function requireUser(nextPath?: string): Promise<CurrentUser> {
  if (!isSupabaseConfigured()) {
    redirect("/setup");
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  }
  return user;
}

export function displayName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
