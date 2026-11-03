"use client";

import { useSyncExternalStore } from "react";
import { CoursePreview } from "@/components/home/course-preview";
import { FeaturePills } from "@/components/home/feature-pills";
import { GenerateForm } from "@/components/home/generate-form";
import { WebThreads } from "@/components/ui/web-threads";

const WEB_THREADS_COLORS = ["#2753ff", "#7c3aed"];

function subscribeTheme(onChange: () => void) {
  window.addEventListener("freedemy-theme-change", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("freedemy-theme-change", onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getThemeSnapshot() {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function Hero() {
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => "dark" as const);
  const isLight = theme === "light";

  return (
    <section className="relative isolate overflow-hidden min-h-[880px] sm:min-h-[960px]">
      {/* Official React Bits WebThreads background */}
      <div
        aria-hidden
        className="pointer-events-auto absolute inset-0 -z-20 overflow-hidden opacity-70 transition-opacity duration-700"
      >
        <WebThreads
          colors={WEB_THREADS_COLORS}
          coreColor={isLight ? "#4338ca" : "#ffffff"}
          backgroundColor="transparent"
          lightMode={isLight}
          threadCount={9}
          speed={0.28}
          frequency={4.2}
          spread={0.24}
          taper={0.85}
          position={0.48}
          pinch={0.5}
          nodes={1}
          glow={isLight ? 0.015 : 0.022}
          thickness={1.25}
          brightness={isLight ? 0.55 : 0.48}
          opacity={1}
          depth={0.35}
          pulses={0.25}
          mirror
          shimmer
          fade={0.12}
          mouseInteraction
          mouseStrength={0.65}
          pulseOnClick
          className="h-full w-full"
        />
        {/* Soft bottom vignette into background */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-b from-transparent via-background/40 to-background/95" />
      </div>

      {/* Grid overlay for technical precision texture */}
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 -z-10 opacity-70" />

      {/* Hero radial bloom */}
      <div
        aria-hidden
        className="hero-glow pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px]"
      />

      <div className="relative z-10 mx-auto w-full max-w-4xl px-4 pt-16 text-center sm:px-6 lg:pt-24">
        <h1 className="mx-auto max-w-[780px] text-[2.15rem] leading-[1.04] font-semibold tracking-[-0.035em] text-balance sm:text-[2.9rem] lg:text-[3.25rem]">
          Studying made{" "}
          <span className="text-gradient-logo font-bold uppercase">
            Easier
          </span>
          .
        </h1>

        <p className="mx-auto mt-6 max-w-[540px] text-[0.98rem] leading-relaxed text-pretty text-muted-foreground sm:text-base">
          Drop a YouTube lecture. Get chapters, notes, and quizzes — with a tutor that
          skips back to the exact moment you got something wrong.
        </p>

        <div id="paste" className="mt-10 scroll-mt-24">
          <GenerateForm />
        </div>

        <FeaturePills />

        <CoursePreview />
      </div>
    </section>
  );
}
