import "server-only";

import { NIM_API_KEY, NIM_BASE_URL, NIM_MODEL, assertNimConfigured, isServiceRoleConfigured, isSupabaseConfigured } from "@/lib/env";
import { aiLimiter, type Priority } from "@/lib/ai/limiter";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type NimMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type NimMeta = {
  kind: string;
  userId?: string;
  courseId?: string;
};

export class AiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AiError";
  }
}

type CallOptions = {
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  priority?: Priority;
  meta: NimMeta;
};

type CallResult = {
  content: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

/**
 * The NVIDIA Nemotron models answer through a hidden reasoning pass first. That
 * pass is billed against max_tokens, so a 1 200-token map call came back with
 * empty content and the whole course build failed. Thinking is turned off, and
 * switched off for the process if a model rejects the field.
 */
let sendThinkingFlag = true;

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(500, Math.min(30_000, seconds * 1000));
  return null;
}

function recordUsage(meta: NimMeta, usage: CallResult["usage"]): void {
  if (!usage || !isSupabaseConfigured() || !isServiceRoleConfigured()) return;

  try {
    const admin = createSupabaseAdminClient();
    void admin
      .from("ai_usage")
      .insert({
        user_id: meta.userId ?? null,
        course_id: meta.courseId ?? null,
        kind: meta.kind,
        model: NIM_MODEL,
        prompt_tokens: usage.prompt_tokens ?? null,
        completion_tokens: usage.completion_tokens ?? null,
      })
      .then(
        () => undefined,
        () => undefined,
      );
  } catch {
    // Usage logging is observability, never a reason to fail a student's request.
  }
}

async function callNim(
  messages: NimMessage[],
  { json, maxTokens, temperature, priority = "interactive", meta }: CallOptions,
): Promise<CallResult> {
  assertNimConfigured();

  return aiLimiter.run(priority, async () => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (attempt > 0) {
        const backoff = Math.min(16_000, 1_500 * 2 ** attempt);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }

      let response: Response;
      try {
        response = await fetch(`${NIM_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${NIM_API_KEY}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            model: NIM_MODEL,
            messages,
            temperature: temperature ?? 0.2,
            max_tokens: maxTokens ?? 2_048,
            stream: false,
            ...(sendThinkingFlag ? { chat_template_kwargs: { thinking: false } } : {}),
            ...(json ? { response_format: { type: "json_object" } } : {}),
          }),
          // Large module generations routinely pass 180s on this model.
          signal: AbortSignal.timeout(300_000),
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        continue;
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        const error = new AiError(
          `NVIDIA NIM returned ${response.status}: ${detail.slice(0, 400) || response.statusText}`,
          response.status,
        );

        if (response.status === 400 && sendThinkingFlag && /chat_template_kwargs|thinking/i.test(detail)) {
          sendThinkingFlag = false;
          lastError = new AiError("The configured model does not take chat_template_kwargs.", 400);
          continue;
        }

        // Some NIM models reject response_format. Retry once without it rather
        // than failing the whole course build.
        if (
          response.status === 400 &&
          json &&
          detail.toLowerCase().includes("response_format") &&
          attempt < 3
        ) {
          lastError = new AiError(
            "The configured model rejected JSON mode; retrying without response_format.",
            400,
          );
          json = false;
          continue;
        }

        if (RETRYABLE.has(response.status) && attempt < 4) {
          // A 429 is account-wide, so hold every lane (including background
          // generation) instead of only this request. NIM usually omits
          // Retry-After, hence the escalating fallback.
          const wait =
            response.status === 429
              ? (retryAfterMs(response) ?? Math.min(60_000, 15_000 * 2 ** attempt))
              : (retryAfterMs(response) ?? Math.min(16_000, 1_500 * 2 ** attempt));

          if (response.status === 429 && typeof aiLimiter.penalize === "function") {
            aiLimiter.penalize(wait);
          }

          await new Promise((resolve) => setTimeout(resolve, wait));
          lastError = error;
          continue;
        }
        throw error;
      }

      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const content = payload.choices?.[0]?.message?.content?.trim();
      if (!content) {
        lastError = new AiError("The model returned an empty response.");
        continue;
      }

      recordUsage(meta, payload.usage);
      return { content, usage: payload.usage };
    }

    throw lastError ?? new AiError("The model did not respond.");
  });
}

function parseJsonLoose<T>(raw: string): T | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // fall through to brace extraction
  }

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Asks the model for JSON and validates it with `validate`. One repair round is
 * attempted because small models occasionally wrap output in prose.
 */
export async function nimJson<T>(
  params: {
    system: string;
    user: string;
    maxTokens?: number;
    temperature?: number;
    priority?: Priority;
    meta: NimMeta;
    validate: (value: unknown) => T | null;
    /** Told to the model when its first answer is rejected, if the caller knows why. */
    repairHint?: string;
  },
): Promise<T> {
  const first = await callNim(
    [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
    {
      json: true,
      maxTokens: params.maxTokens,
      temperature: params.temperature ?? 0.2,
      priority: params.priority,
      meta: params.meta,
    },
  );

  const parsed = parseJsonLoose<unknown>(first.content);
  const valid = parsed === null ? null : params.validate(parsed);
  if (valid !== null) return valid;

  const repair = await callNim(
    [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
      { role: "assistant", content: first.content.slice(0, 6_000) },
      {
        role: "user",
        content:
          "That response was rejected. " +
          (params.repairHint ? `${params.repairHint} ` : "") +
          "Reply with ONLY the JSON object described above — no prose, no markdown fences, no comments. Keep every field.",
      },
    ],
    {
      json: true,
      maxTokens: params.maxTokens,
      temperature: 0,
      priority: params.priority,
      meta: { ...params.meta, kind: `${params.meta.kind}:repair` },
    },
  );

  const repaired = parseJsonLoose<unknown>(repair.content);
  const validRepair = repaired === null ? null : params.validate(repaired);
  if (validRepair !== null) return validRepair;

  throw new AiError("The model kept returning malformed JSON.");
}

/** Plain text completion, used by the tutor chat. */
export async function nimText(params: {
  system: string;
  messages: NimMessage[];
  maxTokens?: number;
  temperature?: number;
  priority?: Priority;
  meta: NimMeta;
}): Promise<string> {
  const result = await callNim(
    [{ role: "system", content: params.system }, ...params.messages],
    {
      maxTokens: params.maxTokens ?? 1_024,
      temperature: params.temperature ?? 0.4,
      priority: params.priority,
      meta: params.meta,
    },
  );
  return result.content;
}
