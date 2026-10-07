"use client";
// Dice: roll 0.00–99.99, win if the roll is under the target (the API only offers "roll under").
// A big 0–100 slider with win / lose zones, a draggable handle and a result marker that slides to
// the roll; Multiplier, Roll under and Win chance stay in sync.
import { useEffect, useRef, useState } from "react";
import { api, money } from "@/lib/api";
import { balanceChanged } from "@/lib/useMe";
import { diceMultiplier } from "@/lib/fair";
import { reducedMotion, useFx } from "./kit/fx";
import { sfx } from "./kit/sound";
import { AutoPanel, BetButton, BetInput, cents, GameShell, NumField, useAuto, useHotkey, useMaxBet, useSession } from "./kit/ui";

type Result = {
  roll: number; target: number; multiplier: number; win: number; bet: number; nonce: number; client_seed: string; server_seed_hash: string;
  rtp: number; max_win: number; max_win_applied: boolean;
};

const clampT = (t: number) => Math.min(98, Math.max(2, Math.round(t * 100) / 100));

export default function Dice({ rtp: initialRtp, maxWin: initialMax }: { rtp: number; maxWin: number }) {
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [amount, setAmount] = useState("1.00");
  const [target, setTarget] = useState(50);
  const [result, setResult] = useState<Result | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [rtp, setRtp] = useState(initialRtp);
  const [maxWin, setMaxWin] = useState(initialMax);
  const [edit, setEdit] = useState<{ k: string; v: string } | null>(null);
  const session = useSession();
  const fx = useFx();
  const { max } = useMaxBet(maxWin);
  const raf = useRef(0);
  const track = useRef<HTMLDivElement>(null);
  const lastTick = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const multiplier = diceMultiplier(target, rtp);
  const stake = cents(amount);
  const rawWin = Math.floor(stake * multiplier);
  const capped = maxWin > 0 && rawWin > maxWin;
  const profit = (capped ? maxWin : rawWin) - stake;

  async function play(amountCents: number, fast = false) {
    setError("");
    fx.clear();
    sfx.bet();
    const r = await api<Result>("/api/originals/dice/bet", { amount: amountCents, target });
    setRtp(r.rtp);
    setMaxWin(r.max_win);
    setRefresh((n) => n + 1);
    const from = shown ?? 50;
    setResult(r);
    setRolling(true);
    const dur = reducedMotion() ? 0 : fast ? 380 : 520;
    const done = new Promise<void>((resolve) => {
      const t0 = performance.now();
      const step = (now: number) => {
        const k = dur ? Math.min(1, (now - t0) / dur) : 1;
        const e = 1 - Math.pow(1 - k, 3);
        setShown(from + (r.roll - from) * e);
        if (now - lastTick.current > 45 && k < 1) { sfx.tick(0.8 + e * 0.6); lastTick.current = now; }
        if (k < 1) raf.current = requestAnimationFrame(step);
        else {
          setShown(r.roll);
          setRolling(false);
          if (r.win > 0) fx.win(r.win / r.bet, r.win, { quiet: fast && r.win / r.bet < 10 }); else fx.lose();
          session.record({ bet: r.bet, win: r.win, mult: r.win > 0 ? r.win / r.bet : 0, label: r.roll.toFixed(2),
            pick: { client_seed: r.client_seed, nonce: r.nonce, server_seed_hash: r.server_seed_hash, rtp: r.rtp, target: r.target } });
          balanceChanged();
          resolve();
        }
      };
      raf.current = requestAnimationFrame(step);
    });
    return { bet: r.bet, win: r.win, done };
  }

  const auto = useAuto({ amount, setAmount, play: (c) => play(c, true), onError: setError, gap: 160 });
  const busy = rolling || auto.running;

  const manual = () => { if (!busy) play(stake).catch((e) => setError(e.message)); };
  useHotkey(() => (mode === "auto" ? (auto.running ? auto.stop() : auto.start()) : manual()), mode === "auto" || !busy);

  // Slider drag: pointer anywhere on the track moves the handle (integer targets).
  const fromPointer = (clientX: number) => {
    const el = track.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const t = clampT(Math.round(((clientX - r.left) / r.width) * 100));
    setTarget((old) => { if (old !== t) sfx.tick(1 + t / 200); return t; });
  };
  const onDown = (e: React.PointerEvent) => {
    if (auto.running) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    fromPointer(e.clientX);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (auto.running) return;
    const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (d) { e.preventDefault(); setTarget((t) => clampT(Math.round(t) + d * (e.shiftKey ? 10 : 1))); }
  };

  // The three synced fields: while one is being typed in it keeps the raw text.
  const val = (k: string, v: string) => (edit?.k === k ? edit.v : v);
  const typed = (k: string, conv: (n: number) => number) => (v: string) => {
    setEdit({ k, v });
    const n = parseFloat(v);
    if (n > 0 && isFinite(n)) setTarget(clampT(conv(n)));
  };
  const blur = () => setEdit(null);

  const won = result && !rolling ? result.win > 0 : null;
  const pos = shown ?? null;

  const controls = (
    <>
      <BetInput value={amount} onChange={setAmount} disabled={busy} max={max} />
      <NumField label="Profit on win" value={(profit / 100).toFixed(2)} readOnly suffix="$" right={capped ? "max win" : `${multiplier.toFixed(4)}×`} />
      {mode === "auto" && <AutoPanel auto={auto} />}
      {mode === "manual"
        ? <BetButton onClick={manual} disabled={busy}>{rolling ? "Rolling…" : "Bet"}</BetButton>
        : auto.running
          ? <BetButton variant="stop" onClick={auto.stop}>Stop auto-bet</BetButton>
          : <BetButton onClick={auto.start}>Start auto-bet</BetButton>}
      {capped && <p className="og-note">This bet could win {money(rawWin)}, above the maximum win of {money(maxWin)} per bet: a win pays {money(maxWin)}.</p>}
      {error && <p className="og-error" role="alert">{error}</p>}
    </>
  );

  const stage = (
    <div className="dice-stage">
      <div className={"dice-readout" + (won === true ? " win" : won === false ? " lose" : "")}>
        <span>{pos != null ? pos.toFixed(2) : "50.00"}</span>
        <small>{result ? (rolling ? "Rolling" : won ? `You won ${money(result.win)}${result.max_win_applied ? " · max win" : ""}` : `Roll under ${result.target} lost`) : "Win if the roll is under the target"}</small>
      </div>
      <div className="dice-slider">
        <div className="dice-scale" aria-hidden>{[0, 25, 50, 75, 100].map((n) => <span key={n} style={{ left: n + "%" }}>{n}</span>)}</div>
        <div className="dice-rail">
          <div ref={track} className="dice-track" onPointerDown={onDown} onPointerMove={(e) => e.buttons && !auto.running && fromPointer(e.clientX)}
            style={{ "--t": target + "%" } as React.CSSProperties}>
            <div className="dice-zone win" />
            <div className="dice-zone lose" />
            <div className="dice-handle" role="slider" tabIndex={0} aria-label="Roll under target" aria-valuemin={2} aria-valuemax={98} aria-valuenow={target}
              onKeyDown={onKey}><i /><i /><i /></div>
            {pos != null && (
              <div className={"dice-marker" + (won === true ? " win" : won === false ? " lose" : "") + (rolling ? " moving" : "")} style={{ left: pos + "%" }}>
                <div className="hex"><span>{pos.toFixed(2)}</span></div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="dice-fields">
        <NumField label="Multiplier" value={val("m", multiplier.toFixed(4))} onChange={typed("m", (m) => rtp / m)} onBlur={blur} disabled={auto.running} suffix="×" step="0.0001" />
        <NumField label="Roll under" value={val("t", String(target))} onChange={typed("t", (t) => t)} onBlur={blur} disabled={auto.running} suffix={<span className="swap" title="This game only rolls under">⇩</span>} />
        <NumField label="Win chance" value={val("c", target.toFixed(2))} onChange={typed("c", (c) => c)} onBlur={blur} disabled={auto.running} suffix="%" />
      </div>
    </div>
  );

  return (
    <GameShell game="dice" mode={mode} onMode={setMode} modeLocked={auto.running} controls={controls} stage={<>{stage}{fx.layer}</>} glow={fx.glow}
      session={session} fair={{ refreshKey: refresh }} rtp={rtp} maxWin={maxWin} fmtPill={(r) => r.label ?? ""} />
  );
}
