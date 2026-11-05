import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * The mortarboard + ribbon F from the brand sheet. The PNG is the trimmed
 * glyph alone (the wordmark in the source file is white, so it is set in type
 * here instead and inherits the text colour).
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <Image
      src="/freedemy-mark.png"
      alt=""
      width={32}
      height={32}
      priority
      aria-hidden
      className={cn("size-8 shrink-0", className)}
    />
  );
}

export function Brand({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-2 rounded-lg transition-transform hover:scale-[1.02] sm:gap-2.5",
        className,
      )}
    >
      <div className="relative size-8 shrink-0">
        <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-[#2753ff] to-[#7c3aed] opacity-0 blur-sm transition-opacity duration-300 group-hover:opacity-70" />
        <BrandMark className="relative" />
      </div>
      <span className="text-base font-bold tracking-tight whitespace-nowrap bg-gradient-to-r from-foreground via-foreground to-foreground/80 group-hover:from-foreground group-hover:to-primary bg-clip-text transition-colors sm:text-[1.05rem]">
        Freedemy
      </span>
    </Link>
  );
}
