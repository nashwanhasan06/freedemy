"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

const STORAGE_KEY = "freedemy-theme";
const CHANGE_EVENT = "freedemy-theme-change";
const STYLE_ID = "theme-transition-styles";

/**
 * The theme lives on <html data-theme="dark">, so the DOM is the source of
 * truth and a store subscription keeps the label in sync. A data attribute
 * rather than a class is deliberate: React owns <html className> for the font
 * variable and would drop a class added before hydration.
 */
function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(next: "light" | "dark") {
  const root = document.documentElement;
  root.setAttribute("data-theme", next);
  root.style.colorScheme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private mode: the toggle still works for this page view.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Reveal effect adapted from Skiper UI's skiper26 (View Transition API, free
 * tier — credit: skiper-ui.com, inspired by rudrodip/theme-toggle-effect).
 * `variant="rectangle"` + `start="top-down"`: the new theme wipes down the page
 * from the top edge.
 */
const REVEAL_CSS = `
::view-transition-group(root) {
  animation-duration: 700ms;
  animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}
::view-transition-old(root) {
  animation: none;
  z-index: -1;
}
::view-transition-new(root) {
  animation: freedemy-theme-reveal 700ms cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes freedemy-theme-reveal {
  from { clip-path: polygon(0% 0%, 100% 0%, 100% 0%, 0% 0%); }
  to { clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%); }
}
@media (prefers-reduced-motion: reduce) {
  ::view-transition-new(root) { animation: none; }
}
`;

function injectStyles(css: string) {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = css;
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => "dark" as const);
  const next = theme === "dark" ? "light" : "dark";

  function toggle() {
    const doc = document as Document & {
      startViewTransition?: (callback: () => void) => unknown;
    };
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!doc.startViewTransition || reduceMotion) {
      applyTheme(next);
      return;
    }

    injectStyles(REVEAL_CSS);
    doc.startViewTransition(() => applyTheme(next));
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      // The pre-hydration attribute comes from the inline script, not the server HTML.
      suppressHydrationWarning
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="text-muted-foreground hover:text-foreground"
    >
      <Sun className="hidden size-4 dark:block" />
      <Moon className="size-4 dark:hidden" />
    </Button>
  );
}
