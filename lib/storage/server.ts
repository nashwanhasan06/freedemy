/**
 * The cookie-bound entry point of the storage layer: `userDb()` resolves the
 * session from the request cookie and returns a client whose every query is
 * automatically scoped to that user — the replacement for Supabase's
 * row-level security. Anonymous requests get a client that reads nothing and
 * writes nothing, exactly like the old anon role.
 */
import "server-only";

import { cookies } from "next/headers";

import { SESSION_COOKIE, verifySession } from "@/lib/auth/crypto";
import { userDbFor, type DbClient } from "./index";

/** The signed-in user's scoped client (null scope when signed out). */
export async function userDb(): Promise<DbClient> {
  const store = await cookies();
  const userId = verifySession(store.get(SESSION_COOKIE)?.value);
  return userDbFor(userId);
}
