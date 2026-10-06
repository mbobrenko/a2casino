import Link from "next/link";
import type { Casino } from "@/data/casinos";
import { overallScore } from "@/data/casinos";
import { goPath, type Placement } from "@/lib/affiliate";

export function CasinoLogo({ casino, size = 56 }: { casino: Casino; size?: number }) {
  const isImg = casino.logo.startsWith("/");
  return (
    <span
      className="logo-tile"
      style={{ width: size, height: size, background: casino.logoBg || "var(--surface-2)", fontSize: size * 0.5 }}
      aria-hidden="true"
    >
      {isImg ? <img src={casino.logo} alt="" width={size} height={size} loading="lazy" /> : casino.logo}
    </span>
  );
}

export function SampleBadge({ casino }: { casino: Casino }) {
  if (!casino.sample) return null;
  return <span className="badge badge-sample" title="Registro ficticio de demostración">Ejemplo — reemplazar con datos reales</span>;
}

export function Score({ casino, large = false }: { casino: Casino; large?: boolean }) {
  const s = overallScore(casino);
  return (
    <span className={large ? "score score-lg" : "score"} aria-label={`Puntuación ${s.toFixed(1)} de 10`}>
      <strong>{s.toFixed(1)}</strong>
      <span className="score-max">/10</span>
    </span>
  );
}

export function Stars({ value }: { value: number }) {
  // value 0–10 rendered as 0–5 stars with a CSS width mask.
  const pct = Math.max(0, Math.min(100, value * 10));
  return (
    <span className="stars" aria-hidden="true">
      <span className="stars-fill" style={{ width: `${pct}%` }}>★★★★★</span>
      ★★★★★
    </span>
  );
}

export function VisitButton({ casino, placement, label = "Visitar", block = false }: {
  casino: Casino;
  placement: Placement;
  label?: string;
  block?: boolean;
}) {
  return (
    <a
      href={goPath(casino.slug, placement)}
      className={block ? "btn btn-primary btn-block" : "btn btn-primary"}
      rel="nofollow sponsored noopener"
      target="_blank"
    >
      {label} <span aria-hidden="true">↗</span>
    </a>
  );
}

export function ReviewLink({ casino }: { casino: Casino }) {
  return <Link href={`/casinos/${casino.slug}/`} className="btn btn-ghost">Leer reseña</Link>;
}

export function PaymentChips({ casino, max = 4 }: { casino: Casino; max?: number }) {
  const all = [...casino.paymentMethods, ...casino.crypto];
  const shown = all.slice(0, max);
  const rest = all.length - shown.length;
  return (
    <span className="chips">
      {casino.crypto.length > 0 && <span className="chip chip-crypto">Cripto</span>}
      {shown.map((p) => <span key={p} className="chip">{p}</span>)}
      {rest > 0 && <span className="chip chip-more">+{rest}</span>}
    </span>
  );
}
