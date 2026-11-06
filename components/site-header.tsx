import type { ReactNode } from "react";

import { AuthNav } from "@/components/auth-nav";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type SiteHeaderProps = {
  right?: ReactNode;
  className?: string;
};

export function SiteHeader({ right, className }: SiteHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur-md transition-colors",
        "after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-primary/30 after:to-transparent",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-8">
        <div className="flex h-14 items-center justify-between gap-2 sm:h-16 sm:gap-3">
          <Brand className="min-w-0 shrink-0" />

          <nav className="flex shrink-0 items-center justify-end gap-1 sm:gap-1.5">
            {right ?? <AuthNav />}
            <ThemeToggle />
          </nav>
        </div>
      </div>
    </header>
  );
}
