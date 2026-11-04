"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; text: string }
  | { type: "code"; lang: string; code: string }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "rule" };

const FENCE = /^```\s*([a-zA-Z0-9+#-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.+)$/;
const BULLET = /^[-*+]\s+(.+)$/;
const NUMBERED = /^\d+[.)]\s+(.+)$/;
const RULE = /^(?:---|\*\*\*|___)$/;
const QUOTE = /^>\s?(.*)$/;
const TABLE_ROW = /^\|(.+)\|$/;
const TABLE_DIVIDER = /^\|?[\s:|-]+\|?$/;

function cells(line: string): string[] {
  const match = TABLE_ROW.exec(line.trim());
  const body = match ? match[1] : line;
  return body.split("|").map((cell) => cell.trim());
}

/** Line-based Markdown subset: headings, lists, quotes, tables, fences. */
function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = FENCE.exec(line.trim());
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push({ type: "code", lang: fence[1].toLowerCase(), code: body.join("\n") });
      continue;
    }

    const heading = HEADING.exec(line.trim());
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (RULE.test(line.trim())) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    const quote = QUOTE.exec(line.trim());
    if (quote) {
      const collected: string[] = [];
      while (index < lines.length) {
        const next = QUOTE.exec(lines[index].trim());
        if (!next) break;
        collected.push(next[1].trim());
        index += 1;
      }
      blocks.push({ type: "quote", text: collected.join(" ") });
      continue;
    }

    if (TABLE_ROW.test(line.trim()) && TABLE_DIVIDER.test((lines[index + 1] ?? "").trim())) {
      const head = cells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && TABLE_ROW.test(lines[index].trim())) {
        rows.push(cells(lines[index]));
        index += 1;
      }
      blocks.push({ type: "table", head, rows });
      continue;
    }

    if (BULLET.test(line.trim()) || NUMBERED.test(line.trim())) {
      const ordered = NUMBERED.test(line.trim());
      const items: string[] = [];
      while (index < lines.length) {
        const current = lines[index].trim();
        const match = ordered ? NUMBERED.exec(current) : BULLET.exec(current);
        if (!match) break;
        items.push(match[1].trim());
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index].trim();
      if (
        !current ||
        FENCE.test(current) ||
        HEADING.test(current) ||
        RULE.test(current) ||
        QUOTE.test(current) ||
        BULLET.test(current) ||
        NUMBERED.test(current) ||
        TABLE_ROW.test(current)
      ) {
        break;
      }
      paragraph.push(current);
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*|\[[^\]]+\]\([^)\s]+\))/g;

function inline(text: string, keyBase: string): ReactNode[] {
  return text.split(INLINE).map((part, index) => {
    const key = `${keyBase}-${index}`;
    if (!part) return null;

    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={key} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={key}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }

    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      return (
        <a
          key={key}
          href={link[2]}
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium text-primary underline decoration-primary/30 underline-offset-2"
        >
          {link[1]}
        </a>
      );
    }

    return part;
  });
}

let mermaidModule: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  mermaidModule ??= import("mermaid").then((module) => module.default);
  return mermaidModule;
}

/**
 * Diagrams are drawn in the browser only: mermaid needs the DOM, and pulling it
 * into the server bundle would slow every course page down for the few blocks
 * that actually contain a diagram.
 */
function MermaidDiagram({ chart }: { chart: string }) {
  const reactId = useId();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;

    (async () => {
      try {
        const mermaid = await loadMermaid();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: document.documentElement.classList.contains("dark") ? "dark" : "neutral",
          fontFamily: "inherit",
          themeVariables: { fontSize: "13px" },
          // Mermaid's default `width: 100%` scales a wide flow down until its
          // labels are unreadable on a phone. Render at the size the diagram
          // needs and let the wrapper scroll instead.
          flowchart: { useMaxWidth: false },
          sequence: { useMaxWidth: false },
          gantt: { useMaxWidth: false },
        });
        const { svg: rendered } = await mermaid.render(id, chart);
        if (!cancelled) setSvg(rendered);
      } catch {
        // A malformed diagram must never hide the rest of the notes.
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, reactId]);

  if (failed) {
    return (
      <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[0.72rem] leading-relaxed text-muted-foreground">
        {chart}
      </pre>
    );
  }

  if (!svg) {
    return (
      <div className="mt-3 h-28 animate-pulse rounded-lg border border-border bg-muted/40" />
    );
  }

  return (
    <div
      className="mt-3 overflow-x-auto rounded-lg border border-border bg-background/60 p-3 [&_svg]:mx-auto [&_svg]:h-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border">
      {lang && lang !== "text" && (
        <div className="border-b border-border bg-muted/60 px-3 py-1 text-[0.62rem] font-medium tracking-wide text-muted-foreground uppercase">
          {lang}
        </div>
      )}
      <pre className="overflow-x-auto bg-muted/30 p-3 font-mono text-[0.78rem] leading-relaxed whitespace-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * Renders the study material. Notes are prose with worked examples, so this is
 * deliberately a real Markdown renderer rather than a bullet list.
 */
export function Markdown({ content, className }: { content: string; className?: string }) {
  const blocks = useMemo(() => parseBlocks(content ?? ""), [content]);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {blocks.map((block, index) => {
        const key = `block-${index}`;

        if (block.type === "heading") {
          return (
            <h4
              key={key}
              className={cn(
                "font-semibold tracking-tight text-foreground",
                block.level <= 2 ? "mt-1 text-[0.92rem]" : "mt-1 text-[0.86rem]",
              )}
            >
              {inline(block.text, key)}
            </h4>
          );
        }

        if (block.type === "paragraph") {
          return (
            <p key={key} className="text-[0.9rem] leading-[1.75] text-foreground/90">
              {inline(block.text, key)}
            </p>
          );
        }

        if (block.type === "list") {
          const items = block.items.map((item, itemIndex) => (
            <li key={`${key}-${itemIndex}`} className="pl-1 marker:text-primary/60">
              {inline(item, `${key}-${itemIndex}`)}
            </li>
          ));

          return block.ordered ? (
            <ol key={key} className="ml-5 flex list-decimal flex-col gap-1.5 text-[0.9rem] leading-[1.7] text-foreground/90">
              {items}
            </ol>
          ) : (
            <ul key={key} className="ml-5 flex list-disc flex-col gap-1.5 text-[0.9rem] leading-[1.7] text-foreground/90">
              {items}
            </ul>
          );
        }

        if (block.type === "quote") {
          return (
            <blockquote
              key={key}
              className="border-l-2 border-primary/40 pl-3 text-[0.87rem] leading-relaxed text-muted-foreground italic"
            >
              {inline(block.text, key)}
            </blockquote>
          );
        }

        if (block.type === "rule") {
          return <hr key={key} className="border-border" />;
        }

        if (block.type === "table") {
          return (
            <div key={key} className="mt-1 overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-left text-[0.82rem]">
                <thead className="bg-muted/60">
                  <tr>
                    {block.head.map((cell, cellIndex) => (
                      <th key={`${key}-h-${cellIndex}`} className="px-3 py-2 font-medium">
                        {inline(cell, `${key}-h-${cellIndex}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`${key}-r-${rowIndex}`} className="border-t border-border">
                      {row.map((cell, cellIndex) => (
                        <td key={`${key}-r-${rowIndex}-${cellIndex}`} className="px-3 py-2 align-top">
                          {inline(cell, `${key}-r-${rowIndex}-${cellIndex}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.lang === "mermaid") {
          return <MermaidDiagram key={key} chart={block.code} />;
        }

        return <CodeBlock key={key} code={block.code} lang={block.lang} />;
      })}
    </div>
  );
}
