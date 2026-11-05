import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

export type TranscriptCue = {
  /** Absolute seconds from the start of the video. */
  start: number;
  text: string;
};

export type Lecture = {
  videoId: string;
  title: string;
  channel: string;
  description: string;
  durationSeconds: number;
  cues: TranscriptCue[];
};

export class TranscriptError extends Error {
  constructor(
    message: string,
    readonly code: "no-captions" | "unavailable" | "network" | "tooling",
  ) {
    super(message);
    this.name = "TranscriptError";
  }
}

const execFileAsync = promisify(execFile);

const YTDLP = process.env.YTDLP_PATH?.trim() || "yt-dlp";
const YTDLP_COOKIES = process.env.YTDLP_COOKIES?.trim();
const YTDLP_PROXY = process.env.YTDLP_PROXY?.trim();

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

type Json3 = {
  events?: {
    tStartMs?: number;
    segs?: { utf8?: string }[];
  }[];
};

type YtDlpInfo = {
  title?: string;
  uploader?: string;
  channel?: string;
  description?: string;
  duration?: number;
  language?: string;
};

/** Merges tiny caption fragments into readable lines. */
function mergeCues(raw: { start: number; text: string }[]): TranscriptCue[] {
  const cues: TranscriptCue[] = [];
  let buffer = "";
  let bufferStart = 0;

  for (const item of raw) {
    const text = item.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (!buffer) bufferStart = item.start;
    buffer = buffer ? `${buffer} ${text}` : text;

    if (buffer.length >= 220) {
      cues.push({ start: bufferStart, text: buffer });
      buffer = "";
    }
  }

  if (buffer) cues.push({ start: bufferStart, text: buffer });
  return cues;
}

function parseJson3(payload: Json3): TranscriptCue[] {
  const raw = (payload.events ?? [])
    .map((event) => ({
      start: Math.round((event.tStartMs ?? 0) / 1000),
      text: (event.segs ?? []).map((seg) => seg.utf8 ?? "").join(""),
    }))
    .filter((event) => event.text.trim().length > 0);

  return raw.length > 0 ? mergeCues(raw) : [];
}

function isMissingBinary(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "ENOENT";
}

/**
 * Primary transcript source. YouTube now requires a proof-of-origin token for
 * caption downloads, which yt-dlp obtains. Requires the `yt-dlp` binary on PATH
 * (or YTDLP_PATH). Returns null when the binary is not installed so the caller
 * can try the direct caption endpoint instead.
 */
