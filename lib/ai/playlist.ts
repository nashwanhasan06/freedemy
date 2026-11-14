import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { YTDLP, YTDLP_COOKIES, YTDLP_PROXY } from "@/lib/ai/transcript";

const execFileAsync = promisify(execFile);

/** A playlist longer than this is refused at paste time, not mid-build. */
export const MAX_PLAYLIST_VIDEOS = 100;
/** ~70 hours of video: one course has to be finishable. */
export const MAX_PLAYLIST_SECONDS = 70 * 60 * 60;

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

/** The episode number a title carries ("Lec 12", "Part 02", "12. Title"), or null. */
function lectureNumber(title: string): number | null {
  const keyword =
    /(?:lec(?:ture)?|lesson|ep(?:isode)?|part|section|session|video|class|day|week|chapter)\s*[-#:.]?\s*(\d{1,3})\b/i.exec(
      title,
    );
  if (keyword) return Number(keyword[1]);
  const leading = /^\s*#?\s*(\d{1,3})\s*[.)\]]\s+\S/.exec(title);
  if (leading) return Number(leading[1]);
  return null;
}

/**
 * True when the titles clearly count DOWN the playlist (some channels ship
 * the last lecture first: "Lec 70 … " at the top, "Lec 01 …" at the bottom),
 * so the entries must be reversed into teaching order. Conservative: it needs
 * a dense run of numbered titles whose local steps mostly descend — a playlist
 * whose titles carry no numbers is left exactly as pasted.
 */
function looksDescending(entries: { title: string }[]): boolean {
  const numbered: { index: number; n: number }[] = [];
  entries.forEach((entry, index) => {
    const n = lectureNumber(entry.title);
    if (n !== null) numbered.push({ index, n });
  });
  if (numbered.length < 4 || numbered.length * 2 < entries.length) return false;

  let down = 0;
  let up = 0;
  for (let k = 1; k < numbered.length; k += 1) {
    const prev = numbered[k - 1];
    const cur = numbered[k];
    if (cur.index - prev.index > 3) continue; // too wide a gap to trust
    if (prev.n > cur.n) down += 1;
    else if (prev.n < cur.n) up += 1;
  }
  return down >= 3 && down > up;
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

  let entries = (Array.isArray(parsed.entries) ? parsed.entries : [])
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

  // Some playlists ship the last lecture first — title numbers counting down
  // the list. Detect that from the titles and reverse into teaching order, so
  // positions, caption fetches and chapters all follow the real sequence.
  if (looksDescending(entries)) {
    console.info(
      `[playlist] ${playlistId}: titles count down — reversed ${entries.length} entries into teaching order`,
    );
    entries = [...entries].reverse();
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
