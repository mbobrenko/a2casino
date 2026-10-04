import type { Json } from "@/lib/types";

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "∅";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "[]";
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "string") return v === "" ? '""' : v;
  return String(v);
}

/** Compact "key: before → after" list; keys in `hide` are skipped (e.g. shown elsewhere as the object). */
export default function AuditDiff({ before, after, hide = [] }: { before: Json | null; after: Json | null; hide?: string[] }) {
  const b = before && typeof before === "object" ? before : {};
  const a = after && typeof after === "object" ? after : {};
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).filter((k) => !hide.includes(k));
  if (keys.length === 0) return <span className="muted">—</span>;
  return (
    <div className="diff">
      {keys.map((k) => {
        const hasB = k in b;
        const hasA = k in a;
        const title = `${k}: ${hasB ? fmt(b[k]) + " → " : ""}${hasA ? fmt(a[k]) : "удалено"}`;
        return (
          <span key={k} className="diff-item" title={title}>
            <span className="diff-key">{k}:</span>{" "}
            {hasB && (
              <>
                <span className="diff-before">{fmt(b[k])}</span>
                {hasA && " → "}
              </>
            )}
            {hasA && <span className="diff-after">{fmt(a[k])}</span>}
          </span>
        );
      })}
    </div>
  );
}