async function loadWithYtDlp(videoId: string): Promise<Lecture | null> {
  const dir = await mkdtemp(join(tmpdir(), "freedemy-"));

  try {
    let stderr = "";
    let files: string[] = [];

    // Caption URLs are issued per player client, and YouTube rate-limits the
    // default client's timedtext URLs first. "android" and "ios" keep serving
    // captions when the default client answers 429, so each pass uses a
    // different client instead of retrying the same throttled one.
    const CLIENTS = ["android", "ios"] as const;

    for (let pass = 0; pass < CLIENTS.length; pass += 1) {
      if (pass > 0) await new Promise((resolve) => setTimeout(resolve, 2_000));

      try {
        const result = await execFileAsync(
          YTDLP,
          [
            "--ignore-config",
            "--no-playlist",
            "--no-warnings",
            "--no-progress",
            "--skip-download",
            "--ignore-no-formats-error",
            "--extractor-args",
            `youtube:player_client=${CLIENTS[pass]}`,
            "--write-subs",
            "--write-auto-subs",
            // Ask for exactly one track. Every extra subtitle request counts
            // against YouTube's timedtext rate limit, and asking for several
            // languages (or translated variants) is the usual way to earn a
            // 429. "en" is the original English auto/manual track.
            "--sub-langs",
            "en",
            "--sub-format",
            "json3",
            "--write-info-json",
            "--socket-timeout",
            "15",
            "--retries",
            "1",
            ...(YTDLP_COOKIES ? ["--cookies", YTDLP_COOKIES] : []),
            ...(YTDLP_PROXY ? ["--proxy", YTDLP_PROXY] : []),
            "-o",
            join(dir, "%(id)s"),
            `https://www.youtube.com/watch?v=${videoId}`,
          ],
          { timeout: 180_000, maxBuffer: 24 * 1024 * 1024, windowsHide: true },
        );
        stderr = result.stderr ?? "";
      } catch (error) {
        if (isMissingBinary(error)) return null;
        // A missing subtitle track makes yt-dlp exit non-zero while still
        // writing the info JSON; keep whatever landed on disk and inspect it.
        stderr = String((error as { stderr?: string }).stderr ?? "");
      }

      files = await readdir(dir);
      if (files.some((file) => file.endsWith(".json3"))) break;
    }

    const subtitleFile = files.find((file) => file.endsWith(".json3"));
    const infoFile = files.find((file) => file.endsWith(".info.json"));

    let info: YtDlpInfo = {};
    if (infoFile) {
      try {
        info = JSON.parse(await readFile(join(dir, infoFile), "utf8")) as YtDlpInfo;
      } catch {
        info = {};
      }
    }

    if (!subtitleFile) {
      throw new TranscriptError(
        /429|too many requests/i.test(stderr)
          ? "YouTube is rate-limiting caption downloads from this machine. Wait a few minutes, then try again."
          : /sign in to confirm|captcha/i.test(stderr)
            ? "YouTube asked this machine to prove it is not a bot, so the captions could not be downloaded. Try again later."
            : `This video has no English captions that yt-dlp could download.${stderr ? ` (${stderr.split("\n").filter(Boolean).at(-1)?.slice(0, 200)})` : ""}`,
        "no-captions",
      );
    }

    const cues = parseJson3(JSON.parse(await readFile(join(dir, subtitleFile), "utf8")) as Json3);

    if (cues.length === 0) {
      throw new TranscriptError("The caption track for this video came back empty.", "no-captions");
    }

    if (!info.title) {
      const fallback = await readWatchPageMeta(videoId);
      info = { ...fallback, ...info };
    }

    return {
      videoId,
      title: info.title ?? "Untitled lecture",
      channel: info.uploader ?? info.channel ?? "YouTube",
      description: (info.description ?? "").slice(0, 4_000),
      durationSeconds:
        Number(info.duration ?? 0) || (cues.at(-1)?.start ? cues.at(-1)!.start + 30 : 0),
      cues,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/* -------------------------------------------------------------------------- */
/* Direct caption endpoint fallback (works where YouTube does not gate it)     */
/* -------------------------------------------------------------------------- */

function extractJsonObject(html: string, marker: string): string | null {
  const index = html.indexOf(marker);
  if (index < 0) return null;
  const start = html.indexOf("{", index);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < html.length; i += 1) {
    const char = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

type CaptionTrack = {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
};

type PlayerResponse = {
  playabilityStatus?: { status?: string; reason?: string };
  videoDetails?: {
    title?: string;
    author?: string;
    shortDescription?: string;
    lengthSeconds?: string;
  };
  captions?: {
    playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] };
  };
};

async function fetchWatchPage(videoId: string): Promise<{ html: string; player: PlayerResponse }> {
  const response = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: {
      "User-Agent": BROWSER_UA,
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new TranscriptError(`YouTube returned ${response.status}.`, "network");
  }

  const html = await response.text();
  const raw = extractJsonObject(html, "ytInitialPlayerResponse");

  if (!raw) {
    throw new TranscriptError("YouTube did not include a player response.", "network");
  }

  return { html, player: JSON.parse(raw) as PlayerResponse };
}

async function readWatchPageMeta(videoId: string): Promise<Partial<Lecture>> {
  try {
    const { player } = await fetchWatchPage(videoId);
    return {
      title: player.videoDetails?.title ?? undefined,
      channel: player.videoDetails?.author ?? undefined,
      description: (player.videoDetails?.shortDescription ?? "").slice(0, 4_000),
      durationSeconds: Number(player.videoDetails?.lengthSeconds ?? 0) || undefined,
    };
  } catch {
    return {};
  }
}

async function loadFromCaptionEndpoint(videoId: string): Promise<Lecture> {
  const { player } = await fetchWatchPage(videoId);

  if (player.playabilityStatus?.status && player.playabilityStatus.status !== "OK") {
    throw new TranscriptError(
      player.playabilityStatus.reason ?? "YouTube would not serve this video.",
      "unavailable",
    );
  }

  const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const english = tracks.filter((track) => (track.languageCode ?? "").startsWith("en"));
  const pool = english.length > 0 ? english : tracks;
  const track = pool.find((item) => item.kind !== "asr") ?? pool[0];

  if (!track?.baseUrl) {
    throw new TranscriptError(
      "This video has no captions, so there is no transcript to build a course from.",
      "no-captions",
    );
  }

  const response = await fetch(`${track.baseUrl}&fmt=json3`, {
    headers: { "User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9" },
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });

  const text = await response.text();
  const cues = text.trim().startsWith("{") ? parseJson3(JSON.parse(text) as Json3) : [];

  if (cues.length === 0) {
    throw new TranscriptError(
      "YouTube returned an empty caption track for this video. Install yt-dlp (or set YTDLP_PATH) so Freedemy can download the transcript reliably.",
      "no-captions",
    );
  }

  return {
    videoId,
    title: player.videoDetails?.title ?? "Untitled lecture",
    channel: player.videoDetails?.author ?? "YouTube",
    description: (player.videoDetails?.shortDescription ?? "").slice(0, 4_000),
    durationSeconds: Number(player.videoDetails?.lengthSeconds ?? 0) || 0,
    cues,
  };
}

/**
 * Reads a public lecture. yt-dlp is the reliable source; the direct caption
 * endpoint is the fallback for deployments that cannot install a binary.
 */
export async function loadLecture(videoId: string): Promise<Lecture> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new TranscriptError("That does not look like a YouTube video id.", "unavailable");
  }

  const viaYtDlp = await loadWithYtDlp(videoId);
  if (viaYtDlp) return viaYtDlp;

  try {
    return await loadFromCaptionEndpoint(videoId);
  } catch (error) {
    if (error instanceof TranscriptError && error.code === "network") {
      throw new TranscriptError(
        "Could not read the video. Install yt-dlp (or set YTDLP_PATH) so Freedemy can download captions reliably.",
        "tooling",
      );
    }
    throw error;
  }
}

/** Compact timecoded transcript, one line per cue. */
export function transcriptLines(cues: TranscriptCue[]): string {
  return cues
    .map((cue) => {
      const minutes = Math.floor(cue.start / 60);
      const seconds = cue.start % 60;
      return `[${minutes}:${String(seconds).padStart(2, "0")}] ${cue.text}`;
    })
    .join("\n");
}
