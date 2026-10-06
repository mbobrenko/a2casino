// ============================================================================
// ALL CASINO DATA LIVES IN THIS FILE.
//
// To add a real casino: copy one entry, set `sample: false` (or remove it), fill every field
// with information you verified yourself on the casino's site, terms page and licence register,
// and set `lastVerified`. See affiliate/README.md ("Cómo añadir un casino real") for the checklist.
//
// The entries below are FICTIONAL placeholders ("Casino Ejemplo N"). They render a visible
// "Ejemplo — reemplazar con datos reales" badge and point to example.com. Delete them once you
// have real, verified casinos.
// ============================================================================

/** Countries/regions we publish landing pages and filters for. */
export type CountryCode = "mx" | "cl" | "pe" | "ca";

export const COUNTRIES: Record<CountryCode, { name: string; flag: string; path?: string }> = {
  mx: { name: "México", flag: "🇲🇽", path: "/mexico/" },
  cl: { name: "Chile", flag: "🇨🇱", path: "/chile/" },
  pe: { name: "Perú", flag: "🇵🇪", path: "/peru/" },
  ca: { name: "Centroamérica", flag: "🌎" },
};

/** Rating criteria and their weights (must add up to 1). Shown on /sobre-nosotros. */
export const CRITERIA = [
  { key: "seguridad", label: "Seguridad y licencia", weight: 0.25 },
  { key: "pagos", label: "Pagos y retiros", weight: 0.2 },
  { key: "bonos", label: "Bonos y condiciones", weight: 0.2 },
  { key: "juegos", label: "Juegos", weight: 0.15 },
  { key: "soporte", label: "Atención al cliente", weight: 0.1 },
  { key: "usabilidad", label: "Usabilidad y móvil", weight: 0.1 },
] as const;

export type CriterionKey = (typeof CRITERIA)[number]["key"];

export interface Casino {
  /** URL segment: /casinos/<slug>/ and /ir/<slug>/. Lowercase, hyphens only. Never change it once published. */
  slug: string;
  name: string;
  /** true = fictional placeholder. Shows the "Ejemplo — reemplazar con datos reales" badge everywhere. */
  sample?: boolean;
  /** An emoji, or a path to an image in /public (e.g. "/logos/micasino.svg"). */
  logo: string;
  /** Background colour behind the logo tile. */
  logoBg?: string;

  /** Tracking link from the affiliate programme. Use "{subid}" where the sub-ID should go, or set subidParam. */
  affiliateUrl: string;
  /** Query parameter the programme uses for sub-IDs (e.g. "subid", "var1", "payload"). Default: "subid". Ignored when affiliateUrl contains "{subid}". */
  subidParam?: string;

  /** Year the casino started operating. */
  established: number;
  /** Licensing authority as written on the casino's footer, e.g. "Curaçao Gaming Authority". */
  licence: string;
  /** Licence number and a link to the regulator's public register, if available. */
  licenceNumber?: string;
  licenceUrl?: string;
  /** Operating company as written in the terms and conditions. */
  operator?: string;

  /** Where the casino accepts players from (always double-check the casino's restricted-countries list). */
  countries: CountryCode[];
  /** Minimum deposit, as text with currency, e.g. "10 USD". */
  minDeposit: string;
  /** Typical withdrawal time stated by the casino, e.g. "0–24 h (cripto)". */
  withdrawalTime: string;
  /** Fiat / local payment methods. */
  paymentMethods: string[];
  /** Cryptocurrencies accepted (empty array if none). */
  crypto: string[];
  /** Approximate number of games. */
  gamesCount: number;
  providers: string[];
  support: string;

  bonus: {
    /** Short headline for tables, e.g. "100% hasta 200 USD + 50 giros". */
    headline: string;
    /** Wagering requirement exactly as in the bonus terms, e.g. "35x (bono)". */
    wagering: string;
    minDeposit?: string;
    freeSpins?: number;
    noDeposit?: boolean;
    code?: string;
    /** One-line summary of the key terms (max bet, expiry, excluded games...). */
    terms: string;
  };

  /** Scores 0–10 per criterion; the overall score is the weighted average (see CRITERIA). */
  ratings: Record<CriterionKey, number>;

