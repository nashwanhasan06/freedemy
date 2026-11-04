/**
 * Environment access in one place. Nothing here throws at import time so that
 * `next build` works before the operator has created a Supabase project.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "";
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const NIM_BASE_URL = (
  process.env.NVIDIA_NIM_BASE_URL ?? "https://integrate.api.nvidia.com/v1"
).replace(/\/+$/, "");
export const NIM_API_KEY = process.env.NVIDIA_NIM_API_KEY ?? "";
/**
 * NIM hosts a large catalogue but only part of it is enabled per account; this
 * default is an NVIDIA model that is enabled on the free endpoints, honours
 * JSON mode, handles a full lecture transcript and writes usable mermaid.
 */
export const NIM_MODEL_DEFAULT = "nvidia/nemotron-3-ultra-550b-a55b";
export const NIM_MODEL = process.env.NVIDIA_NIM_MODEL ?? NIM_MODEL_DEFAULT;

/** Hard ceiling for the NIM account. The scheduler never exceeds it. */
export const AI_RPM_LIMIT = Number(process.env.AI_RPM_LIMIT ?? 40) || 40;

/** In-flight cap for interactive calls (tutor, grading). */
export const AI_CONCURRENCY = Number(process.env.AI_CONCURRENCY ?? 4) || 4;

/**
 * In-flight cap for background course generation. A separate lane from
 * `AI_CONCURRENCY` so a big build can run many windows at once without
 * starving a student's tutor or grading request.
 */
export const AI_BACKGROUND_CONCURRENCY =
  Number(process.env.AI_BACKGROUND_CONCURRENCY ?? 10) || 10;

/**
 * Requests per minute kept free for students while a course is generating.
 * Interactive calls (tutor, grading) may use the whole ceiling.
 */
export const AI_INTERACTIVE_RESERVE =
  Number(process.env.AI_INTERACTIVE_RESERVE ?? 8) || 8;

/** Resend API key for transactional email (password reset links). */
export const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";

/**
 * From address for outgoing email. Resend only accepts senders verified in
 * its dashboard; in test mode that is "onboarding@resend.dev".
 */
export const EMAIL_FROM =
  process.env.EMAIL_FROM ?? "Freedemy <onboarding@resend.dev>";

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function isServiceRoleConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

export function isNimConfigured(): boolean {
  return Boolean(NIM_API_KEY);
}

export function isEmailConfigured(): boolean {
  return Boolean(RESEND_API_KEY);
}

const SETUP_HINT =
  "Supabase is not configured. Copy .env.example to .env.local and set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then run supabase/schema.sql in the Supabase SQL editor.";

export function assertSupabaseConfigured(): void {
  if (!isSupabaseConfigured()) {
    throw new Error(SETUP_HINT);
  }
}

export function assertServiceRoleConfigured(): void {
  if (!isServiceRoleConfigured()) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is missing. The course generator writes course content on the server, so it needs the service role key from Supabase → Project Settings → API.",
    );
  }
}

export function assertNimConfigured(): void {
  if (!isNimConfigured()) {
    throw new Error(
      "NVIDIA_NIM_API_KEY is missing. Add it to .env.local so the tutor, the course generator and the code grader can call the NIM endpoint.",
    );
  }
}

export function setupProblems(): string[] {
  const problems: string[] = [];
  if (!isSupabaseConfigured()) problems.push("Supabase URL / anon key");
  if (!isServiceRoleConfigured()) problems.push("Supabase service role key");
  if (!isNimConfigured()) problems.push("NVIDIA NIM API key");
  return problems;
}
