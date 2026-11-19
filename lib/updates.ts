/**
 * The one updater the app keeps: a silent daily yt-dlp self-update for
 * `instrumentation.ts`. Everything else — the three-head startup check, the
 * Settings "Update now" flow, the GitHub release lookups and the restart
 * supervisor — was removed with the in-app updates feature.
 */
import "server-only";

import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const YTDLP = process.env.YTDLP_PATH?.trim() || "yt-dlp";

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { cwd: process.cwd(), timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        const code =
          error && typeof (error as { code?: unknown }).code === "number"
            ? ((error as { code: number }).code)
            : error
              ? 1
              : 0;
        resolve({ code, out: `${stdout ?? ""}${stderr ?? ""}`.trim() });
      },
    );
  });
}

/**
 * Silent yt-dlp self-update, run once a day from `instrumentation.ts` at
 * server start. Best effort: offline, missing binary or a package-manager
 * install all end quietly. The marker is written after every real attempt so a
 * broken updater cannot slow down every boot.
 */
export async function silentYtDlpUpdate(): Promise<void> {
  try {
    const dataDir = path.join(process.cwd(), "data");
    mkdirSync(dataDir, { recursive: true });
    const marker = path.join(dataDir, ".ytdlp-updated");
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (readFileSync(marker, "utf8").trim() === today) return;
    } catch {
      // No marker yet — run.
    }
    await run(YTDLP, ["-U"], 180_000);
    writeFileSync(marker, today);
  } catch {
    // Never let an updater touch the boot path.
  }
}
