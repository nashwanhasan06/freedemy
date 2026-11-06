import Link from "next/link";

export function WatermarkFooter() {
  return (
    <footer className="mt-auto border-t border-border/80 bg-background/60">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center justify-between gap-2 px-5 py-4 text-xs text-muted-foreground sm:flex-row sm:px-8">
        <div className="text-center sm:text-left">
          <p className="mt-0.5 text-[0.7rem] text-muted-foreground/80">
            Freedemy is for coding and computer-science lectures only.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/" className="transition-colors hover:text-foreground">
            New course
          </Link>
          <Link href="/dashboard" className="transition-colors hover:text-foreground">
            Dashboard
          </Link>
        </div>
      </div>
    </footer>
  );
}
