import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { nimJson } from "@/lib/ai/nim";
import { tutorCompactionSystem, tutorCompactionUser } from "@/lib/ai/prompts";

/**
 * Tutor threads are compacted instead of truncated: the turns inside the
 * verbatim window are sent word for word, everything older is folded into one
 * summary row per student per lesson. Without this, the tenth question in a
 * session arrived with the first eight turns silently missing.
 */

/** Turns kept word for word. Two questions and their answers, plus context. */
const RECENT_TURNS = 8;

/**
 * Characters of transcript allowed before the older turns are folded away.
 * Four characters ≈ one token, so this is roughly 2 500 tokens — the system
 * prompt already carries the section notes, key terms and exercises.
 */
const TRANSCRIPT_BUDGET = 10_000;

/** Bounds the summary so compaction cannot quietly recreate the problem. */
const SUMMARY_LIMIT = 2_400;

/** Guards against one runaway thread pulling thousands of rows into memory. */
const TURN_SCAN_LIMIT = 400;

type TurnRow = { role: "user" | "assistant"; content: string; created_at: string };
type SummaryRow = { summary: string; covered_until: string };

/**
 * Keeps a summary inside the limit without cutting mid-sentence: trim back to
 * the last full stop when there is one near the end, and only fall back to a
 * hard cut for text with no sentence breaks at all.
 */
function clampSummary(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= SUMMARY_LIMIT) return trimmed;

  const window = trimmed.slice(0, SUMMARY_LIMIT);
  const end = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
    window.lastIndexOf(".\n"),
  );
  // Anything earlier than half the limit means the text is one long run-on;
  // a sentence-shaped summary is worth more than the missing tail.
  if (end > SUMMARY_LIMIT / 2) return window.slice(0, end + 1);
  return trimmed.slice(0, SUMMARY_LIMIT);
}

export type TutorThread = {
  /** Covers every turn older than `recent`; null until the first compaction. */
  summary: string | null;
  /** Turns sent word for word, oldest first. */
  recent: { role: "user" | "assistant"; content: string }[];
};

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || /does not exist|schema cache/i.test(error.message ?? "");
}

/**
 * Reads the thread the tutor will answer from: the stored summary, plus the
 * recent turns. Folding happens here and only when the thread has outgrown the
 * budget, so a normal session costs no extra model call.
 */
export async function loadTutorThread(
  supabase: SupabaseClient,
  params: { userId: string; lessonId: string; courseId: string; lessonTitle: string },
): Promise<TutorThread> {
  const { data: summaryData, error: summaryError } = await supabase
    .from("tutor_summaries")
    .select("summary,covered_until")
    .eq("user_id", params.userId)
    .eq("lesson_id", params.lessonId)
    .maybeSingle();

  // A database that has not run the latest schema.sql still tutors; it just
  // keeps a plain window of recent turns.
  const summarised = isMissingTable(summaryError) ? null : (summaryData as SummaryRow | null);
  const summary = summarised?.summary ?? null;

  let query = supabase
    .from("tutor_messages")
    .select("role,content,created_at")
    .eq("user_id", params.userId)
    .eq("lesson_id", params.lessonId)
    // Newest first so a scan cap drops the oldest, then reversed below.
    .order("created_at", { ascending: false })
    .limit(TURN_SCAN_LIMIT);

  if (summarised?.covered_until) {
    // Strictly after the last folded turn: that turn is already in the summary.
    query = query.gt("created_at", summarised.covered_until);
  }

  const { data: turnData, error: turnError } = await query;
  if (turnError) throw new Error(turnError.message);

  const turns = ((turnData ?? []) as TurnRow[]).slice().reverse();
  const recent = turns.slice(-RECENT_TURNS).map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));

  const foldable = turns.length > RECENT_TURNS ? turns.slice(0, -RECENT_TURNS) : [];
  if (foldable.length === 0 || isMissingTable(summaryError)) {
    return { summary, recent };
  }

  const weight =
    (summary?.length ?? 0) + turns.reduce((total, turn) => total + turn.content.length, 0);
  if (weight <= TRANSCRIPT_BUDGET) {
    return { summary, recent };
  }

  const folded = await compact(supabase, params, { summary, foldable });
  // A failed fold is not a failed answer: the recent window still goes through.
  return folded ? { summary: folded, recent } : { summary, recent };
}

async function compact(
  supabase: SupabaseClient,
  params: { userId: string; lessonId: string; courseId: string; lessonTitle: string },
  thread: { summary: string | null; foldable: TurnRow[] },
): Promise<string | null> {
  const coveredUntil = thread.foldable[thread.foldable.length - 1].created_at;

  try {
    const result = await nimJson<{ summary: string }>({
      system: tutorCompactionSystem(params.lessonTitle),
      user: tutorCompactionUser({ summary: thread.summary, messages: thread.foldable }),
      maxTokens: 700,
      temperature: 0.2,
      priority: "interactive",
      meta: { kind: "tutor-compact", userId: params.userId, courseId: params.courseId },
      validate: (value) => {
        const raw = (value as { summary?: unknown } | null)?.summary;
        const text = typeof raw === "string" ? raw.trim() : "";
        return text ? { summary: clampSummary(text) } : null;
      },
    });

    const { error } = await supabase.from("tutor_summaries").upsert(
      {
        user_id: params.userId,
        lesson_id: params.lessonId,
        summary: result.summary,
        covered_until: coveredUntil,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,lesson_id" },
    );

    if (error) {
      // The reply can still use the fresh summary; the next question refolds.
      console.warn(`[tutor] summary save failed: ${error.message}`);
    }

    return result.summary;
  } catch (error) {
    console.warn(
      `[tutor] compaction failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}
