import {
  AI_BACKGROUND_CONCURRENCY,
  AI_CONCURRENCY,
  AI_INTERACTIVE_RESERVE,
} from "@/lib/env";

export type Priority = "interactive" | "background";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sliding-window limiter for the model account.
 *
 * - `rpm: number` — never more than `rpm` calls in any rolling 60s window.
 *   This is the NIM default (40); an explicit `AI_RPM_LIMIT` opts any
 *   provider back in.
 * - `rpm: null` — no window enforcement at all (the default for OpenAI,
 *   Anthropic, DeepSeek and Gemini). Only the concurrency lanes below apply.
 * - Background generation is held below `rpm - reserve`, so a student opening
 *   the tutor or submitting an assignment always has requests left over.
 * - Each lane has its own in-flight cap: up to `backgroundConcurrency` builds
 *   run at once while `concurrency` slots stay reserved for interactive work.
 *   A single shared counter would let a busy build fill every slot and starve
 *   the tutor.
 *
 * Process-local: with a single Node server (next dev / next start) this is the
 * whole story. If the app is ever scaled to several instances, put the same
 * window in Redis or a Postgres table.
 */
export class AiRateLimiter {
  private timestamps: number[] = [];
  private running: Record<Priority, number> = { interactive: 0, background: 0 };
  private blockedUntil = 0;
  /**
   * Effective ceiling in requests per minute. Starts at `rpm` and is cut when
   * the provider answers 429 — the account's real limit may be lower than the
   * configured one — then earned back one per quiet minute. `Infinity` when
   * there is no window (`rpm === null`), so every window check passes.
   */
  private allowance: number;
  private lastShrinkAt = 0;

  constructor(
    readonly rpm: number | null,
    readonly concurrency: number,
    readonly reserve: number,
    readonly backgroundConcurrency: number,
  ) {
    this.allowance = rpm ?? Number.POSITIVE_INFINITY;
  }

  private prune(now: number): void {
    const cutoff = now - 60_000;
    if (this.timestamps.length > 0) {
      let keepFrom = 0;
      while (keepFrom < this.timestamps.length && this.timestamps[keepFrom] <= cutoff) {
        keepFrom += 1;
      }
      if (keepFrom > 0) this.timestamps = this.timestamps.slice(keepFrom);
    }

    // A rate limit costs allowance; a quiet minute earns one request back.
    if (this.rpm !== null && this.allowance < this.rpm && now - this.lastShrinkAt >= 60_000) {
      this.allowance = Math.min(this.rpm, this.allowance + 1);
      this.lastShrinkAt = now;
    }
  }

  private limitFor(priority: Priority): number {
    if (priority === "background") {
      return Math.max(1, this.allowance - this.reserve);
    }
    return this.allowance;
  }

  private inFlightCapFor(priority: Priority): number {
    return priority === "background" ? this.backgroundConcurrency : this.concurrency;
  }

  private waitMs(priority: Priority, now: number): number {
    const limit = this.limitFor(priority);
    if (this.timestamps.length < limit) return 50;
    const oldest = this.timestamps[this.timestamps.length - limit];
    return Math.max(50, oldest + 60_000 - now + 15);
  }

  /**
   * Pause every lane for a while and shrink the ceiling. Used when the provider
   * answers 429: the whole account backs off together instead of hammering the
   * rate limit, and future traffic stays under whatever the real limit turns
   * out to be. The allowance recovers on its own after quiet minutes.
   */
  penalize(ms: number): void {
    const now = Date.now();
    this.blockedUntil = Math.max(this.blockedUntil, now + Math.max(0, ms));
    // In-flight requests can 429 together; shrink once per short window so a
    // single storm finds the real ceiling instead of collapsing to the floor.
    if (now - this.lastShrinkAt >= 5_000) {
      this.allowance = Math.max(4, Math.floor(this.allowance * 0.75));
      this.lastShrinkAt = now;
    }
  }

  /** Resolves with a release function once a request slot is available. */
  async acquire(priority: Priority = "interactive"): Promise<() => void> {
    for (;;) {
      const now = Date.now();
      this.prune(now);

      if (now < this.blockedUntil) {
        await sleep(Math.min(2_000, this.blockedUntil - now));
        continue;
      }

      if (
        this.running[priority] < this.inFlightCapFor(priority) &&
        this.timestamps.length < this.limitFor(priority)
      ) {
        this.running[priority] += 1;
        this.timestamps.push(now);
        let released = false;
        return () => {
          if (released) return;
          released = true;
          this.running[priority] -= 1;
        };
      }

      await sleep(Math.min(2_000, this.waitMs(priority, now)));
    }
  }

  async run<T>(priority: Priority, task: () => Promise<T>): Promise<T> {
    const release = await this.acquire(priority);
    try {
      return await task();
    } finally {
      release();
    }
  }

  stats() {
    this.prune(Date.now());
    return {
      rpm: this.rpm,
      allowance: this.allowance,
      usedThisMinute: this.timestamps.length,
      inFlight: this.running.interactive + this.running.background,
      inFlightByLane: { ...this.running },
      concurrency: this.concurrency,
      backgroundConcurrency: this.backgroundConcurrency,
      blockedForMs: Math.max(0, this.blockedUntil - Date.now()),
    };
  }
}

const globalForLimiter = globalThis as unknown as {
  __freedemyLimiters?: Map<string, AiRateLimiter>;
};
const limiters = globalForLimiter.__freedemyLimiters ?? new Map<string, AiRateLimiter>();
globalForLimiter.__freedemyLimiters = limiters;

/**
 * The limiter for one provider's account. Rate limits belong to the vendor
 * account making the request: a student on OpenAI (no window) must not inherit
 * NIM's 40 RPM ceiling because another student chose NIM, and NIM's 429
 * cooldown must only pause NIM's lanes. Keyed by provider id — `rpm` is fixed
 * per process (`AI_RPM_LIMIT` comes from the environment), so the first
 * construction wins.
 */
export function aiLimiterFor(provider: { id: string; rpm: number | null }): AiRateLimiter {
  const existing = limiters.get(provider.id);
  if (existing) return existing;
  const limiter = new AiRateLimiter(
    provider.rpm,
    AI_CONCURRENCY,
    AI_INTERACTIVE_RESERVE,
    AI_BACKGROUND_CONCURRENCY,
  );
  limiters.set(provider.id, limiter);
  return limiter;
}
