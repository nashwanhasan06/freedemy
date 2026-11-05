"use client";

import { ArrowLeft, ArrowUp, Loader2, Play, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Markdown } from "@/components/markdown";
import { askTutorAction } from "@/lib/actions/tutor";
import type { TutorMessage } from "@/lib/actions/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { formatClock } from "@/lib/format";
import type { KeyTerm } from "@/lib/types";
import { cn } from "@/lib/utils";



export function TutorChat({
  courseSlug,
  courseTitle,
  lessonId,
  lessonTitle,
  lessonSummary,
  keyTerms,
  initialMessages,
}: {
  courseSlug: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
  lessonSummary: string;
  keyTerms: KeyTerm[];
  initialMessages: TutorMessage[];
}) {
  const [messages, setMessages] = useState<TutorMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const localId = useRef(0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, pending]);

  async function send(question: string) {
    const trimmed = question.trim();
    if (!trimmed || pending) return;

    const optimistic: TutorMessage = {
      id: `local-${(localId.current += 1)}`,
      role: "user",
      content: trimmed,
      at: null,
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, optimistic]);
    setInput("");
    setPending(true);

    try {
      const result = await askTutorAction({ lessonId, question: trimmed });
      if (result.ok) {
        setMessages((current) => [...current, result.message]);
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("The tutor could not answer just now.");
    } finally {
      setPending(false);
    }
  }

  const suggestions = [
    keyTerms[0] ? `What does ${keyTerms[0].term} mean here?` : "Explain this section simply",
    "Where would I use this in real code?",
    "Check my understanding of this section",
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="hidden flex-col gap-3 lg:flex">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 self-start rounded-lg border-border bg-card px-3 text-xs font-semibold text-foreground shadow-xs transition-all hover:border-primary/50 hover:bg-accent/40 hover:text-primary"
          render={<Link href={`/course/${courseSlug}#lesson-${lessonId}`} />}
          nativeButton={false}
        >
          <ArrowLeft className="size-3.5" />
          <span>Back to the section</span>
        </Button>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-1.5 text-[0.66rem] font-semibold tracking-[0.12em] text-primary uppercase">
            <Sparkles className="size-3" />
            Assignment tutor
          </p>
          <h1 className="mt-1.5 text-[0.95rem] font-semibold leading-snug">{lessonTitle}</h1>
          <p className="mt-1 text-[0.72rem] text-muted-foreground">{courseTitle}</p>

          <p className="mt-3 text-[0.8rem] leading-relaxed text-foreground/75">{lessonSummary}</p>
        </div>

        {keyTerms.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-[0.7rem] font-semibold text-muted-foreground uppercase">Key terms</p>
            <dl className="mt-2 flex flex-col gap-2.5">
              {keyTerms.slice(0, 6).map((term) => (
                <div key={term.term}>
                  <dt className="text-[0.78rem] font-medium">{term.term}</dt>
                  <dd className="mt-0.5 text-[0.74rem] leading-relaxed text-muted-foreground">
                    {term.definition}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </aside>

      <div className="flex min-h-[520px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="text-[0.85rem] font-semibold">Ask about this assignment</p>
            <p className="text-[0.72rem] text-muted-foreground">
              Answers are grounded in this section&apos;s notes and exercises
            </p>
          </div>
          <span className="hidden shrink-0 rounded-full bg-accent px-2.5 py-1 text-[0.65rem] font-medium text-accent-foreground sm:block">
            Section only
          </span>
        </div>

        <ScrollArea className="h-[calc(100vh-20rem)] min-h-[380px]">
          <div className="flex flex-col gap-3 px-4 py-4">
            {messages.length === 0 && (
              <div className="rounded-xl border border-dashed border-border bg-muted/40 p-4 text-[0.82rem] leading-relaxed text-muted-foreground">
                I&apos;ve read this section&apos;s notes, quiz and coding tasks. Ask me to explain a
                concept, debug your approach, or quiz you before you submit.
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[0.85rem] leading-relaxed",
                    message.role === "user"
                      ? "rounded-br-sm bg-primary whitespace-pre-line text-primary-foreground"
                      : "rounded-bl-sm bg-muted text-foreground/90",
                  )}
                >
                  {message.role === "assistant" ? (
                    <Markdown content={message.content} />
                  ) : (
                    message.content
                  )}

                  {message.role === "assistant" && message.at !== null && message.at !== undefined && (
                    <Link
                      href={`/course/${courseSlug}#lesson-${lessonId}`}
                      className="mt-2 flex w-fit items-center gap-1 rounded-full bg-background/80 px-2 py-1 text-[0.68rem] font-medium text-primary ring-1 ring-primary/15 transition-colors hover:bg-background"
                    >
                      <Play className="size-2.5 fill-current" />
                      {formatClock(message.at)}
                    </Link>
                  )}
                </div>
              </div>
            ))}

            {pending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-muted px-3.5 py-3">
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                  <span className="text-[0.72rem] text-muted-foreground">Thinking…</span>
                </div>
              </div>
            )}

            <div ref={endRef} />
          </div>
        </ScrollArea>

        {messages.length === 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-border px-4 py-3">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => send(suggestion)}
                className="rounded-full border border-border bg-background px-2.5 py-1 text-[0.72rem] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 border-t border-border p-3">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(input);
              }
            }}
            placeholder="Ask about this section…"
            rows={1}
            className="min-h-10 flex-1 resize-none py-2.5 text-[0.85rem]"
          />
          <Button
            size="icon"
            onClick={() => void send(input)}
            disabled={!input.trim() || pending}
            aria-label="Send question"
            className="size-10 shrink-0 rounded-lg"
          >
            {pending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
      </div>
    </div>
  );
}
