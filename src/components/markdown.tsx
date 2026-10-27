import { Fragment } from "react";

/**
 * Tiny Markdown renderer for memos: headings, bullets, paragraphs and **bold**.
 * Builds React elements (no HTML injection), since memo text may come from an LLM.
 */
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) =>
    chunk.startsWith("**") && chunk.endsWith("**") ? <strong key={i}>{chunk.slice(2, -2)}</strong> : <Fragment key={i}>{chunk}</Fragment>,
  );
}

export function Markdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter(Boolean);
        if (lines.every((l) => /^[-*] /.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-0.5 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.slice(2))}</li>
              ))}
            </ul>
          );
        }
        return lines.map((l, j) => {
          const h = /^(#{1,3}) (.*)$/.exec(l);
          if (h) return <p key={`${i}-${j}`} className={h[1] === "#" ? "text-base font-semibold" : "font-semibold"}>{inline(h[2]!)}</p>;
          return <p key={`${i}-${j}`}>{inline(l)}</p>;
        });
      })}
    </div>
  );
}
