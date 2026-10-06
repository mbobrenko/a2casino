import Link from "next/link";
import type { Casino } from "@/data/casinos";
import type { Placement } from "@/lib/affiliate";
import { CasinoLogo, PaymentChips, SampleBadge, Score, Stars, VisitButton } from "./CasinoBits";
import { overallScore } from "@/data/casinos";

/** Ranked casino list: a table-like grid on desktop that turns into cards on mobile. */
export default function CasinoRanking({ list, placement }: { list: Casino[]; placement: Placement }) {
  if (list.length === 0) {
    return <p className="empty">Todavía no hay casinos en esta lista. Vuelve pronto.</p>;
  }
  return (
    <div className="ranking" role="table" aria-label="Ranking de casinos">
      <div className="ranking-head" role="row">
        <span role="columnheader">#</span>
        <span role="columnheader">Casino</span>
        <span role="columnheader">Bono de bienvenida</span>
        <span role="columnheader">Puntuación</span>
        <span role="columnheader">Licencia y pagos</span>
        <span role="columnheader"><span className="sr-only">Acciones</span></span>
      </div>
      {list.map((c, i) => (
        <div key={c.slug} className={i === 0 ? "ranking-row is-top" : "ranking-row"} role="row">
          <span className="rank" role="cell">{i + 1}</span>
          <span className="r-casino" role="cell">
            <CasinoLogo casino={c} size={48} />
            <span>
              <Link href={`/casinos/${c.slug}/`} className="r-name">{c.name}</Link>
              {i === 0 && <span className="badge badge-top">Mejor valorado</span>}
              <SampleBadge casino={c} />
            </span>
          </span>
          <span className="r-bonus" role="cell">
            <span className="cell-label">Bono</span>
            <strong>{c.bonus.headline}</strong>
            <small>Apuesta: {c.bonus.wagering}</small>
          </span>
          <span className="r-score" role="cell">
            <Score casino={c} />
            <Stars value={overallScore(c)} />
          </span>
          <span className="r-meta" role="cell">
            <span className="licence">🛡️ {c.licence}</span>
            <PaymentChips casino={c} max={3} />
          </span>
          <span className="r-cta" role="cell">
            <VisitButton casino={c} placement={placement} />
            <Link href={`/casinos/${c.slug}/`} className="link-small">Reseña</Link>
          </span>
        </div>
      ))}
    </div>
  );
}
