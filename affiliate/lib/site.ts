// Site-wide settings. Everything that changes per deployment comes from NEXT_PUBLIC_* env vars,
// which Next inlines at build time (static export: change the env var, then rebuild).

const rawUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3400";

export const SITE = {
  name: "Casinos Confiables LATAM",
  shortName: "Casinos LATAM",
  url: rawUrl.replace(/\/+$/, ""),
  description:
    "Reseñas independientes de casinos online para Latinoamérica: licencias, bonos, pagos con criptomonedas y guías de juego responsable.",
  locale: "es_419",
  lang: "es",
  // Default affiliate sub-ID appended to every outgoing link (see lib/affiliate.ts).
  subid: process.env.NEXT_PUBLIC_AFF_SUBID || "a2mb",
  // Optional click-counting endpoint. When set, /ir/[slug] sends a beacon before redirecting.
  clickApi: process.env.NEXT_PUBLIC_CLICK_API || "",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "contacto@example.com",
};

/** Absolute URL for a site path. Paths end with "/" because the export uses trailingSlash. */
export function absUrl(path: string): string {
  let p = path.startsWith("/") ? path : `/${path}`;
  if (!p.endsWith("/") && !p.includes("?") && !p.includes("#")) p += "/";
  return `${SITE.url}${p}`;
}

export const NAV = [
  { href: "/", label: "Inicio" },
  { href: "/bonos/", label: "Bonos" },
  { href: "/guias/", label: "Guías" },
  { href: "/sobre-nosotros/", label: "Cómo evaluamos" },
  { href: "/juego-responsable/", label: "Juego responsable" },
];
