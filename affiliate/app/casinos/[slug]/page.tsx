import Link from "next/link";
import { notFound } from "next/navigation";
import { CasinoLogo, SampleBadge, Score, Stars, VisitButton } from "@/components/CasinoBits";
import { COUNTRIES, CRITERIA, casinos, getCasino, overallScore } from "@/data/casinos";
import { formatDate } from "@/components/GuideCards";
import { jsonLd, pageMeta } from "@/lib/seo";
import { absUrl } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return casinos.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = getCasino(slug);
  if (!c) return {};
  return pageMeta({
    title: `${c.name}: reseña, bono y opiniones`,
    description: `Reseña de ${c.name}: licencia ${c.licence}, bono ${c.bonus.headline} (apuesta ${c.bonus.wagering}), depósito mínimo ${c.minDeposit} y retiros ${c.withdrawalTime}.`,
    path: `/casinos/${c.slug}/`,
    type: "article",
  });
}

const SECTIONS: { key: keyof import("@/data/casinos").Casino["sections"]; title: string }[] = [
  { key: "bonos", title: "Bonos y promociones" },
  { key: "juegos", title: "Juegos" },
  { key: "pagos", title: "Pagos y retiros" },
  { key: "soporte", title: "Atención al cliente" },
  { key: "seguridad", title: "Seguridad y licencia" },
];

export default async function ReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = getCasino(slug);
  if (!c) notFound();
  const score = overallScore(c);

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: c.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: absUrl("/") },
      { "@type": "ListItem", position: 2, name: c.name, item: absUrl(`/casinos/${c.slug}/`) },
    ],
  };

  const facts: [string, React.ReactNode][] = [
    ["Licencia", c.licenceUrl ? <a href={c.licenceUrl} target="_blank" rel="noopener noreferrer nofollow">{c.licence}</a> : c.licence],
    ...(c.licenceNumber ? ([["N.º de licencia", c.licenceNumber]] as [string, string][]) : []),
    ...(c.operator ? ([["Operador", c.operator]] as [string, string][]) : []),
    ["Año de fundación", String(c.established)],
    ["Depósito mínimo", c.minDeposit],
    ["Tiempo de retiro", c.withdrawalTime],
    ["Métodos de pago", c.paymentMethods.join(", ")],
    ["Criptomonedas", c.crypto.length ? c.crypto.join(", ") : "No acepta"],
    ["Juegos", `${c.gamesCount.toLocaleString("es-MX")}+`],
    ["Soporte", c.support],
    ["Países", c.countries.map((k) => COUNTRIES[k].name).join(", ")],
  ];

  return (
    <div className="container review">
      <nav className="breadcrumbs" aria-label="Ruta">
        <Link href="/">Inicio</Link> <span aria-hidden="true">›</span> <span>Reseñas</span> <span aria-hidden="true">›</span> <span aria-current="page">{c.name}</span>
      </nav>

      <header className="review-head">
        <CasinoLogo casino={c} size={72} />
        <div className="review-title">
          <h1>Reseña de {c.name}</h1>
          <SampleBadge casino={c} />
          <p className="muted small">Datos verificados el {formatDate(c.lastVerified)} · <Link href="/aviso-legal/">Enlaces de afiliado</Link></p>
        </div>
        <div className="review-score">
          <Score casino={c} large />
          <Stars value={score} />
        </div>
      </header>

      {c.sample && (
        <p className="notice-sample" role="note">
          Esta es una <strong>reseña de ejemplo</strong> con datos ficticios. Sirve como plantilla y debe reemplazarse por un casino real con datos verificados.
        </p>
      )}

      <div className="review-grid">
        <article className="review-main">
          <p className="lead">{c.summary}</p>

          <section className="bonus-box" aria-labelledby="bonus-h">
            <p className="eyebrow" id="bonus-h">Bono de bienvenida</p>
            <p className="bonus-headline">{c.bonus.headline}</p>
            <dl className="bonus-terms">
              <div><dt>Requisito de apuesta</dt><dd>{c.bonus.wagering}</dd></div>
              {c.bonus.minDeposit && <div><dt>Depósito mínimo</dt><dd>{c.bonus.minDeposit}</dd></div>}
              {c.bonus.code && <div><dt>Código</dt><dd><code>{c.bonus.code}</code></dd></div>}
            </dl>
            <p className="small muted">{c.bonus.terms} Lee siempre los términos completos en el sitio del casino. 18+.</p>
            <VisitButton casino={c} placement="review" label="Obtener bono" />
          </section>

          <div className="pros-cons">
            <section className="pros" aria-labelledby="pros-h">
              <h2 id="pros-h">Ventajas</h2>
              <ul>{c.pros.map((p) => <li key={p}>{p}</li>)}</ul>
            </section>
            <section className="cons" aria-labelledby="cons-h">
              <h2 id="cons-h">Desventajas</h2>
              <ul>{c.cons.map((p) => <li key={p}>{p}</li>)}</ul>
            </section>
          </div>

          {SECTIONS.map((s) => (
            <section key={s.key} className="review-section" aria-labelledby={`s-${s.key}`}>
              <h2 id={`s-${s.key}`}>{s.title}</h2>
              {c.sections[s.key].map((p, i) => <p key={i}>{p}</p>)}
            </section>
          ))}

          <section className="review-section" aria-labelledby="rating-h">
            <h2 id="rating-h">Desglose de la puntuación</h2>
            <ul className="breakdown">
              {CRITERIA.map((k) => (
                <li key={k.key}>
                  <span className="bd-label">{k.label} <span className="muted small">({Math.round(k.weight * 100)}%)</span></span>
                  <span className="bd-bar" aria-hidden="true"><span style={{ width: `${c.ratings[k.key] * 10}%` }} /></span>
                  <span className="bd-val">{c.ratings[k.key].toFixed(1)}</span>
                </li>
              ))}
              <li className="bd-total">
                <span className="bd-label">Puntuación global</span>
                <span className="bd-bar" aria-hidden="true"><span style={{ width: `${score * 10}%` }} /></span>
                <span className="bd-val">{score.toFixed(1)}</span>
              </li>
            </ul>
            <p className="small muted">Cómo calculamos la puntuación: <Link href="/sobre-nosotros/">metodología</Link>.</p>
          </section>

          <section className="review-section cta-final">
            <h2>¿Te interesa {c.name}?</h2>
            <p>Revisa los términos del bono y la normativa de tu país antes de registrarte. Juega solo con dinero que puedas permitirte perder.</p>
            <VisitButton casino={c} placement="review" label={`Visitar ${c.name}`} />
          </section>

          <section className="review-section" aria-labelledby="faq-h">
            <h2 id="faq-h">Preguntas frecuentes</h2>
            <div className="faq">
              {c.faq.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        </article>

        <aside className="review-side" aria-label="Ficha del casino">
          <div className="card facts">
            <h2 className="facts-h">Ficha rápida</h2>
            <dl>
              {facts.map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
            <VisitButton casino={c} placement="review" block />
            <p className="small muted center">18+ · Aplican términos y condiciones</p>
          </div>
        </aside>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbLd) }} />
    </div>
  );
}
