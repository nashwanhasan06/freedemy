"use client";

import { ArrowUp, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { formatClock } from "@/lib/format";
import type { Lesson } from "@/lib/types";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  role: "student" | "tutor";
  text: string;
  at?: number;
};

const STOP_WORDS = new Set([
  "what", "which", "when", "where", "that", "this", "with", "does", "have", "from",
  "your", "about", "into", "they", "them", "than", "then", "there", "here", "will",
  "would", "could", "should", "mean", "means", "explain", "tell", "give", "example",
  "why", "how", "the", "and", "for", "are", "you", "can", "not", "but", "its",
]);

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));
}

/** Deterministic stand-in for the tutor model: answers only from the section. */
function answerFor(question: string, lesson: Lesson): { text: string; at: number } {
  const lower = question.toLowerCase();
  const span = Math.max(30, Math.round((lesson.end - lesson.start) * 0.3));

  const term = lesson.keyTerms.find((item) => lower.includes(item.term.toLowerCase()));
  if (term) {
    return {
      text: `${term.term} — ${term.definition}`,
      at: lesson.start + Math.round(span * 0.4),
    };
  }

  const words = significantWords(question);
  for (const block of lesson.notes) {
    const match = block.bullets.find((bullet) => {
      const bulletWords = significantWords(bullet);
      return words.some((word) => bulletWords.includes(word));
    });
    if (match) {
      return {
        text: `${match}\n\nThat's the point the section makes under “${block.heading}”.`,
        at: lesson.start + span,
      };
    }
  }

  return {
    text: `This section (${formatClock(lesson.start)}–${formatClock(lesson.end)}) is about one thing: ${lesson.summary}\n\nTry asking about ${lesson.keyTerms
      .map((item) => item.term)
      .join(", ")}.`,
    at: lesson.start,
  };
}

function welcomeMessage(lesson: Lesson): Message {
  return {
    id: "welcome",
    role: "tutor",
    text: `I can only answer from “${lesson.title}”. Ask me anything from this section — I'll quote where it's covered.`,
    at: lesson.start,
  };
}

export function TutorPanel({
  lesson,
  onRewatch,
}: {
  lesson: Lesson;
  onRewatch: (at: number) => void;
}) {
  const [messages, setMessages] = useState<Message[]>(() => [welcomeMessage(lesson)]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, pending]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  function send(question: string) {
    const trimmed = question.trim();
    if (!trimmed || pending) return;

    const reply = answerFor(trimmed, lesson);
    setMessages((current) => [
      ...current,
      { id: `s-${Date.now()}`, role: "student", text: trimmed },
    ]);
    setInput("");
    setPending(true);

    const timer = window.setTimeout(() => {
      setMessages((current) => [
        ...current,
        { id: `t-${Date.now()}`, role: "tutor", text: reply.text, at: reply.at },
      ]);
      setPending(false);
    }, 650);

    timersRef.current.push(timer);
  }

  const suggestions = [
    `What is ${lesson.keyTerms[0]?.term ?? "this section"}?`,
    "Explain that in simpler terms",
    "Why does this matter in practice?",
  ];

  return (
    <div className="overflow-hidden rounded-xl bg-card border border-border shadow-xs">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <p className="flex items-center gap-1.5 text-[0.9rem] font-semibold">
            Section tutor
          </p>
          <p className="text-[0.72rem] text-muted-foreground">{lesson.title}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[0.65rem] font-medium text-muted-foreground">
          <Lock className="size-3" />
          This section only
        </span>
      </div>

      <ScrollArea className="h-[360px]">
        <div className="flex flex-col gap-3 px-4 py-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex",
                message.role === "student" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[0.84rem] leading-relaxed whitespace-pre-line",
                  message.role === "student"
                    ? "rounded-br-sm bg-primary text-primary-foreground"
                    : "rounded-bl-sm bg-muted text-foreground/90",
                )}
              >
                {message.text}
                {message.role === "tutor" && message.at !== undefined && (
                  <button
                    type="button"
                    onClick={() => onRewatch(message.at ?? lesson.start)}
                    className="mt-2 flex items-center gap-1 rounded-full bg-background/80 px-2 py-1 text-[0.68rem] font-medium text-primary ring-1 ring-primary/15 transition-colors hover:bg-background"
                  >
                    <svg viewBox="0 0 24 24" className="size-2.5 fill-current">
                      <path d="M8 5v14l11-7L8 5Z" />
                    </svg>
                    {formatClock(message.at)}
                  </button>
                )}
              </div>
            </div>
          ))}

          {pending && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-3.5 py-3">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      {messages.length <= 1 && (
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
              send(input);
            }
          }}
          placeholder="Ask about this section…"
          rows={1}
          className="min-h-10 flex-1 resize-none py-2.5 text-[0.85rem]"
        />
        <Button
          size="icon"
          onClick={() => send(input)}
          disabled={!input.trim() || pending}
          aria-label="Send question"
          className="size-10 shrink-0 rounded-lg"
        >
          <ArrowUp />
        </Button>
      </div>
    </div>
  );
}