  pros: string[];
  cons: string[];
  /** Short intro shown at the top of the review. */
  summary: string;
  /** Review sections. Each string is one paragraph. */
  sections: {
    bonos: string[];
    juegos: string[];
    pagos: string[];
    soporte: string[];
    seguridad: string[];
  };
  faq: { q: string; a: string }[];
  /** Date (YYYY-MM-DD) when you last checked the data against the casino's site. */
  lastVerified: string;
}

const SAMPLE_SECTIONS = (name: string): Casino["sections"] => ({
  bonos: [
    `${name} es un registro de ejemplo. Aquí debes describir el bono de bienvenida real: porcentaje, importe máximo, giros gratis, requisito de apuesta, apuesta máxima permitida mientras el bono está activo, juegos que contribuyen y plazo para cumplirlo.`,
    "Explica también si existen promociones recurrentes (recargas, cashback, torneos) y si el bono es opcional. Copia las condiciones desde la página oficial de términos del bono y anota la fecha en la que las revisaste.",
  ],
  juegos: [
    "Describe el catálogo: número aproximado de juegos, proveedores principales, si hay casino en vivo, juegos de mesa, tragamonedas con jackpot y si los juegos se pueden probar en modo demo.",
  ],
  pagos: [
    "Enumera los métodos de depósito y retiro disponibles para jugadores de Latinoamérica, el depósito mínimo, los límites de retiro, las comisiones y el tiempo real de procesamiento que observaste.",
    "Si acepta criptomonedas, indica qué monedas y redes (por ejemplo USDT en TRC-20 o ERC-20) y si hay montos mínimos de retiro.",
  ],
  soporte: [
    "Indica los canales de soporte (chat en vivo, correo, teléfono), el horario, si atienden en español y cuánto tardaron en responder durante tu prueba.",
  ],
  seguridad: [
    "Indica la autoridad que otorga la licencia, el número de licencia y el enlace al registro público del regulador donde se puede comprobar. Menciona el operador, el uso de cifrado HTTPS, la verificación de identidad (KYC) y las herramientas de juego responsable disponibles.",
  ],
});

const SAMPLE_FAQ = (name: string): Casino["faq"] => [
  {
    q: `¿${name} es un casino real?`,
    a: `No. ${name} es un registro de ejemplo que muestra cómo se verá una reseña. Debe reemplazarse por un casino real con datos verificados.`,
  },
  {
    q: "¿Cuál es el depósito mínimo?",
    a: "En una reseña real, aquí va el depósito mínimo indicado en la página de pagos del casino, con su moneda.",
  },
  {
    q: "¿Cuánto tarda un retiro?",
    a: "En una reseña real, aquí va el plazo que indica el casino y, si es posible, el tiempo que tardó el retiro en tu prueba.",
  },
];

