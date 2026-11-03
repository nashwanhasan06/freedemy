"use client";

import { ChevronLeft, ChevronRight, Loader2, Radio } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/format";
import type { Lesson } from "@/lib/types";
import { cn } from "@/lib/utils";
import { loadYouTubeApi, type YouTubePlayer } from "@/lib/youtube";

type CoursePlayerProps = {
  videoId: string;
  lesson: Lesson;
  playerRef: React.RefObject<YouTubePlayer | null>;
  autoPlayNext: boolean;
  onAutoPlayNextChange: (value: boolean) => void;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
};

export function CoursePlayer({
  videoId,
  lesson,
  playerRef,
  autoPlayNext,
  onAutoPlayNextChange,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: CoursePlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const firstLessonRef = useRef(true);
  const finishedRef = useRef(false);

  // Create the player once per video.
  useEffect(() => {
    let disposed = false;
    let player: YouTubePlayer | null = null;

    loadYouTubeApi()
      .then((YT) => {
        if (disposed || !containerRef.current) return;
        player = new YT.Player(containerRef.current, {
          videoId,
          playerVars: {
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            autoplay: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (disposed) return;
              playerRef.current = player;
              setReady(true);
            },
            onStateChange: (event) => {
              if (disposed) return;
              if (event.data === YT.PlayerState.PLAYING) {
                setStarted(true);
              }
            },
          },
        });
      })
      .catch(() => setReady(false));

    return () => {
      disposed = true;
      playerRef.current = null;
      try {
        player?.destroy();
      } catch {
        // The iframe can already be gone during a hard navigation.
      }
    };
  }, [videoId, playerRef]);

  // Follow the selected section: seek to its start, then play.
  useEffect(() => {
    if (!ready) return;
    const player = playerRef.current;
    if (!player) return;

    finishedRef.current = false;
    player.seekTo(lesson.start, true);

    if (firstLessonRef.current) {
      // Never auto-play the very first frame of a page load.
      firstLessonRef.current = false;
      player.pauseVideo();
      return;
    }

    player.playVideo();
    setStarted(true);
  }, [ready, lesson.id, lesson.start, playerRef]);

  // Stop at the end of the section instead of letting the video run on.
  useEffect(() => {
    if (!ready) return;

    const interval = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || finishedRef.current) return;

      const current = player.getCurrentTime();
      if (current >= lesson.end - 0.25) {
        finishedRef.current = true;
        player.pauseVideo();

        if (autoPlayNext && hasNext) {
          onNext();
        }
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [ready, lesson.end, autoPlayNext, hasNext, onNext, playerRef]);

  const seekToStart = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    finishedRef.current = false;
    player.seekTo(lesson.start, true);
    player.playVideo();
  }, [lesson.start, playerRef]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="relative aspect-video w-full bg-neutral-950">
        <div ref={containerRef} className="absolute inset-0 size-full [&>iframe]:size-full" />
        {!started && (
          <button
            type="button"
            onClick={seekToStart}
            className="group absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-t from-neutral-950/85 via-neutral-950/40 to-neutral-950/10 text-white transition-colors hover:from-neutral-950/90"
            aria-label={`Play section · ${formatClock(lesson.start)} — ${lesson.title}`}
          >
            <span className="grid size-14 place-items-center rounded-full bg-white/95 text-neutral-950 shadow-lg transition-transform group-hover:scale-105">
              {ready ? (
                <svg viewBox="0 0 24 24" className="ml-0.5 size-6" fill="currentColor">
                  <path d="M8 5v14l11-7L8 5Z" />
                </svg>
              ) : (
                <Loader2 className="size-6 animate-spin" />
              )}
            </span>
            <span className="text-sm font-medium text-white/90">
              Play section · {formatClock(lesson.start)}
            </span>
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-card/90 px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onPrevious}
            disabled={!hasPrevious}
            aria-label="Previous section"
            className="h-8 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" />
            <span className="hidden sm:inline">Prev</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onNext}
            disabled={!hasNext}
            aria-label="Next section"
            className="h-8 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="size-3.5" />
          </Button>
        </div>

        <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />

        <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[0.78rem] font-medium text-muted-foreground transition-colors select-none hover:text-foreground has-[:checked]:text-foreground">
          <input
            type="checkbox"
            role="switch"
            checked={autoPlayNext}
            onChange={(event) => onAutoPlayNextChange(event.target.checked)}
            className="peer sr-only"
          />
          <span
            className={cn(
              "relative h-4 w-7 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
              autoPlayNext ? "bg-primary" : "bg-muted-foreground/30",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 left-0.5 size-3 rounded-full bg-white shadow-xs transition-transform duration-200",
                autoPlayNext ? "translate-x-3" : "translate-x-0",
              )}
            />
          </span>
          Auto-play next
        </label>

        <div className="ml-auto hidden items-center gap-1.5 rounded-md bg-muted/60 px-2.5 py-1 text-[0.72rem] text-muted-foreground tabular-nums sm:flex">
          <Radio className="size-3 text-primary" />
          Section plays {formatClock(lesson.start)} – {formatClock(lesson.end)}
        </div>
      </div>
    </div>
  );
}
