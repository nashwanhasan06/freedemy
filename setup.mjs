#!/usr/bin/env node
/**
 * Freedemy setup — the single file you run after cloning (or unzipping a
 * GitHub release):
 *
 *     git clone https://github.com/nashwanhasan06/freedemy.git
 *     cd freedemy
 *     node setup.mjs
 *     npm run dev
 *
 * Zero dependencies: Node builtins only. Installs npm packages, creates
 * .env.local from .env.example (everything in it is optional), and installs
 * yt-dlp if it is missing (it fetches YouTube captions — the one hard
 * requirement beyond an AI key). Hard failures exit 1; a missing yt-dlp only
 * warns, because the rest of the app works without it.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
// Everything anchors to the folder holding this file, not the shell's cwd —
// `node path/to/freedemy/setup.mjs` must behave like `cd freedemy && node setup.mjs`.
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === "win32";
const TOTAL = 4;

const tag = (n, mark, msg) => console.log(`[${n}/${TOTAL}] ${mark} ${msg}`);
const ok = (n, msg) => tag(n, "✓", msg);
const warn = (n, msg) => tag(n, "!", msg);
const die = (n, msg) => {
  tag(n, "✗", msg);
  process.exit(1);
};

/** Fixed-literal commands only — args are never user input. */
function run(cmd, args, { stdio = "pipe", cwd = ROOT } = {}) {
  const opts = { encoding: "utf8", stdio, cwd, windowsHide: true };
  if (isWin) {
    // npm/winget resolve through .cmd shims, which Node refuses to spawn
    // directly — go through cmd.exe with a pre-joined (fixed-literal) command
    // line instead of shell:true, which would emit a deprecation warning.
    return spawnSync("cmd.exe", ["/d", "/s", "/c", `${cmd} ${args.join(" ")}`], opts);
  }
  return spawnSync(cmd, args, opts);
}

console.log("\nFreedemy setup\n==============\n");

// --- 1. Node ---------------------------------------------------------------
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 9)) {
  die(
    1,
    `Node ${process.versions.node} is too old — Next.js 16 needs >= 20.9.\n` +
      `     Install the current LTS from https://nodejs.org and re-run: node setup.mjs`,
  );
}
ok(1, `Node ${process.versions.node} (needs >= 20.9)`);

// Guard against running in the wrong folder (e.g. the release zip extracted
// into a nested directory, setup.mjs run from its parent).
let pkg;
try {
  pkg = require("./package.json");
} catch {
  die(1, "package.json not found — run this from the freedemy folder: node setup.mjs");
}
if (pkg.name !== "freedemy") {
  die(1, `this folder is "${pkg.name}", not Freedemy — run setup.mjs from the project root`);
}

// --- 2. npm dependencies ---------------------------------------------------
console.log(`[2/${TOTAL}] npm install (first run takes a minute)…`);
const install = run("npm", ["install"], { stdio: "inherit" });
if (install.status !== 0) {
  die(2, "npm install failed — check the output above, then re-run: node setup.mjs");
}
// better-sqlite3 ships a native binding; verify it actually loads before
// declaring success (the most common install failure on a new machine).
try {
  require("better-sqlite3");
} catch (error) {
  die(
    2,
    `better-sqlite3 could not load after install:\n     ${String(error).slice(0, 300)}\n` +
      `     On Windows this usually means a stale native build — run: npm rebuild better-sqlite3`,
  );
}
ok(2, "npm dependencies installed (better-sqlite3 loads)");

// --- 3. .env.local ---------------------------------------------------------
const envExample = path.join(ROOT, ".env.example");
const envLocal = path.join(ROOT, ".env.local");
if (existsSync(envLocal)) {
  ok(3, ".env.local already exists (left untouched)");
} else if (existsSync(envExample)) {
  copyFileSync(envExample, envLocal);
  ok(3, ".env.local created from .env.example (every value is optional)");
} else {
  warn(3, ".env.example missing — skipped (nothing needs it; defaults apply)");
}

// --- 4. yt-dlp -------------------------------------------------------------
function ytdlpVersion() {
  const res = run("yt-dlp", ["--version"]);
  const out = `${res.stdout ?? ""}`.trim();
  return res.status === 0 && out ? out.split(/\r?\n/)[0] : null;
}

let version = ytdlpVersion();
if (version) {
  ok(4, `yt-dlp ${version}`);
} else {
  console.log(`[4/${TOTAL}] yt-dlp not found — installing…`);
  if (isWin) {
    run(
      "winget",
      ["install", "--id", "yt-dlp.yt-dlp", "-e", "--accept-source-agreements", "--accept-package-agreements"],
      { stdio: "inherit" },
    );
  } else {
    const pip = run("python3", ["--version"]).status === 0 ? "python3" : "python";
    run(pip, ["-m", "pip", "install", "-U", "yt-dlp"], { stdio: "inherit" });
  }
  version = ytdlpVersion();
  if (version) {
    ok(4, `yt-dlp ${version}`);
  } else {
    warn(
      4,
      "yt-dlp is still not on PATH — course generation needs it for transcripts.\n" +
        "     Install it manually, then confirm with `yt-dlp --version`:\n" +
        "       winget install yt-dlp.yt-dlp     (Windows)\n" +
        "       pip install -U yt-dlp            (any platform)\n" +
        "     If it lives somewhere unusual, set YTDLP_PATH in .env.local.",
    );
  }
}

// --- done ------------------------------------------------------------------
console.log(`
All set. Next:

  npm run dev                 start the app → http://localhost:3000

  Then in the browser:
    1. Create an account (name + password + a security question — no email).
    2. Open Settings (gear icon, top right) and paste your AI API key
       (NVIDIA NIM, OpenAI, Anthropic, DeepSeek or Gemini) — or pick Custom
       and point it at your own OpenAI-compatible endpoint.
    3. Paste a YouTube lecture link and press Generate.

  Updates: yt-dlp keeps itself current silently once a day; update the rest
  with "npm update" / "git pull" when you want to.
`);
