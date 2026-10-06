import type { Metadata } from "next";
import { SITE, absUrl } from "./site";

/** Per-page metadata with canonical URL, hreflang and Open Graph, all derived from one path. */
export function pageMeta(opts: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  noindex?: boolean;
}): Metadata {
  const url = absUrl(opts.path);
  return {
    title: opts.title,
    description: opts.description,
    alternates: {
      canonical: url,
      languages: { es: url, "x-default": url },
    },
    openGraph: {
      title: opts.title,
      description: opts.description,
      url,
      siteName: SITE.name,
      locale: SITE.locale,
      type: opts.type ?? "website",
      images: [{ url: absUrl("/og.png").replace(/\/$/, ""), width: 1200, height: 630, alt: SITE.name }],
    },
    twitter: { card: "summary_large_image", title: opts.title, description: opts.description },
    robots: opts.noindex ? { index: false, follow: false } : undefined,
  };
}

/** Serialises JSON-LD safely for a <script type="application/ld+json"> tag. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
