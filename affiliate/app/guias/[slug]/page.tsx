import Link from "next/link";
import { notFound } from "next/navigation";
import Prose, { headings } from "@/components/Prose";
import GuideCards, { formatDate } from "@/components/GuideCards";
import { getGuide, guides } from "@/data/guides";
import { jsonLd, pageMeta } from "@/lib/seo";
import { absUrl, SITE } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return guides.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) return {};
  return pageMeta({ title: g.title, description: g.description, path: `/guias/${g.slug}/`, type: "article" });
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) notFound();
  const toc = headings(g.body);
  const others = guides.filter((x) => x.slug !== g.slug).slice(0, 3);

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: g.title,
    description: g.description,
    datePublished: g.published,
    dateModified: g.updated,
    inLanguage: "es",
    mainEntityOfPage: absUrl(`/guias/${g.slug}/`),
    author: { "@type": "Organization", name: SITE.name },
    publisher: { "@type": "Organization", name: SITE.name },
  };

  return (
    <div className="container page guide">
      <nav className="breadcrumbs" aria-label="Ruta">
        <Link href="/">Inicio</Link> <span aria-hidden="true">›</span> <Link href="/guias/">Guías</Link>
      </nav>
      <header className="page-head guide-head">
        <span className="guide-icon big" aria-hidden="true">{g.icon}</span>
        <h1>{g.title}</h1>
        <p className="lead">{g.description}</p>
        <p className="muted small">
          Actualizado el <time dateTime={g.updated}>{formatDate(g.updated)}</time> · {g.readingMinutes} min de lectura
        </p>
      </header>
      <div className="guide-grid">
        <aside className="toc" aria-label="Contenido">
          <p className="footer-h">En esta guía</p>
          <ol>{toc.map((h) => <li key={h.id}><a href={`#${h.id}`}>{h.text}</a></li>)}</ol>
        </aside>
        <article>
          <Prose body={g.body} />
        </article>
      </div>
      <section className="section" aria-labelledby="more-h">
        <h2 id="more-h">Otras guías</h2>
        <GuideCards list={others} />
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(articleLd) }} />
    </div>
  );
}
