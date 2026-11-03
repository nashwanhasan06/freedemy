import Link from "next/link";
import type { ReactNode } from "react";

import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
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
          {right ?? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-[0.83rem]"
                render={<Link href="/dashboard" />}
                nativeButton={false}
              >
                Dashboard
              </Button>
              <Button
                size="sm"
                className="h-8 px-3 text-[0.83rem]"
                render={<Link href="/#paste" />}
                nativeButton={false}
              >
                New course
              </Button>
            </>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
