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
  if (o.kind === "deposit_match") t.push(`${o.percent}% до ${money(o.max_amount)}`);
  if (o.kind === "no_deposit" && o.fixed_amount) t.push(`${money(o.fixed_amount)} без депозита`);
  if (o.kind === "freespins") t.push(`${o.freespins_count} фриспинов по ${money(o.freespin_value)}`);
  if (o.min_deposit) t.push(`депозит от ${money(o.min_deposit)}`);
  if (o.wager_multiplier) t.push(`вейджер x${o.wager_multiplier}`);
  if (o.valid_days) t.push(`${o.valid_days} дн.`);
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
      setCodeMsg({ ok: true, text: "Промокод активирован! Бонус появился в разделе «Мои бонусы»." });
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
      setMsg({ ok: true, text: `«${o.title}» активирован. Внесите депозит от ${money(o.min_deposit)}, чтобы получить бонус.` });
      reload();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message });
    }
  }

  async function cancel(b: PlayerBonus) {
    const warn = b.status === "active"
      ? `Отменить бонус «${b.title}»?\n\nВесь оставшийся бонусный баланс по нему будет потерян. Это действие нельзя отменить.`
      : `Отменить бонус «${b.title}»?`;
    if (!window.confirm(warn)) return;
    setMsg(null);
    try {
      await api(`/api/bonuses/${b.id}/cancel`, {});
      setMsg({ ok: true, text: "Бонус отменён" });
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
      <h1>Промо и бонусы</h1>

      <div className="panel promo-code">
        <div>
          <h2>Есть промокод?</h2>
          <p className="muted" style={{ margin: 0 }}>Введите его, чтобы получить бонус или фриспины.</p>
        </div>
        {me ? (
          <form className="row" onSubmit={redeem}>
            <input placeholder="Например, WELCOME5" value={code} onChange={(e) => setCode(e.target.value)} style={{ flex: 1, minWidth: 0, textTransform: "uppercase" }} />
            <button className="btn gold" disabled={busy || !code.trim()}>Применить</button>
          </form>
        ) : ready && <Link href="/login" className="btn">Войдите, чтобы ввести код</Link>}
        {codeMsg && <p className={codeMsg.ok ? "ok" : "error"} style={{ margin: 0 }}>{codeMsg.text}</p>}
      </div>

      {msg && <p className={msg.ok ? "ok" : "error"}>{msg.text}</p>}

      {me && (
        <section className="section">
          <div className="section-head"><h2>Мои бонусы</h2></div>
          {current.length === 0 && <p className="muted">Активных бонусов нет. Активируйте предложение ниже или введите промокод.</p>}
          <div className="cards">
            {current.map((b) => <MyBonus key={b.id} b={b} onCancel={() => cancel(b)} onChange={reload} />)}
          </div>
          {past.length > 0 && (
            <details className="archive">
              <summary>Завершённые бонусы ({past.length})</summary>
              <div className="cards" style={{ marginTop: 12 }}>
                {past.map((b) => <MyBonus key={b.id} b={b} />)}
              </div>
            </details>
          )}
        </section>
      )}

      <section className="section">
        <div className="section-head"><h2>Предложения</h2></div>
        {offers.length === 0 && <p className="muted">Сейчас нет доступных предложений.</p>}
        <div className="cards">
          {offers.map((o) => (
            <div key={o.id} className="panel offer">
              <div className="offer-icon">{kindIcon[o.kind] ?? "🎁"}</div>
              <h3>{o.title}</h3>
              <p className="muted">{o.description}</p>
              <div className="terms">{offerTerms(o).map((t) => <span key={t}>{t}</span>)}</div>
              <div className="offer-foot">
                {!me && ready && <Link href="/register" className="btn">Зарегистрироваться</Link>}
                {me && claimableIds.has(o.id) && <button className="btn gold" onClick={() => claim(o)}>Активировать</button>}
                {me && !claimableIds.has(o.id) && (
                  <span className="muted">{mine.some((b) => b.bonus_id === o.id) ? "✓ Уже активирован" : "Сейчас недоступно"}</span>
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
        {b.amount > 0 && <div><span className="muted">Сумма бонуса</span><b>{money(b.amount)}</b></div>}
        {b.kind === "freespins" && <div><span className="muted">Фриспинов осталось</span><b>{b.freespins_left}</b></div>}
        {b.kind === "freespins" && b.freespins_won > 0 && <div><span className="muted">Выиграно на фриспинах</span><b>{money(b.freespins_won)}</b></div>}
        {b.status === "pending" && b.min_deposit > 0 && <div><span className="muted">Нужен депозит от</span><b>{money(b.min_deposit)}</b></div>}
        <div><span className="muted">{live ? "Действует до" : "Завершён"}</span><b>{live ? fmtDate(b.expires_at) : fmtDate(b.finished_at)}</b></div>
      </div>
      {b.wager_required > 0 && (
        <div className="wager">
          <div className="wager-label"><span className="muted">Отыгрыш</span><span>{money(b.wager_progress)} / {money(b.wager_required)}</span></div>
          <div className="progress"><div style={{ width: pct + "%" }} /></div>
        </div>
      )}
      {live && (
        <div className="row" style={{ marginTop: 12 }}>
          {b.status === "pending" && <Link href="/wallet" className="btn gold">Внести депозит</Link>}
          {b.status === "active" && b.kind === "freespins" && b.freespins_left > 0 && <FreeSpins b={b} onChange={onChange} />}
          {onCancel && <button className="btn ghost" onClick={onCancel}>Отменить</button>}
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
        {spinning ? "Крутим…" : "Крутить"}
      </button>
      {res && (
        <div className={"spin-result " + (res.win > 0 ? "win" : "muted")}>
          {res.win > 0 ? `x${res.multiplier} · выигрыш ${money(res.win)}` : "Без выигрыша"}
          <span className="muted"> · осталось {res.spins_left} · всего {money(res.total_won)}</span>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
