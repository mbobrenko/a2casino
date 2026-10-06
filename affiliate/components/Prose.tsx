import Link from "next/link";
import type { ReactNode } from "react";

// Renders the small Markdown subset used in data/guides.ts. Server component, no dependencies.

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)|\*(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${i++}`;
    if (m[1] !== undefined) out.push(<strong key={key}>{m[1]}</strong>);
    else if (m[2] !== undefined) {
      const href = m[3];
      out.push(
        href.startsWith("/") ? (
          <Link key={key} href={href}>{m[2]}</Link>
        ) : (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer">{m[2]}</a>
        ),
      );
    } else if (m[4] !== undefined) out.push(<em key={key}>{m[4]}</em>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function slugifyHeading(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Level-2 headings of a body, for the table of contents. */
export function headings(body: string): { id: string; text: string }[] {
  return body
    .split("\n")
    .filter((l) => l.startsWith("## "))
    .map((l) => ({ id: slugifyHeading(l.slice(3)), text: l.slice(3) }));
}

export default function Prose({ body }: { body: string }) {
  const blocks = body.trim().split(/\n\s*\n/);
  return (
    <div className="prose">
      {blocks.map((raw, bi) => {
        const block = raw.trim();
        const lines = block.split("\n");
        const k = `b${bi}`;
        if (block.startsWith("### ")) return <h3 key={k}>{inline(block.slice(4), k)}</h3>;
        if (block.startsWith("## ")) {
          const t = block.slice(3);
          return <h2 key={k} id={slugifyHeading(t)}>{inline(t, k)}</h2>;
        }
        if (block.startsWith("> ")) {
          return <aside key={k} className="callout">{inline(lines.map((l) => l.replace(/^>\s?/, "")).join(" "), k)}</aside>;
        }
        if (lines.every((l) => l.startsWith("- "))) {
          return <ul key={k}>{lines.map((l, i) => <li key={i}>{inline(l.slice(2), `${k}-${i}`)}</li>)}</ul>;
        }
        if (lines.every((l) => /^\d+\.\s/.test(l))) {
          return <ol key={k}>{lines.map((l, i) => <li key={i}>{inline(l.replace(/^\d+\.\s/, ""), `${k}-${i}`)}</li>)}</ol>;
        }
        if (lines.every((l) => l.startsWith("|"))) {
          const rows = lines.map((l) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
          const [head, ...body] = rows;
          return (
            <div key={k} className="table-wrap">
              <table className="data">
                <thead><tr>{head.map((c, i) => <th key={i} scope="col">{inline(c, `${k}-h${i}`)}</th>)}</tr></thead>
                <tbody>
                  {body.map((r, ri) => (
                    <tr key={ri}>{r.map((c, ci) => <td key={ci}>{inline(c, `${k}-${ri}-${ci}`)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p key={k}>{inline(lines.join(" "), k)}</p>;
      })}
    </div>
  );
}
