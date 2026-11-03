"use client";

import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { Lesson } from "@/lib/types";

export function NotesPanel({ lesson }: { lesson: Lesson }) {
  const [copied, setCopied] = useState(false);

  const plainText = useMemo(() => {
    const lines: string[] = [`${lesson.title} — Notes`, ""];
    for (const block of lesson.notes) {
      lines.push(block.heading.toUpperCase());
      for (const bullet of block.bullets) lines.push(`• ${bullet}`);
      lines.push("");
    }
    return lines.join("\n").trim();
  }, [lesson]);

  async function copyNotes() {
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      toast.success("Notes copied to clipboard");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access");
    }
  }

  return (
    <div className="rounded-xl bg-card border border-border shadow-xs">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <p className="text-[0.9rem] font-semibold">Notes</p>
          <p className="text-[0.72rem] text-muted-foreground">
            Written from this section&apos;s transcript
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={copyNotes}
          className="h-8 gap-1.5 px-2.5 text-[0.78rem]"
        >
          {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <div className="flex flex-col gap-7 px-5 py-6 sm:px-7">
        {lesson.notes.map((block) => (
          <section key={block.heading}>
            <h2 className="text-[0.95rem] font-semibold tracking-tight">{block.heading}</h2>
            <ul className="mt-3 flex flex-col gap-2.5">
              {block.bullets.map((bullet) => (
                <li
                  key={bullet}
                  className="flex gap-2.5 text-[0.9rem] leading-[1.75] text-foreground"
                >
                  <span className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-primary/60" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="border-t border-border pt-4 text-[0.72rem] text-muted-foreground">
          {lesson.keyTerms.length} key terms defined in the Overview tab
        </p>
      </div>
    </div>
  );
}