export const casinos: Casino[] = [
  {
    slug: "casino-ejemplo-1",
    name: "Casino Ejemplo 1",
    sample: true,
    logo: "🎰",
    logoBg: "#fde68a",
    affiliateUrl: "https://example.com/?ref=ejemplo1",
    subidParam: "subid",
    established: 2021,
    licence: "Curaçao (ejemplo)",
    countries: ["mx", "cl", "pe", "ca"],
    minDeposit: "10 USD",
    withdrawalTime: "0–24 h (cripto), 1–3 días (banco)",
    paymentMethods: ["Visa", "Mastercard", "SPEI", "Transferencia"],
    crypto: ["USDT (TRC-20)", "BTC", "ETH"],
    gamesCount: 3000,
    providers: ["Proveedor A", "Proveedor B", "Proveedor C"],
    support: "Chat 24/7 en español, correo",
    bonus: {
      headline: "100% hasta 200 USD + 50 giros",
      wagering: "35x (bono)",
      minDeposit: "20 USD",
      freeSpins: 50,
      terms: "Ejemplo: apuesta máx. 5 USD con bono, 30 días para cumplir el requisito.",
    },
    ratings: { seguridad: 8.5, pagos: 9, bonos: 8, juegos: 8.5, soporte: 8, usabilidad: 8.5 },
    pros: ["Ejemplo: retiros en cripto rápidos", "Ejemplo: soporte 24/7 en español", "Ejemplo: amplio catálogo"],
    cons: ["Ejemplo: requisito de apuesta de 35x", "Ejemplo: sin teléfono de contacto"],
    summary:
      "Registro de ejemplo para mostrar el formato de reseña. Reemplázalo con un casino real cuyos datos hayas verificado.",
    sections: SAMPLE_SECTIONS("Casino Ejemplo 1"),
    faq: SAMPLE_FAQ("Casino Ejemplo 1"),
    lastVerified: "2026-10-01",
  },
  {
    slug: "casino-ejemplo-2",
    name: "Casino Ejemplo 2",
    sample: true,
    logo: "🃏",
    logoBg: "#bfdbfe",
    affiliateUrl: "https://example.com/?ref=ejemplo2&sub={subid}",
    established: 2019,
    licence: "Malta Gaming Authority (ejemplo)",
    countries: ["cl", "pe"],
    minDeposit: "20 USD",
    withdrawalTime: "1–3 días hábiles",
    paymentMethods: ["Visa", "Mastercard", "Skrill", "Transferencia"],
    crypto: [],
    gamesCount: 1800,
    providers: ["Proveedor B", "Proveedor D"],
    support: "Chat de 9 a 23 h, correo",
    bonus: {
      headline: "Hasta 300 USD en 3 depósitos",
      wagering: "30x (depósito + bono)",
      minDeposit: "20 USD",
      terms: "Ejemplo: bono repartido en tres depósitos, 21 días de validez.",
    },
    ratings: { seguridad: 9.5, pagos: 7.5, bonos: 7, juegos: 8, soporte: 7.5, usabilidad: 8 },
    pros: ["Ejemplo: licencia de un regulador europeo", "Ejemplo: buena app móvil"],
    cons: ["Ejemplo: no acepta criptomonedas", "Ejemplo: retiros más lentos"],
    summary:
      "Registro de ejemplo para mostrar el formato de reseña. Reemplázalo con un casino real cuyos datos hayas verificado.",
    sections: SAMPLE_SECTIONS("Casino Ejemplo 2"),
    faq: SAMPLE_FAQ("Casino Ejemplo 2"),
    lastVerified: "2026-10-01",
  },
  {
    slug: "casino-ejemplo-3",
    name: "Casino Ejemplo 3",
    sample: true,
    logo: "💎",
    logoBg: "#c7d2fe",
    affiliateUrl: "https://example.com/?ref=ejemplo3",
    subidParam: "var1",
    established: 2023,
    licence: "Anjouan (ejemplo)",
    countries: ["mx", "pe", "ca"],
    minDeposit: "5 USDT",
    withdrawalTime: "Menos de 1 h (cripto)",
    paymentMethods: ["Solo criptomonedas"],
    crypto: ["USDT (TRC-20)", "USDT (ERC-20)", "BTC", "LTC", "TRX"],
    gamesCount: 4500,
    providers: ["Proveedor A", "Proveedor E", "Proveedor F"],
    support: "Chat 24/7, Telegram",
    bonus: {
      headline: "20 giros sin depósito + 150% en cripto",
      wagering: "40x (ganancias de giros)",
      freeSpins: 20,
      noDeposit: true,
      code: "EJEMPLO20",
      terms: "Ejemplo: ganancia máxima de los giros sin depósito 50 USD.",
    },
    ratings: { seguridad: 7, pagos: 9.5, bonos: 8.5, juegos: 9, soporte: 8, usabilidad: 8 },
    pros: ["Ejemplo: bono sin depósito", "Ejemplo: retiros cripto casi inmediatos", "Ejemplo: muchas redes cripto"],
    cons: ["Ejemplo: sin métodos de pago locales", "Ejemplo: licencia con menor supervisión"],
    summary:
      "Registro de ejemplo para mostrar el formato de reseña. Reemplázalo con un casino real cuyos datos hayas verificado.",
    sections: SAMPLE_SECTIONS("Casino Ejemplo 3"),
    faq: SAMPLE_FAQ("Casino Ejemplo 3"),
    lastVerified: "2026-10-01",
  },
  {
    slug: "casino-ejemplo-4",
    name: "Casino Ejemplo 4",
    sample: true,
    logo: "🎲",
    logoBg: "#bbf7d0",
    affiliateUrl: "https://example.com/?ref=ejemplo4",
    established: 2020,
    licence: "Curaçao (ejemplo)",
    countries: ["mx", "cl"],
    minDeposit: "200 MXN / 10 USD",
    withdrawalTime: "24–48 h",
    paymentMethods: ["Visa", "Mastercard", "SPEI", "OXXO", "Webpay"],
    crypto: ["USDT (TRC-20)", "BTC"],
    gamesCount: 2500,
    providers: ["Proveedor C", "Proveedor D", "Proveedor G"],
    support: "Chat 24/7, correo, WhatsApp",
    bonus: {
      headline: "100 giros gratis con el primer depósito",
      wagering: "25x (ganancias de giros)",
      minDeposit: "15 USD",
      freeSpins: 100,
      terms: "Ejemplo: giros en una tragamonedas seleccionada, 7 días de validez.",
    },
    ratings: { seguridad: 8, pagos: 8.5, bonos: 7.5, juegos: 8, soporte: 9, usabilidad: 9 },
    pros: ["Ejemplo: métodos locales en México y Chile", "Ejemplo: soporte por WhatsApp"],
    cons: ["Ejemplo: catálogo de casino en vivo pequeño"],
    summary:
      "Registro de ejemplo para mostrar el formato de reseña. Reemplázalo con un casino real cuyos datos hayas verificado.",
    sections: SAMPLE_SECTIONS("Casino Ejemplo 4"),
    faq: SAMPLE_FAQ("Casino Ejemplo 4"),
    lastVerified: "2026-10-01",
  },
  {
    slug: "casino-ejemplo-5",
    name: "Casino Ejemplo 5",
    sample: true,
    logo: "🍀",
    logoBg: "#fecaca",
    affiliateUrl: "https://example.com/?ref=ejemplo5",
    established: 2018,
    licence: "Curaçao (ejemplo)",
    countries: ["pe", "cl", "ca"],
    minDeposit: "10 USD",
    withdrawalTime: "1–2 días",
    paymentMethods: ["Visa", "Mastercard", "PagoEfectivo", "Transferencia"],
    crypto: ["USDT (TRC-20)"],
    gamesCount: 2000,
    providers: ["Proveedor A", "Proveedor G"],
    support: "Chat de 8 a 24 h, correo",
    bonus: {
      headline: "10 USD sin depósito al verificar la cuenta",
      wagering: "50x (bono)",
      noDeposit: true,
      terms: "Ejemplo: retiro máximo 100 USD desde el bono sin depósito.",
    },
    ratings: { seguridad: 7.5, pagos: 8, bonos: 7, juegos: 7.5, soporte: 7, usabilidad: 7.5 },
    pros: ["Ejemplo: bono sin depósito", "Ejemplo: pago en efectivo en Perú"],
    cons: ["Ejemplo: requisito de apuesta alto (50x)", "Ejemplo: soporte no 24/7"],
    summary:
      "Registro de ejemplo para mostrar el formato de reseña. Reemplázalo con un casino real cuyos datos hayas verificado.",
    sections: SAMPLE_SECTIONS("Casino Ejemplo 5"),
    faq: SAMPLE_FAQ("Casino Ejemplo 5"),
    lastVerified: "2026-10-01",
  },
];

// ---------------------------------------------------------------------------
// Helpers (no need to edit below this line)
// ---------------------------------------------------------------------------

/** Weighted overall score 0–10, rounded to one decimal. */
export function overallScore(c: Casino): number {
  const s = CRITERIA.reduce((sum, k) => sum + c.ratings[k.key] * k.weight, 0);
  return Math.round(s * 10) / 10;
}

/** Casinos sorted by overall score, best first. */
export function rankedCasinos(list: Casino[] = casinos): Casino[] {
  return [...list].sort((a, b) => overallScore(b) - overallScore(a));
}

export function casinosForCountry(code: CountryCode): Casino[] {
  return rankedCasinos(casinos.filter((c) => c.countries.includes(code)));
}

export function getCasino(slug: string): Casino | undefined {
  return casinos.find((c) => c.slug === slug);
}
