import type { ReactNode } from "react";

import { AigniteBadge } from "@/components/aignite-badge";
import { AuthNav } from "@/components/auth-nav";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type SiteHeaderProps = {
  right?: ReactNode;
  className?: string;
};

export { AigniteBadge };

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
        <div className="flex items-center justify-between gap-2 py-2 sm:grid sm:h-16 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-3 sm:py-0">
          <Brand className="min-w-0 shrink-0 justify-self-start" />

          <div className="hidden justify-self-center sm:block">
            <AigniteBadge className="sm:h-10 lg:h-12" />
          </div>

          <nav className="flex shrink-0 items-center justify-end gap-1 sm:gap-1.5 sm:justify-self-end">
            {right ?? <AuthNav />}
            <ThemeToggle />
          </nav>
        </div>

        {/* Narrow screens keep the full lockup visible on its own centred row. */}
        <div className="flex justify-center pb-2 sm:hidden">
          <AigniteBadge />
        </div>
      </div>
    </header>
  );
}
