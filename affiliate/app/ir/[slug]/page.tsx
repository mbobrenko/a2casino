import { notFound } from "next/navigation";
import Redirector from "./Redirector";
import { casinos, getCasino } from "@/data/casinos";
import { buildAffiliateUrl, buildSubid } from "@/lib/affiliate";
import { pageMeta } from "@/lib/seo";

// /ir/<slug>/ — the only place affiliate URLs are emitted. Change a link in data/casinos.ts and
// every button on the site follows. JS redirects immediately (with the placement sub-ID and the
// optional click beacon); the meta refresh is the no-JS fallback.

export const dynamicParams = false;

export function generateStaticParams() {
  return casinos.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = getCasino(slug);
  return pageMeta({
    title: c ? `Redirigiendo a ${c.name}` : "Redirigiendo",
    description: "Redirección a un sitio externo.",
    path: `/ir/${slug}/`,
    noindex: true,
  });
}

export default async function GoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = getCasino(slug);
  if (!c) notFound();
  const fallback = buildAffiliateUrl(c, buildSubid(null));
  return (
    <div className="container page go">
      <meta httpEquiv="refresh" content={`2;url=${fallback}`} />
      <meta name="referrer" content="no-referrer-when-downgrade" />
      <div className="card go-card">
        <div className="spinner" aria-hidden="true" />
        <h1>Te estamos llevando a {c.name}…</h1>
        <p className="muted">
          Estás saliendo de nuestro sitio. Si no pasa nada en unos segundos,{" "}
          <a href={fallback} rel="nofollow sponsored noopener">haz clic aquí</a>.
        </p>
        <p className="small muted">18+ · Juega con responsabilidad. Este es un enlace de afiliado.</p>
      </div>
      <Redirector casino={{ slug: c.slug, affiliateUrl: c.affiliateUrl, subidParam: c.subidParam }} />
    </div>
  );
}
