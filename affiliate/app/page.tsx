import Link from "next/link";
import CasinoRanking from "@/components/CasinoRanking";
import GuideCards from "@/components/GuideCards";
import TrustBlock from "@/components/TrustBlock";
import { casinos, rankedCasinos } from "@/data/casinos";
import { latestGuides } from "@/data/guides";
import { pageMeta } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata = pageMeta({
  title: `${SITE.name}: reseñas de casinos online para Latinoamérica`,
  description: SITE.description,
  path: "/",
});

export default function Home() {
  const top = rankedCasinos();
  const hasSamples = casinos.some((c) => c.sample);
  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <p className="eyebrow">México · Chile · Perú · Centroamérica</p>
          <h1>Casinos online con licencia, revisados con lupa</h1>
          <p className="lead">
            Comparamos licencias, bonos, métodos de pago (incluidas criptomonedas) y tiempos de retiro para que elijas con información, no con publicidad.
          </p>
          <div className="hero-actions">
            <a href="#ranking" className="btn btn-primary">Ver el ranking</a>
            <Link href="/bonos/" className="btn btn-ghost">Comparar bonos</Link>
          </div>
          <ul className="hero-points">
            <li>✓ Licencia verificada en el registro</li>
            <li>✓ Condiciones del bono explicadas</li>
            <li>✓ Retiros en cripto y métodos locales</li>
          </ul>
        </div>
      </section>

      <div className="container">
        <section className="section" id="ranking" aria-labelledby="ranking-h">
          <div className="section-head">
            <h2 id="ranking-h">Los mejores casinos online de {new Date().getFullYear()}</h2>
            <p className="muted small">Ordenados por nuestra puntuación ponderada. <Link href="/aviso-legal/">Contiene enlaces de afiliado</Link>.</p>
          </div>
          {hasSamples && (
            <p className="notice-sample" role="note">
              Los casinos marcados como <strong>Ejemplo</strong> son ficticios y solo muestran el diseño del sitio.
            </p>
          )}
          <CasinoRanking list={top} placement="home" />
        </section>

        <section className="section" aria-labelledby="countries-h">
          <h2 id="countries-h">Casinos por país</h2>
          <div className="cards cards-3">
            <Link href="/mexico/" className="card country-card"><span aria-hidden="true">🇲🇽</span> México</Link>
            <Link href="/chile/" className="card country-card"><span aria-hidden="true">🇨🇱</span> Chile</Link>
            <Link href="/peru/" className="card country-card"><span aria-hidden="true">🇵🇪</span> Perú</Link>
          </div>
        </section>

        <section className="section" aria-labelledby="guides-h">
          <div className="section-head">
            <h2 id="guides-h">Últimas guías</h2>
            <Link href="/guias/" className="link-small">Ver todas →</Link>
          </div>
          <GuideCards list={latestGuides(3)} />
        </section>

        <TrustBlock />
      </div>
    </>
  );
}
