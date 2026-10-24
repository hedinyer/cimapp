import type { ReactNode } from "react";

function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern =
    /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${index}`;
    index += 1;
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (link) {
        nodes.push(
          <a
            key={key}
            href={link[2]}
            className="underline underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            {link[1]}
          </a>,
        );
      }
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function isTable(lines: string[]): boolean {
  return (
    lines.length >= 2 &&
    lines.every((line) => line.includes("|")) &&
    /^\s*\|?\s*:?-{3,}/.test(lines[1] ?? "")
  );
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function ChatMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").startsWith("```")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      blocks.push(
        <pre
          key={`code-${index}`}
          className="overflow-x-auto rounded-xl bg-muted px-3 py-2 font-mono text-[0.85em] leading-5"
        >
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^#+/)?.[0].length ?? 2;
      const content = line.replace(/^#{1,3}\s/, "");
      const className =
        level === 1 ? "text-base font-semibold" : "text-sm font-semibold";
      blocks.push(
        <p key={`h-${index}`} className={className}>
          {inline(content, `h-${index}`)}
        </p>,
      );
      index += 1;
      continue;
    }
    const tableLines: string[] = [];
    if (line.includes("|") && isTable(lines.slice(index, index + 2))) {
      while (index < lines.length && (lines[index] ?? "").includes("|")) {
        tableLines.push(lines[index] ?? "");
        index += 1;
      }
      const header = cells(tableLines[0] ?? "");
      const body = tableLines.slice(2).map(cells);
      blocks.push(
        <div key={`table-${index}`} className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                {header.map((cell, cellIndex) => (
                  <th
                    key={`${cell}-${cellIndex}`}
                    className="border-b border-border px-2 py-1.5 font-semibold"
                  >
                    {inline(cell, `th-${cell}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, rowIndex) => (
                <tr key={row.join("-") || rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={`${rowIndex}-${cellIndex}`}
                      className="border-b border-border px-2 py-1.5 tabular-nums"
                    >
                      {inline(cell, `td-${rowIndex}-${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*[-*]\s/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*]\s/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\s*[-*]\s/, ""));
        index += 1;
      }
      blocks.push(
        <ul key={`ul-${index}`} className="list-disc space-y-1 pl-5">
          {items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>{inline(item, `li-${itemIndex}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    const paragraph: string[] = [line];
    index += 1;
    while (
      index < lines.length &&
      (lines[index] ?? "").trim() &&
      !/^#{1,3}\s/.test(lines[index] ?? "") &&
      !(lines[index] ?? "").startsWith("```") &&
      !/^\s*[-*]\s/.test(lines[index] ?? "")
    ) {
      paragraph.push(lines[index] ?? "");
      index += 1;
    }
    blocks.push(
      <p key={`p-${index}`}>{inline(paragraph.join(" "), `p-${index}`)}</p>,
    );
  }

  return <div className="space-y-2 text-sm leading-6">{blocks}</div>;
}
