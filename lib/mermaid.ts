/**
 * Language models often write flowchart labels like `C[Call module.function()]`.
 * Mermaid treats the parentheses as shape syntax, so the whole diagram fails to
 * parse and the reader sees an error instead of the notes.
 *
 * `repairMermaid` is only applied after the original chart fails to parse. It
 * quotes bracket and edge labels, which lets Mermaid accept parentheses,
 * brackets, quotes and other punctuation as plain text.
 */

const FLOWCHART = /^\s*(?:flowchart|graph)\b/i;
const DIRECTIVE =
  /^\s*(?:%%|classDef\b|class\b|style\b|linkStyle\b|click\b|subgraph\b|end\b|direction\b)/;

// Longest tokens first so `-->` is not split out of `-.->` or `==>`.
const ARROW = /(<-->|-.->|==>|-->|---|--x|--o|~~~)/;

/** Text that cannot be placed in a bare Mermaid label. */
const UNSAFE = /[()[\]{}"'`<>|:;#]/;

function quoteText(text: string): string {
  return text.replace(/"/g, "#quot;").trim();
}

function quoteLabels(part: string): string {
  // Edge labels: `A -->|some (text)| B`.
  let result = part.replace(/\|([^|"]*)\|/g, (match, label: string) =>
    UNSAFE.test(label) ? `|"${quoteText(label)}"|` : match,
  );

  // Bracket labels: `A[some (text)]`. The greedy body also captures nested
  // brackets such as `A[sys.argv[1:]]`, which are otherwise read as shapes.
  result = result.replace(
    /([A-Za-z0-9_.-]+)\s*\[([^"]*)\]/g,
    (match, id: string, label: string) =>
      UNSAFE.test(label) && !label.includes('"')
        ? `${id}["${quoteText(label)}"]`
        : match,
  );

  return result;
}

export function repairMermaid(source: string): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const first = lines.find((line) => line.trim() && !line.trim().startsWith("%%"));
  if (!first || !FLOWCHART.test(first)) return source;

  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || DIRECTIVE.test(trimmed)) return line;
      return line
        .split(ARROW)
        .map((part, index) => (index % 2 === 0 ? quoteLabels(part) : part))
        .join("");
    })
    .join("\n");
}
