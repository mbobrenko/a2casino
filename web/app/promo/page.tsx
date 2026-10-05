"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, money } from "@/lib/api";
import { balanceChanged, useMe } from "@/lib/useMe";
import { BonusOffer, PlayerBonus } from "@/lib/labels";
import BonusCard, { kindIcon } from "@/components/BonusCard";

function offerTerms(o: BonusOffer) {
  const t: string[] = [];
  if (o.kind === "deposit_match") t.push(`${o.percent}% up to ${money(o.max_amount)}`);
  if (o.kind === "no_deposit" && o.fixed_amount) t.push(`${money(o.fixed_amount)} no deposit`);
  if (o.kind === "freespins") t.push(`${o.freespins_count} free spins at ${money(o.freespin_value)}`);
  if (o.min_deposit) t.push(`min. deposit ${money(o.min_deposit)}`);
  if (o.wager_multiplier) t.push(`wagering x${o.wager_multiplier}`);
  if (o.max_bet) t.push(`max bet ${money(o.max_bet)}`);
  if (o.valid_days) t.push(`${o.valid_days} ${o.valid_days === 1 ? "day" : "days"}`);
  return t;
}

export default function Promo() {
  const { me, ready } = useMe();
  const [offers, setOffers] = useState<BonusOffer[]>([]);
  const [mine, setMine] = useState<PlayerBonus[]>([]);
  const [claimable, setClaimable] = useState<BonusOffer[]>([]);
  const [code, setCode] = useState("");
  const [codeMsg, setCodeMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ offers: BonusOffer[] }>("/api/promo/offers").then((r) => setOffers(r.offers)).catch(() => {});
  }, []);

  const reload = () =>
    api<{ bonuses: PlayerBonus[]; offers: BonusOffer[] }>("/api/bonuses")
      .then((r) => { setMine(r.bonuses); setClaimable(r.offers); })
      .catch(() => {});

  useEffect(() => {
    if (me) reload();
    else { setMine([]); setClaimable([]); }
  }, [me?.id]);

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true); setCodeMsg(null);
    try {
      await api("/api/promo/redeem", { code: code.trim().toUpperCase() });
      setCodeMsg({ ok: true, text: "Promo code applied! Your bonus is now in My bonuses." });
      setCode("");
      reload(); balanceChanged();
    } catch (err: any) {
      setCodeMsg({ ok: false, text: err.message });
    }
    setBusy(false);
  }

  async function claim(o: BonusOffer) {
    setMsg(null);
    try {
      await api(`/api/bonuses/offers/${o.id}/claim`, {});
      setMsg({ ok: true, text: `“${o.title}” activated. Deposit at least ${money(o.min_deposit)} to receive your bonus.` });
      reload();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message });
    }
  }

  async function cancel(b: PlayerBonus) {
    const warn = b.status === "active"
      ? `Cancel “${b.title}”?\n\nAny remaining bonus balance from it will be lost. This cannot be undone.`
      : `Cancel “${b.title}”?`;
    if (!window.confirm(warn)) return;
    setMsg(null);
    try {
      await api(`/api/bonuses/${b.id}/cancel`, {});
      setMsg({ ok: true, text: "Bonus cancelled" });
      reload(); balanceChanged();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message });
    }
  }

  const claimableIds = new Set(claimable.map((o) => o.id));
  const current = mine.filter((b) => b.status === "active" || b.status === "pending");
  const past = mine.filter((b) => b.status !== "active" && b.status !== "pending");

  return (
    <>
      <h1>Promotions & bonuses</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        All bonuses are subject to the <Link href="/legal/bonus-terms" className="terms-link">Bonus Terms</Link>.
      </p>

      <div className="panel promo-code">
        <div>
          <h2>Have a promo code?</h2>
          <p className="muted" style={{ margin: 0 }}>Enter it to get a bonus or free spins.</p>
        </div>
        {me ? (
          <form className="row" onSubmit={redeem}>
            <input placeholder="e.g. WELCOME5" value={code} onChange={(e) => setCode(e.target.value)} style={{ flex: 1, minWidth: 0, textTransform: "uppercase" }} />
            <button className="btn gold" disabled={busy || !code.trim()}>Apply</button>
          </form>
        ) : ready && <Link href="/login" className="btn">Log in to enter a code</Link>}
        {codeMsg && <p className={codeMsg.ok ? "ok" : "error"} style={{ margin: 0 }}>{codeMsg.text}</p>}
      </div>

      {msg && <p className={msg.ok ? "ok" : "error"}>{msg.text}</p>}

      {me && (
        <section className="section">
          <div className="section-head"><h2>My bonuses</h2></div>
          {current.length === 0 && <p className="muted">No active bonuses. Claim an offer below or enter a promo code.</p>}
          <div className="cards">
            {current.map((b) => <BonusCard key={b.id} b={b} onCancel={() => cancel(b)} onChange={reload} />)}
          </div>
          {past.length > 0 && (
            <details className="archive">
              <summary>Past bonuses ({past.length})</summary>
              <div className="cards" style={{ marginTop: 12 }}>
                {past.map((b) => <BonusCard key={b.id} b={b} />)}
              </div>
            </details>
          )}
        </section>
      )}

      <section className="section">
        <div className="section-head"><h2>Offers</h2></div>
        {offers.length === 0 && <p className="muted">No offers available right now.</p>}
        <div className="cards">
          {offers.map((o) => (
            <div key={o.id} className="panel offer">
              <div className="offer-icon">{kindIcon[o.kind] ?? "🎁"}</div>
              <h3>{o.title}</h3>
              <p className="muted">{o.description}</p>
              <div className="terms">{offerTerms(o).map((t) => <span key={t}>{t}</span>)}</div>
              <div className="offer-foot">
                {!me && ready && <Link href="/register" className="btn">Sign up</Link>}
                {me && claimableIds.has(o.id) && <button className="btn gold" onClick={() => claim(o)}>Claim</button>}
                {me && !claimableIds.has(o.id) && (
                  <span className="muted">{mine.some((b) => b.bonus_id === o.id) ? "✓ Already claimed" : "Not available right now"}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
