import type { MetadataRoute } from "next";
import { casinos } from "@/data/casinos";
import { guides } from "@/data/guides";
import { absUrl } from "@/lib/site";

export const dynamic = "force-static";

// /ir/* redirect pages are deliberately left out (they are noindex).
export default function sitemap(): MetadataRoute.Sitemap {
  const staticPaths = ["/", "/bonos/", "/guias/", "/mexico/", "/chile/", "/peru/", "/sobre-nosotros/", "/juego-responsable/", "/aviso-legal/", "/privacidad/"];
  const entry = (path: string, lastModified?: string, priority = 0.6) => ({
    url: absUrl(path),
    lastModified: lastModified ? new Date(lastModified) : undefined,
    priority,
    alternates: { languages: { es: absUrl(path) } },
  });
  return [
    ...staticPaths.map((p) => entry(p, undefined, p === "/" ? 1 : 0.7)),
    ...casinos.map((c) => entry(`/casinos/${c.slug}/`, c.lastVerified, 0.8)),
    ...guides.map((g) => entry(`/guias/${g.slug}/`, g.updated, 0.7)),
  ];
}
