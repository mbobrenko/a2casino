import Link from "next/link";
import CasinoRanking from "./CasinoRanking";
import { COUNTRIES, casinosForCountry, type CountryCode } from "@/data/casinos";
import { pageMeta } from "@/lib/seo";

export function countryMeta(code: CountryCode) {
  const n = COUNTRIES[code].name;
  return pageMeta({
    title: `Casinos online en ${n}: ranking y bonos`,
    description: `Casinos online que aceptan jugadores de ${n}: licencias, bonos, métodos de pago y retiros en criptomonedas, revisados por nuestro equipo.`,
    path: COUNTRIES[code].path || "/",
  });
}

export default function CountryPage({ code, intro }: { code: CountryCode; intro: string[] }) {
  const c = COUNTRIES[code];
  const list = casinosForCountry(code);
  return (
    <div className="container page">
      <header className="page-head">
        <p className="eyebrow">{c.flag} {c.name}</p>
        <h1>Casinos online para jugadores de {c.name}</h1>
        {intro.map((p, i) => <p key={i} className={i === 0 ? "lead" : undefined}>{p}</p>)}
        <p className="notice-legal" role="note">
          ⚖️ La normativa sobre juego online cambia con frecuencia. <strong>Verifica la normativa local</strong> vigente en {c.name} antes de registrarte. Solo mayores de 18 años.
        </p>
      </header>
      <section className="section" aria-labelledby="list-h">
        <h2 id="list-h">Casinos que aceptan jugadores de {c.name}</h2>
        <CasinoRanking list={list} placement="pais" />
      </section>
      <section className="section">
        <h2>Antes de elegir</h2>
        <ul className="checklist">
          <li>Comprueba la licencia en el registro del regulador: <Link href="/guias/como-elegir-casino-online-seguro/">cómo hacerlo</Link>.</li>
          <li>Calcula cuánto tendrás que apostar para liberar el bono: <Link href="/guias/requisitos-de-apuesta-wagering/">requisitos de apuesta</Link>.</li>
          <li>Si usas cripto, elige la red correcta: <Link href="/guias/depositar-y-retirar-con-criptomonedas/">guía de pagos con cripto</Link>.</li>
          <li>Fija un límite de depósito desde el primer día: <Link href="/juego-responsable/">juego responsable</Link>.</li>
        </ul>
      </section>
    </div>
  );
}
