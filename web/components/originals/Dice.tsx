"use client";
// Dice: roll 0.00–99.99, win if the roll is under the target (the API only offers "roll under").
// A tumbling 3D die and a counting readout over a ticked 0–100 slider with win / lose zones, a
// chunky draggable handle and a result pin that slides (with a motion trail) to the roll and lands
// with a bounce; recent rolls stack in the corner. Multiplier, Roll under and Win chance stay in sync.
import "@/app/og-dice.css";
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

  // Presentation only: remember the previous frame's marker position (for the motion trail).
  const prevPos = useRef<number | null>(null);
  useEffect(() => { prevPos.current = pos; });

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

  const resCls = won === true ? " win" : won === false ? " lose" : "";
  const shownTxt = pos != null ? pos.toFixed(2) : "50.00";
  const [intPart, decPart] = shownTxt.split(".");
  const face = result ? dieFace(result.roll) : 5;
  // Motion trail behind the pin while it slides: its length follows the per-frame speed.
  const vel = rolling && pos != null && prevPos.current != null ? pos - prevPos.current : 0;
  const trail = Math.min(16, Math.abs(vel) * 4.5);

  const stage = (
    <div className={"dx-stage" + (rolling ? " rolling" : "") + resCls}>
      <div className="dx-floor" aria-hidden />
      <div className="dx-stars" aria-hidden />
      <div className="dx-hero">
        <div className="dx-die-wrap" aria-hidden>
          <div key={"hop" + refresh} className={"dx-die-hop" + (refresh ? " go" : "")}>
            <div className="dx-cube" style={{ "--rx": FACE_ROT[face][0] + "deg", "--ry": FACE_ROT[face][1] + "deg" } as React.CSSProperties}>
              {[1, 2, 3, 4, 5, 6].map((f) => <DieFace key={f} n={f} />)}
            </div>
          </div>
          <div key={"sh" + refresh} className={"dx-die-shadow" + (refresh ? " go" : "")} />
        </div>
        <div className={"dx-readout" + resCls + (rolling ? " rolling" : "")}>
          <div key={rolling ? "r" : "d" + refresh} className="dx-num">
            <span>{intPart}</span><span className="dec">.{decPart}</span>
          </div>
          <div className="dx-status">
            {result
              ? rolling ? <span className="dx-tag roll">Rolling…</span>
                : won ? <span className="dx-tag w">Win +{money(result.win)}{result.max_win_applied ? " · max win" : ""}</span>
                  : <span className="dx-tag l">Under {result.target} · no win</span>
              : <span className="dx-tag">Win if the roll is under <b>{target}</b></span>}
          </div>
        </div>
      </div>
      <div className="dx-slider">
        <div className="dx-rail">
          <div ref={track} className={"dx-track" + resCls} onPointerDown={onDown} onPointerMove={(e) => e.buttons && !auto.running && fromPointer(e.clientX)}
            style={{ "--t": target + "%" } as React.CSSProperties}>
            <div className="dx-zone win" />
            <div className="dx-zone lose" />
            {pos != null && trail > 0.3 && (
              <div className={"dx-trail" + (vel < 0 ? " rev" : "")} style={{ left: (vel > 0 ? pos - trail : pos) + "%", width: trail + "%" }} />
            )}
            {pos != null && !rolling && result && <span key={"rip" + refresh} className={"dx-ripple" + resCls} style={{ left: pos + "%" }} />}
            <div className={"dx-handle" + (auto.running ? " locked" : "")} role="slider" tabIndex={0} aria-label="Roll under target" aria-valuemin={2} aria-valuemax={98} aria-valuenow={target}
              onKeyDown={onKey}><span className="dx-handle-lbl">{target}</span></div>
            {pos != null && (
              <div key={"pin" + (rolling ? "m" : refresh)} className={"dx-marker" + resCls + (rolling ? " moving" : " landed")} style={{ left: pos + "%" }}>
                <div className="dx-pin"><span>{pos.toFixed(2)}</span></div>
              </div>
            )}
          </div>
        </div>
        <div className="dx-ticks" aria-hidden>
          {Array.from({ length: 21 }, (_, k) => k * 5).map((v) => (
            <span key={v} className={(v % 25 === 0 ? "major" : "") + (v < target ? " in" : "")} style={{ left: v + "%" }}>{v % 25 === 0 && <em>{v}</em>}</span>
          ))}
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
      stageClass="dx-bg" session={session} fair={{ refreshKey: refresh }} rtp={rtp} maxWin={maxWin} fmtPill={(r) => r.label ?? ""} />
  );
}

/** Decorative die face for a roll: higher rolls land on more pips. */
const dieFace = (roll: number) => Math.min(6, 1 + Math.floor((roll / 100) * 6));
/** Cube rotation (x, y in degrees) that brings each face to the front. */
const FACE_ROT: Record<number, [number, number]> = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] };
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function DieFace({ n }: { n: number }) {
  return (
    <div className={"dx-face f" + n}>
      {Array.from({ length: 9 }, (_, k) => <i key={k} className={PIPS[n].includes(k) ? "on" : ""} />)}
    </div>
  );
}
