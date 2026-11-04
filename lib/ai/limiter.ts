import {
  AI_BACKGROUND_CONCURRENCY,
  AI_CONCURRENCY,
  AI_INTERACTIVE_RESERVE,
  AI_RPM_LIMIT,
} from "@/lib/env";

export type Priority = "interactive" | "background";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sliding-window limiter for the NIM account.
 *
 * - Never more than `rpm` calls in any rolling 60s window.
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

  constructor(
    readonly rpm: number,
    readonly concurrency: number,
    readonly reserve: number,
    readonly backgroundConcurrency: number,
  ) {}

  private prune(now: number): void {
    const cutoff = now - 60_000;
    if (this.timestamps.length === 0) return;
    let keepFrom = 0;
    while (keepFrom < this.timestamps.length && this.timestamps[keepFrom] <= cutoff) {
      keepFrom += 1;
    }
    if (keepFrom > 0) this.timestamps = this.timestamps.slice(keepFrom);
  }

  private limitFor(priority: Priority): number {
    if (priority === "background") {
      return Math.max(1, this.rpm - this.reserve);
    }
    return this.rpm;
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
   * Pause every lane for a while. Used when the provider answers 429 so the
   * whole account backs off together instead of hammering the rate limit.
   */
  penalize(ms: number): void {
    this.blockedUntil = Math.max(this.blockedUntil, Date.now() + Math.max(0, ms));
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
      usedThisMinute: this.timestamps.length,
      inFlight: this.running.interactive + this.running.background,
      inFlightByLane: { ...this.running },
      concurrency: this.concurrency,
      backgroundConcurrency: this.backgroundConcurrency,
      blockedForMs: Math.max(0, this.blockedUntil - Date.now()),
    };
  }
}

const globalForLimiter = globalThis as unknown as { __freedemyLimiter?: AiRateLimiter };

export const aiLimiter =
  globalForLimiter.__freedemyLimiter ??
  new AiRateLimiter(
    AI_RPM_LIMIT,
    AI_CONCURRENCY,
    AI_INTERACTIVE_RESERVE,
    AI_BACKGROUND_CONCURRENCY,
  );

globalForLimiter.__freedemyLimiter = aiLimiter;
