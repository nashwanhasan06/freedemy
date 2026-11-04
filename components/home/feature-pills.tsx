import { CircleCheck, NotebookPen, Rewind } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type Pill = {
  label: string;
  icon: LucideIcon;
  /** The signature feature gets the accent treatment. */
  signature?: boolean;
};

const PILLS: Pill[] = [
  { label: "Chapters, notes and assignments", icon: NotebookPen },
  { label: "Quiz after every section", icon: CircleCheck },
  { label: "Wrong answers rewind to the exact moment", icon: Rewind, signature: true },
];

export function FeaturePills() {
  return (
    <ul className="mx-auto mt-6 flex w-full max-w-[760px] flex-wrap items-center justify-center gap-2">
      {PILLS.map(({ label, icon: Icon, signature }) => (
        <li key={label}>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.72rem] font-medium whitespace-nowrap backdrop-blur-md transition-all duration-200 sm:px-3 sm:text-[0.75rem]",
              signature
                ? "border-primary/40 bg-primary/10 text-foreground shadow-xs"
                : "border-border bg-card/80 text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            <Icon
              className={cn("size-3.5", signature ? "text-[#7c3aed]" : "text-foreground/50")}
              aria-hidden
            />
            {label}
          </span>
        </li>
      ))}
    </ul>
  );
}
