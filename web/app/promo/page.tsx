"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, fmtDate, money } from "@/lib/api";
import { balanceChanged, useMe } from "@/lib/useMe";
import { BonusOffer, PlayerBonus, bonusStatusText } from "@/lib/labels";

type SpinResult = { multiplier: number; win: number; spins_left: number; total_won: number; finished: boolean };

const kindIcon: Record<string, string> = { deposit_match: "💰", no_deposit: "🎁", freespins: "🎰" };
const reelSymbols = ["🍒", "🍋", "🔔", "💎", "7️⃣", "⭐", "🍇", "📜"];

function offerTerms(o: BonusOffer) {
  const t: string[] = [];
  if (o.kind === "deposit_match") t.push(`${o.percent}% up to ${money(o.max_amount)}`);
  if (o.kind === "no_deposit" && o.fixed_amount) t.push(`${money(o.fixed_amount)} no deposit`);
  if (o.kind === "freespins") t.push(`${o.freespins_count} free spins at ${money(o.freespin_value)}`);
  if (o.min_deposit) t.push(`min. deposit ${money(o.min_deposit)}`);
  if (o.wager_multiplier) t.push(`wagering x${o.wager_multiplier}`);
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
            {current.map((b) => <MyBonus key={b.id} b={b} onCancel={() => cancel(b)} onChange={reload} />)}
          </div>
          {past.length > 0 && (
            <details className="archive">
              <summary>Past bonuses ({past.length})</summary>
              <div className="cards" style={{ marginTop: 12 }}>
                {past.map((b) => <MyBonus key={b.id} b={b} />)}
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

function MyBonus({ b, onCancel, onChange }: { b: PlayerBonus; onCancel?: () => void; onChange?: () => void }) {
  const pct = b.wager_required > 0 ? Math.min(100, (b.wager_progress / b.wager_required) * 100) : 0;
  const live = b.status === "active" || b.status === "pending";
  return (
    <div className={"panel bonus" + (live ? "" : " past")}>
      <div className="bonus-head">
        <h3>{kindIcon[b.kind] ?? "🎁"} {b.title}</h3>
        <span className={"status b-" + b.status}>{bonusStatusText[b.status] ?? b.status}</span>
      </div>
      {b.description && <p className="muted">{b.description}</p>}
      <div className="kv">
        {b.amount > 0 && <div><span className="muted">Bonus amount</span><b>{money(b.amount)}</b></div>}
        {b.kind === "freespins" && <div><span className="muted">Free spins left</span><b>{b.freespins_left}</b></div>}
        {b.kind === "freespins" && b.freespins_won > 0 && <div><span className="muted">Free spin winnings</span><b>{money(b.freespins_won)}</b></div>}
        {b.status === "pending" && b.min_deposit > 0 && <div><span className="muted">Minimum deposit</span><b>{money(b.min_deposit)}</b></div>}
        <div><span className="muted">{live ? "Valid until" : "Ended"}</span><b>{live ? fmtDate(b.expires_at) : fmtDate(b.finished_at)}</b></div>
      </div>
      {b.wager_required > 0 && (
        <div className="wager">
          <div className="wager-label"><span className="muted">Wagering</span><span>{money(b.wager_progress)} / {money(b.wager_required)}</span></div>
          <div className="progress"><div style={{ width: pct + "%" }} /></div>
        </div>
      )}
      {live && (
        <div className="row" style={{ marginTop: 12 }}>
          {b.status === "pending" && <Link href="/wallet" className="btn gold">Deposit now</Link>}
          {b.status === "active" && b.kind === "freespins" && b.freespins_left > 0 && <FreeSpins b={b} onChange={onChange} />}
          {onCancel && <button className="btn ghost" onClick={onCancel}>Cancel</button>}
        </div>
      )}
    </div>
  );
}

function FreeSpins({ b, onChange }: { b: PlayerBonus; onChange?: () => void }) {
  const [spinning, setSpinning] = useState(false);
  const [reels, setReels] = useState(["📜", "📜", "📜"]);
  const [res, setRes] = useState<SpinResult | null>(null);
  const [error, setError] = useState("");

  const pick = () => reelSymbols[Math.floor(Math.random() * reelSymbols.length)];

  async function spin() {
    setSpinning(true); setError(""); setRes(null);
    const started = Date.now();
    const timer = setInterval(() => setReels([pick(), pick(), pick()]), 80);
    try {
      const r = await api<SpinResult>(`/api/bonuses/${b.id}/freespin`, {});
      await new Promise((ok) => setTimeout(ok, Math.max(0, 900 - (Date.now() - started))));
      // Three equal symbols for a big win, two for a small one, all different for a miss.
      const s = pick();
      const other = () => { let x = pick(); while (x === s) x = pick(); return x; };
      const o = other();
      let third = other();
      while (third === o) third = other();
      setReels(r.multiplier >= 2 ? [s, s, s] : r.multiplier > 0 ? [s, s, o] : [s, o, third]);
      setRes(r);
      balanceChanged();
      // Keep the last result visible for a moment before the card refreshes (it disappears when spins run out).
      if (r.finished || r.spins_left === 0) setTimeout(() => onChange?.(), 3000);
      else onChange?.();
    } catch (e: any) {
      setError(e.message);
    }
    clearInterval(timer);
    setSpinning(false);
  }

  return (
    <div className="freespins">
      <div className={"reels" + (spinning ? " spinning" : "")}>
        {reels.map((r, i) => <div key={i} className="reel">{r}</div>)}
      </div>
      <button className="btn gold" onClick={spin} disabled={spinning || res?.spins_left === 0}>
        {spinning ? "Spinning…" : "Spin"}
      </button>
      {res && (
        <div className={"spin-result " + (res.win > 0 ? "win" : "muted")}>
          {res.win > 0 ? `x${res.multiplier} · won ${money(res.win)}` : "No win"}
          <span className="muted"> · {res.spins_left} left · {money(res.total_won)} total</span>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
