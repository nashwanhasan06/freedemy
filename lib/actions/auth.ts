"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { AuthState } from "@/lib/actions/types";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  hashSecret,
  normalizeAnswer,
  signSession,
  verifySecret,
} from "@/lib/auth/crypto";
import { adminDb } from "@/lib/storage";
import { ensureStarterCourses } from "@/lib/db/seed";

/**
 * Local accounts only: display name + password + a personal security
 * question. There is no email anywhere in this flow — recovery happens by
 * answering the question, and sessions are HMAC cookies signed by this app.
 */

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;

type UserRow = {
  id: string;
  display_name: string;
  password_hash: string;
  security_answer_hash: string;
  failed_attempts: number;
  locked_until: number | null;
};

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  if (next.startsWith("/") && !next.startsWith("//")) return next;
  return "/dashboard";
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

async function startSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, signSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    // No `secure`: the app runs on http://localhost.
  });
}

/** Lookup is case-insensitive — the column is `collate nocase`. */
async function findUser(name: string): Promise<UserRow | null> {
  const { data } = await adminDb()
    .from("users")
    .select("*")
    .eq("display_name", name)
    .maybeSingle();
  return (data as UserRow | null) ?? null;
}

function lockMessage(user: UserRow): string {
  const wait = Math.max(1, Math.ceil(((user.locked_until ?? 0) - Date.now()) / 1000));
  return `Too many failed attempts. Try again in ${wait} second${wait === 1 ? "" : "s"}.`;
}

/** Counts a wrong password/answer; 5 in a row locks the account for 30s. */
async function registerFailure(user: UserRow, message: string): Promise<string> {
  const failed = user.failed_attempts + 1;
  if (failed >= MAX_FAILED_ATTEMPTS) {
    await adminDb()
      .from("users")
      .update({ failed_attempts: 0, locked_until: Date.now() + LOCKOUT_MS })
      .eq("id", user.id);
    return `Too many failed attempts. Try again in ${Math.round(LOCKOUT_MS / 1000)} seconds.`;
  }
  await adminDb()
    .from("users")
    .update({ failed_attempts: failed })
    .eq("id", user.id);
  return message;
}

export async function signInAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  const name = field(formData, "name");
  const password = field(formData, "password");
  const next = safeNext(formData.get("next"));

  if (!name || !password) {
    return { error: "Pick an account and enter its password." };
  }

  const user = await findUser(name);
  if (!user) return { error: "That name and password don't match an account." };
  if (user.locked_until && user.locked_until > Date.now()) return { error: lockMessage(user) };

  if (!verifySecret(password, user.password_hash)) {
    return { error: await registerFailure(user, "That name and password don't match an account.") };
  }

  if (user.failed_attempts !== 0 || user.locked_until !== null) {
    await adminDb()
      .from("users")
      .update({ failed_attempts: 0, locked_until: null })
      .eq("id", user.id);
  }

  await startSession(user.id);
  redirect(next);
}

export async function signUpAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  const name = field(formData, "name");
  const password = field(formData, "password");
  const confirm = field(formData, "confirm");
  const question = field(formData, "question");
  const answer = field(formData, "answer");
  const next = safeNext(formData.get("next"));

  if (!name) return { error: "Tell us your name." };
  if (name.length > 60) return { error: "Use a shorter display name (60 characters max)." };
  if (password.length < 8) return { error: "Use at least 8 characters for your password." };
  if (password !== confirm) return { error: "Both passwords don't match." };
  if (!question) return { error: "Add a security question — it's how you recover your password." };
  if (!answer) return { error: "Add the answer to your security question." };

  const existing = await findUser(name);
  if (existing) {
    return {
      error: `An account named “${existing.display_name}” already exists. Sign in instead.`,
    };
  }

  const created = await adminDb()
    .from("users")
    .insert({
      display_name: name,
      password_hash: hashSecret(password),
      security_question: question,
      security_answer_hash: hashSecret(normalizeAnswer(answer)),
    })
    .select("id")
    .single();

  if (created.error) {
    // 23505: two signups raced on the same (case-insensitive) name.
    if (created.error.code === "23505") {
      return { error: "An account with that name already exists. Sign in instead." };
    }
    return { error: created.error.message };
  }

  // Starter courses are seeded here, once — never on the dashboard, so courses
  // the user deletes stay deleted. Local SQLite makes this near-instant; a
  // seed failure must not lose the freshly created account.
  try {
    await ensureStarterCourses(adminDb(), created.data.id);
  } catch (error) {
    console.error("[seed] starter courses failed", error);
  }

  await startSession(created.data.id);
  redirect(next);
}

export async function signOutAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/");
}

export async function recoverAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  const name = field(formData, "name");
  const answer = field(formData, "answer");
  const password = field(formData, "password");
  const confirm = field(formData, "confirm");

  if (!name) return { error: "Pick your account again." };
  if (password.length < 8) return { error: "Use at least 8 characters for your password." };
  if (password !== confirm) return { error: "Both passwords don't match." };

  const user = await findUser(name);
  if (!user) return { error: "That name doesn't match an account." };
  if (user.locked_until && user.locked_until > Date.now()) return { error: lockMessage(user) };

  if (!verifySecret(normalizeAnswer(answer), user.security_answer_hash)) {
    return { error: await registerFailure(user, "That answer doesn't match your security question.") };
  }

  await adminDb()
    .from("users")
    .update({
      password_hash: hashSecret(password),
      failed_attempts: 0,
      locked_until: null,
    })
    .eq("id", user.id);

  await startSession(user.id);
  redirect("/dashboard");
}
