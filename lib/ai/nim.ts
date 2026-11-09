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
    /** Server-provided Retry-After, milliseconds. */
    readonly retryAfterMs?: number,
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
 * Escalating cooldowns after a provider 429. The limit is account-wide and NIM
 * rarely sends Retry-After, so each retry waits minutes rather than seconds —
 * a long build must slow down instead of dying.
 */
const COOLDOWN_429_MS = [30_000, 60_000, 120_000, 180_000];

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
  if (Number.isFinite(seconds)) return Math.max(500, Math.min(180_000, seconds * 1000));
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

  let jsonMode = json;
  let lastError: Error | null = null;

  // One limiter slot per real HTTP request: a call that retries four times
  // must cost four slots. Running the retry loop inside a single slot let a
  // storming build burst at a multiple of the configured limit, which is how
  // the account ended up rate-limited in the first place.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let waitMs = 0;
    let retry = false;

    try {
      return await aiLimiter.run(priority, async () => {
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
              ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
            }),
            // Large module generations routinely pass 180s on this model.
            signal: AbortSignal.timeout(300_000),
          });
        } catch (error) {
          throw new AiError(error instanceof Error ? error.message : String(error));
        }

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          throw new AiError(
            `NVIDIA NIM returned ${response.status}: ${detail.slice(0, 400) || response.statusText}`,
            response.status,
            retryAfterMs(response) ?? undefined,
          );
        }

        const payload = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };

        const content = payload.choices?.[0]?.message?.content?.trim();
        if (!content) throw new AiError("The model returned an empty response.");

        recordUsage(meta, payload.usage);
        return { content, usage: payload.usage };
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const status = lastError instanceof AiError ? lastError.status : undefined;
      const serverDelay = lastError instanceof AiError ? lastError.retryAfterMs : undefined;
      const message = lastError.message;

      if (status === undefined) {
        // Transport failure or empty content: retry with the usual backoff.
        retry = attempt < 4;
        waitMs = Math.min(16_000, 1_500 * 2 ** (attempt + 1));
      } else if (status === 400 && sendThinkingFlag && /chat_template_kwargs|thinking/i.test(message)) {
        // The model rejects the thinking flag; switch it off for the process.
        sendThinkingFlag = false;
        retry = true;
        waitMs = 1_500;
      } else if (status === 400 && jsonMode && /response_format/i.test(message) && attempt < 3) {
        // Some NIM models reject response_format. Retry once without it rather
        // than failing the whole course build.
        jsonMode = false;
        retry = true;
        waitMs = 1_500;
      } else if (status === 429 && attempt < 4) {
        // A 429 is account-wide and NIM usually omits Retry-After. Hold every
        // lane for the same time, shrink the limiter's ceiling, and wait long
        // enough for the provider to actually cool down — seconds are not
        // enough, which is why the old schedule failed on long builds.
        waitMs = Math.max(serverDelay ?? 0, COOLDOWN_429_MS[attempt]);
        aiLimiter.penalize(waitMs);
        console.warn(
          `[nim] provider rate limit (429): pausing all lanes ${Math.round(waitMs / 1000)}s before attempt ${attempt + 2} of 5`,
        );
        retry = true;
      } else if (RETRYABLE.has(status) && attempt < 4) {
        waitMs = serverDelay ?? Math.min(16_000, 1_500 * 2 ** (attempt + 1));
        retry = true;
      }

      if (!retry) throw lastError;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastError ?? new AiError("The model did not respond.");
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
 * Asks the model for JSON and validates it with `validate`. Each round makes a
 * fresh attempt plus one repair, and two rounds are run before giving up: one
 * window whose answer failed validation twice used to kill an entire build at
 * the end of a long map phase.
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
  const opening: NimMessage[] = [
    { role: "system", content: params.system },
    { role: "user", content: params.user },
  ];

  const ask = (messages: NimMessage[], kind: string, temperature: number) =>
    callNim(messages, {
      json: true,
      maxTokens: params.maxTokens,
      temperature,
      priority: params.priority,
      meta: { ...params.meta, kind },
    });

  for (let round = 0; round < 2; round += 1) {
    // A slightly higher temperature on the second round: repeating the exact
    // same prompt tends to reproduce the exact same rejected answer.
    const first = await ask(opening, params.meta.kind, round === 0 ? params.temperature ?? 0.2 : 0.5);

    const parsed = parseJsonLoose<unknown>(first.content);
    const valid = parsed === null ? null : params.validate(parsed);
    if (valid !== null) return valid;

    const repair = await ask(
      [
        ...opening,
        { role: "assistant", content: first.content.slice(0, 6_000) },
        {
          role: "user",
          content:
            "That response was rejected. " +
            (params.repairHint ? `${params.repairHint} ` : "") +
            "Reply with ONLY the JSON object described above — no prose, no markdown fences, no comments. Keep every field.",
        },
      ],
      `${params.meta.kind}:repair`,
      0,
    );

    const repaired = parseJsonLoose<unknown>(repair.content);
    const validRepair = repaired === null ? null : params.validate(repaired);
    if (validRepair !== null) return validRepair;
  }

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
