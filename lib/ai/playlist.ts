import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { YTDLP, YTDLP_COOKIES, YTDLP_PROXY } from "@/lib/ai/transcript";

const execFileAsync = promisify(execFile);

/** A playlist longer than this is refused at paste time, not mid-build. */
export const MAX_PLAYLIST_VIDEOS = 50;
/** ~50 hours of video: one course has to be finishable. */
export const MAX_PLAYLIST_SECONDS = 50 * 60 * 60;

export type PlaylistEntry = {
  videoId: string;
  title: string;
  durationSeconds: number;
};

export type Playlist = {
  title: string;
  entries: PlaylistEntry[];
};

/** User-facing: the message goes straight back into the paste form. */
export class PlaylistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlaylistError";
  }
}

/**
 * Reads a playlist's ordered entries (id, title, duration) without touching
 * captions — the build fetches those per video. `--flat-playlist` keeps the
 * call one cheap metadata request no matter how long the playlist is.
 */
export async function loadPlaylist(playlistId: string): Promise<Playlist> {
  let stdout = "";
  try {
    const result = await execFileAsync(
      YTDLP,
      [
        "--ignore-config",
        "--no-warnings",
        "--no-progress",
        "--flat-playlist",
        "--dump-single-json",
        ...(YTDLP_COOKIES ? ["--cookies", YTDLP_COOKIES] : []),
        ...(YTDLP_PROXY ? ["--proxy", YTDLP_PROXY] : []),
        `https://www.youtube.com/playlist?list=${playlistId}`,
      ],
      { timeout: 120_000, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
    );
    stdout = result.stdout ?? "";
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    const detail = String((error as { stderr?: string } | null)?.stderr ?? "").trim();
    if (code === "ENOENT") {
      throw new PlaylistError(
        "yt-dlp is not installed on this server, so playlists cannot be read. Install it or set YTDLP_PATH.",
      );
    }
    if (/429|too many requests/i.test(detail)) {
      throw new PlaylistError(
        "YouTube is rate-limiting this machine. Wait a few minutes, then paste the playlist again.",
      );
    }
    throw new PlaylistError(
      `Could not read that playlist.${detail ? ` (${detail.split("\n").filter(Boolean).at(-1)?.slice(0, 200)})` : ""}`,
    );
  }

  let parsed: {
    title?: unknown;
    entries?: unknown;
  };
  try {
    parsed = JSON.parse(stdout) as typeof parsed;
  } catch {
    throw new PlaylistError("That playlist could not be read. Check the link and try again.");
  }

  const entries = (Array.isArray(parsed.entries) ? parsed.entries : [])
    .map((raw) => {
      const item = raw as Record<string, unknown>;
      const videoId = typeof item.id === "string" ? item.id.trim() : "";
      const duration = Number(item.duration);
      return {
        videoId,
        title: typeof item.title === "string" ? item.title.trim().slice(0, 200) : "",
        durationSeconds: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 0,
      };
    })
    .filter((entry) => /^[A-Za-z0-9_-]{11}$/.test(entry.videoId));

  if (entries.length === 0) {
    throw new PlaylistError("That playlist has no readable videos.");
  }
  if (entries.length > MAX_PLAYLIST_VIDEOS) {
    throw new PlaylistError(
      `That playlist has ${entries.length} videos — one course can hold at most ${MAX_PLAYLIST_VIDEOS}. Paste a shorter playlist.`,
    );
  }

  const total = entries.reduce((sum, entry) => sum + entry.durationSeconds, 0);
  if (total > MAX_PLAYLIST_SECONDS) {
    throw new PlaylistError(
      `That playlist runs ${Math.round(total / 3_600)} hours — one course can hold at most ${MAX_PLAYLIST_SECONDS / 3_600} hours of video.`,
    );
  }

  return {
    title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim().slice(0, 200) : "YouTube playlist",
    entries,
  };
}
