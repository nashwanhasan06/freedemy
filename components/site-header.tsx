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
      <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-8">
        <Brand />
        <nav className="flex items-center gap-1.5">
          {right ?? <AuthNav />}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
