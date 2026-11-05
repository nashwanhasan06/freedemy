"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { AuthState } from "@/lib/actions/types";
import { passwordResetEmail, sendEmail } from "@/lib/email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  if (next.startsWith("/") && !next.startsWith("//")) return next;
  return "/dashboard";
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

async function origin(): Promise<string> {
  const store = await headers();
  const explicit = store.get("origin");
  if (explicit) return explicit;

  const host = store.get("x-forwarded-host") ?? store.get("host") ?? "localhost:3000";
  const protocol = store.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export async function signInAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  const email = field(formData, "email");
  const password = field(formData, "password");
  const next = safeNext(formData.get("next"));

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return {
      error:
        error.message === "Invalid login credentials"
          ? "That email and password don't match an account."
          : error.message,
    };
  }

  redirect(next);
}

export async function signUpAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  const name = field(formData, "name");
  const email = field(formData, "email");
  const password = field(formData, "password");
  const next = safeNext(formData.get("next"));

  if (!name) return { error: "Tell us your name." };
  if (!email || !email.includes("@")) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Use at least 8 characters for your password." };

  const supabase = await createSupabaseServerClient();
  const appOrigin = await origin();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: `${appOrigin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    return {
      error: /already registered|already exists/i.test(error.message)
        ? "An account with that email already exists. Sign in instead."
        : error.message,
    };
  }

  if (!data.session) {
    return {
      message: "Check your inbox — confirm your email and then sign in to start learning.",
    };
  }

  redirect(next);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

const RESET_WINDOW_MS = 15 * 60_000;
const MAX_RESET_REQUESTS = 3;
const resetRequests = new Map<string, number[]>();

/** Process-local throttle, same trade-off as the AI limiter: one Node instance. */
function resetThrottled(email: string): boolean {
  const now = Date.now();
  const recent = (resetRequests.get(email) ?? []).filter((at) => now - at < RESET_WINDOW_MS);
  if (recent.length >= MAX_RESET_REQUESTS) return true;
  recent.push(now);
  resetRequests.set(email, recent);
  return false;
}

const RESET_LINK_MESSAGE =
  "If that address has an account, a reset link is on its way. It expires in 1 hour.";

/**
 * Mints a recovery token with the service-role client and sends the link
 * through Resend, so the flow does not depend on Supabase's SMTP settings.
 * The reply is identical whether or not the address exists.
 */
export async function requestPasswordResetAction(
  _state: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = field(formData, "email").toLowerCase();
  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email address." };
  }

  if (resetThrottled(email)) {
    return { error: "Too many reset requests for this email. Wait 15 minutes and try again." };
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
    const token = data?.properties?.hashed_token;

    if (!error && token) {
      const url = `${await origin()}/reset-password?token=${encodeURIComponent(token)}`;
      const sent = await sendEmail({ to: email, ...passwordResetEmail(url) });

      if (sent.ok) return { message: RESET_LINK_MESSAGE };

      console.warn(`[email] password-reset send failed (${sent.error})`);
      // A dead send must not dead-end the flow: in development the link goes
      // to the server log instead. Never logged in production.
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[email] reset link for ${email}: ${url}`);
      }
      return { message: RESET_LINK_MESSAGE };
    }

    console.warn(`[email] recovery link generation failed: ${error?.message ?? "unknown"}`);
  } catch (error) {
    console.warn(
      `[email] password reset unavailable: ${error instanceof Error ? error.message : error}`,
    );
  }

  return { message: RESET_LINK_MESSAGE };
}

/**
 * Exchanges the emailed token for a session, then lets that session set the
 * new password. Both steps must succeed; an expired or reused token fails at
 * verifyOtp before anything changes.
 */
export async function resetPasswordAction(
  _state: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const token = field(formData, "token");
  const password = field(formData, "password");
  const confirm = field(formData, "confirm");

  if (!token) return { error: "That reset link is incomplete. Request a new one." };
  if (password.length < 8) return { error: "Use at least 8 characters for your password." };
  if (password !== confirm) return { error: "Both passwords don't match." };

  const supabase = await createSupabaseServerClient();

  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "recovery",
    token_hash: token,
  });
  if (verifyError) {
    return { error: "That reset link has expired or was already used. Request a new one." };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    return { error: updateError.message };
  }

  redirect("/dashboard");
}
