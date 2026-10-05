import { RISK_LABELS, RISK_TONES, STATUS_LABELS, VERIFICATION_LABELS, statusTone } from "@/lib/format";

export function Badge({ tone = "muted", children, title }: { tone?: string; children: React.ReactNode; title?: string }) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  );
}

export function StatusBadge({ value }: { value: string }) {
  return (
    <Badge tone={statusTone(value)} title={value}>
      {STATUS_LABELS[value] || value}
    </Badge>
  );
}

export function VerificationBadge({ value }: { value: string }) {
  return (
    <Badge tone={statusTone(value)} title={value}>
      {VERIFICATION_LABELS[value] || value}
    </Badge>
  );
}

export function Tags({ tags }: { tags: string[] | null | undefined }) {
  if (!tags || tags.length === 0) return <span className="muted">—</span>;
  return (
    <span className="tags">
      {tags.map((t) => (
        <span key={t} className="tag">
          {t}
        </span>
      ))}
    </span>
  );
}

export function Codes({ codes }: { codes: string[] | null | undefined }) {
  if (!codes || codes.length === 0) return <span className="muted">—</span>;
  return <span className="mono small">{codes.join(", ")}</span>;
}

export function RiskBadge({ value, reasons }: { value: string | null | undefined; reasons?: string[] | null }) {
  if (!value) return <span className="muted">—</span>;
  return (
    <Badge tone={RISK_TONES[value] || "muted"} title={reasons && reasons.length ? reasons.join("\n") : value}>
      {RISK_LABELS[value] || value}
    </Badge>
  );
}
