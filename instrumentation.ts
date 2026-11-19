export async function register(): Promise<void> {
  // `register` runs in every runtime — the update helper is Node-only
  // (child_process, fs), so it must never enter the Edge bundle. Dynamic
  // import behind the runtime guard keeps it out.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { silentYtDlpUpdate } = await import("./lib/updates");
  // Not awaited: an offline or missing yt-dlp must never delay the boot.
  // This is the only silent updater — app and dependency updates stay behind
  // the Settings button.
  void silentYtDlpUpdate();
}
