"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { COUNTRIES, rankedCasinos, type CountryCode } from "@/data/casinos";
import { CasinoLogo, SampleBadge, Score, VisitButton } from "@/components/CasinoBits";

type Filters = { crypto: boolean; noDeposit: boolean; freeSpins: boolean; country: "" | CountryCode };

export default function BonusList() {
  const [f, setF] = useState<Filters>({ crypto: false, noDeposit: false, freeSpins: false, country: "" });
  const all = useMemo(() => rankedCasinos(), []);
  const list = all.filter(
    (c) =>
      (!f.crypto || c.crypto.length > 0) &&
      (!f.noDeposit || c.bonus.noDeposit) &&
      (!f.freeSpins || (c.bonus.freeSpins ?? 0) > 0) &&
      (!f.country || c.countries.includes(f.country)),
  );
  const toggle = (k: "crypto" | "noDeposit" | "freeSpins") => setF((p) => ({ ...p, [k]: !p[k] }));

  return (
    <>
      <fieldset className="filters">
        <legend className="sr-only">Filtrar bonos</legend>
        <label className={f.crypto ? "pill on" : "pill"}>
          <input type="checkbox" checked={f.crypto} onChange={() => toggle("crypto")} /> 🪙 Acepta cripto
        </label>
        <label className={f.noDeposit ? "pill on" : "pill"}>
          <input type="checkbox" checked={f.noDeposit} onChange={() => toggle("noDeposit")} /> 🎁 Sin depósito
        </label>
        <label className={f.freeSpins ? "pill on" : "pill"}>
          <input type="checkbox" checked={f.freeSpins} onChange={() => toggle("freeSpins")} /> 🎰 Giros gratis
        </label>
        <label className="select-wrap">
          <span className="sr-only">País</span>
          <select value={f.country} onChange={(e) => setF((p) => ({ ...p, country: e.target.value as Filters["country"] }))}>
            <option value="">Todos los países</option>
            {(Object.keys(COUNTRIES) as CountryCode[]).map((k) => (
              <option key={k} value={k}>{COUNTRIES[k].flag} {COUNTRIES[k].name}</option>
            ))}
          </select>
        </label>
      </fieldset>

      <p className="muted small" aria-live="polite">{list.length} {list.length === 1 ? "bono" : "bonos"}</p>

      {list.length === 0 ? (
        <p className="empty">Ningún bono coincide con estos filtros.</p>
      ) : (
        <ul className="bonus-list">
          {list.map((c) => (
            <li key={c.slug} className="card bonus-item">
              <div className="bi-head">
                <CasinoLogo casino={c} size={44} />
                <div>
                  <Link href={`/casinos/${c.slug}/`} className="r-name">{c.name}</Link>
                  <SampleBadge casino={c} />
                </div>
                <Score casino={c} />
              </div>
              <p className="bonus-headline">{c.bonus.headline}</p>
              <ul className="tags">
                <li>Apuesta: <strong>{c.bonus.wagering}</strong></li>
                {c.bonus.minDeposit && <li>Dep. mín.: {c.bonus.minDeposit}</li>}
                {c.bonus.noDeposit && <li className="tag-good">Sin depósito</li>}
                {(c.bonus.freeSpins ?? 0) > 0 && <li>{c.bonus.freeSpins} giros</li>}
                {c.crypto.length > 0 && <li>Cripto</li>}
                {c.bonus.code && <li>Código: <code>{c.bonus.code}</code></li>}
              </ul>
              <p className="small muted">{c.bonus.terms}</p>
              <div className="bi-actions">
                <VisitButton casino={c} placement="bonos" label="Obtener bono" />
                <Link href={`/casinos/${c.slug}/`} className="btn btn-ghost">Reseña</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
