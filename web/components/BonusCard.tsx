"use client";
// A player's bonus (active, pending or past) with wagering progress, its rules and free spins.
// Used on /promo ("My bonuses") and /profile.
import Link from "next/link";
import { useState } from "react";
import { api, fmtDate, money } from "@/lib/api";
import { balanceChanged } from "@/lib/useMe";
import { PlayerBonus, bonusStatusText } from "@/lib/labels";

type SpinResult = { multiplier: number; win: number; spins_left: number; total_won: number; finished: boolean };

export const kindIcon: Record<string, string> = { deposit_match: "💰", no_deposit: "🎁", freespins: "🎰" };
const reelSymbols = ["🍒", "🍋", "🔔", "💎", "7️⃣", "⭐", "🍇", "📜"];

export default function BonusCard({ b, onCancel, onChange }: { b: PlayerBonus; onCancel?: () => void; onChange?: () => void }) {
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
      {live && b.max_bet > 0 && (
        <p className="bonus-rule">
          <b>Max bet {money(b.max_bet)}</b> per spin or round while this bonus is active. Some games, such as Dice,
          count only partly towards wagering: <Link href="/legal/bonus-terms#section-6">see the table</Link>.
        </p>
      )}
      {b.wager_required > 0 && (
        <div className="wager">
          <div className="wager-label"><span className="muted">Wagering</span><span>{money(b.wager_progress)} / {money(b.wager_required)}</span></div>
          <div className="progress"><div style={{ width: pct + "%" }} /></div>
        </div>
      )}
      {live && (onCancel || b.status === "pending" || b.kind === "freespins") && (
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
