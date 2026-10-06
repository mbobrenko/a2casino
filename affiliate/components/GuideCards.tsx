import Link from "next/link";
import type { Guide } from "@/data/guides";

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${d} de ${months[m - 1]} de ${y}`;
}

export default function GuideCards({ list }: { list: Guide[] }) {
  return (
    <div className="cards">
      {list.map((g) => (
        <Link key={g.slug} href={`/guias/${g.slug}/`} className="card guide-card">
          <span className="guide-icon" aria-hidden="true">{g.icon}</span>
          <span className="guide-title">{g.title}</span>
          <span className="muted small">{g.description}</span>
          <span className="guide-meta">{g.readingMinutes} min de lectura</span>
        </Link>
      ))}
    </div>
  );
}
