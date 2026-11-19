/**
 * Environment access in one place. Nothing here throws at import time so that
 * `next build` works before any keys exist. Storage and auth need no
 * environment at all — the SQLite database and session secret are created
 * automatically under `data/`. AI provider variables (`AI_*`, `NVIDIA_NIM_*`)
 * live in `lib/ai/provider.ts`.
 */

import { isAiConfigured } from "@/lib/ai/provider";
import { hasAnyAiKey, hasAnyCustomEndpoint } from "@/lib/ai/user-provider";

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

/**
 * What still blocks a working install. Async because an account key saved in
 * Settings satisfies the AI-key requirement exactly like .env.local does.
 */
export async function setupProblems(): Promise<string[]> {
  const problems: string[] = [];
  if (!isAiConfigured() && !(await hasAnyAiKey()) && !(await hasAnyCustomEndpoint())) {
    problems.push("AI API key — paste one in Settings (gear icon) or set AI_API_KEY in .env.local");
  }
  return problems;
}
