"use client";
// The A2 Labs game shell: a Stake-style two-panel layout (controls left, stage right; stage on top
// on mobile), the bet amount field, auto-bet, the recent results strip, live session stats with a
// sparkline, the sound toggle and the collapsible Fairness panel.
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { api, money } from "@/lib/api";
import { useMe } from "@/lib/useMe";
import FairPanel, { FairGame, Pick } from "../FairPanel";
import { fmtMult } from "./fx";
import { sfx, useSound } from "./sound";

export const cents = (s: string) => Math.round((parseFloat(s) || 0) * 100);
export const dollars = (c: number) => (c / 100).toFixed(2);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------------------------------------------- session: results and stats */

export type Res = { id: number; bet: number; win: number; mult: number; pick?: Pick; label?: string };

export function useSession() {
  const [results, setResults] = useState<Res[]>([]);
  const [stats, setStats] = useState({ bets: 0, wagered: 0, profit: 0, wins: 0, curve: [0] as number[] });
  const seq = useRef(0);
  const record = useCallback((r: Omit<Res, "id">) => {
    setResults((h) => [{ ...r, id: ++seq.current }, ...h].slice(0, 20));
    setStats((s) => {
      const profit = s.profit + r.win - r.bet;
      return { bets: s.bets + 1, wagered: s.wagered + r.bet, profit, wins: s.wins + (r.win > r.bet ? 1 : 0), curve: [...s.curve, profit].slice(-200) };
    });
  }, []);
  const reset = () => setStats({ bets: 0, wagered: 0, profit: 0, wins: 0, curve: [0] });
  return { results, stats, record, reset };
}
export type Session = ReturnType<typeof useSession>;

/* ---------------------------------------------------------------- bet limits for the Max button */

/** Max stake: the balance, the active bonus's max bet and the game's max win (a stake above it is refused). */
export function useMaxBet(maxWin: number) {
  const { me } = useMe();
  const [bonusMax, setBonusMax] = useState(0);
  useEffect(() => {
    api<{ bonuses: { status: string; max_bet: number }[] }>("/api/bonuses")
      .then((r) => setBonusMax(r.bonuses.find((b) => b.status === "active")?.max_bet ?? 0)).catch(() => {});
  }, []);
  const balance = me ? me.balance.real + me.balance.bonus : 0;
  let max = balance;
  if (bonusMax > 0) max = Math.min(max, bonusMax);
  if (maxWin > 0) max = Math.min(max, maxWin);
  return { max, balance, bonusMax };
}

/* ---------------------------------------------------------------- inputs */

export function BetInput({ value, onChange, disabled, max, label = "Bet amount" }: { value: string; onChange: (v: string) => void; disabled?: boolean; max: number; label?: string }) {
  const c = cents(value);
  const set = (x: number) => { sfx.click(); onChange(dollars(Math.max(10, Math.min(x, Math.max(10, max))))); };
  return (
    <div className="og-field">
      <div className="og-label"><span>{label}</span><span className="og-label-r">{money(c)}</span></div>
      <div className={"og-input money" + (disabled ? " disabled" : "")}>
        <span className="og-coin" aria-hidden>$</span>
        <input inputMode="decimal" type="number" min="0.1" step="0.1" value={value} disabled={disabled} aria-label={label}
          onChange={(e) => onChange(e.target.value)} onBlur={() => onChange(dollars(Math.max(10, cents(value))))} />
        <div className="og-quick">
          <button type="button" disabled={disabled} onClick={() => set(Math.floor(c / 2))}>½</button>
          <button type="button" disabled={disabled} onClick={() => set(c * 2)}>2×</button>
          <button type="button" disabled={disabled || max < 10} onClick={() => set(max)}>Max</button>
        </div>
      </div>
    </div>
  );
}

export function NumField({ label, value, onChange, disabled, suffix, right, step = "0.01", min, max, onBlur, readOnly }: {
  label: ReactNode; value: string; onChange?: (v: string) => void; disabled?: boolean; suffix?: ReactNode; right?: ReactNode;
  step?: string; min?: number; max?: number; onBlur?: () => void; readOnly?: boolean;
}) {
  return (
    <div className="og-field">
      <div className="og-label"><span>{label}</span>{right && <span className="og-label-r">{right}</span>}</div>
      <div className={"og-input" + (disabled ? " disabled" : "") + (readOnly ? " ro" : "")}>
        <input type="number" inputMode="decimal" value={value} step={step} min={min} max={max} disabled={disabled} readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)} onBlur={onBlur} aria-label={typeof label === "string" ? label : undefined} />
        {suffix && <span className="og-suffix">{suffix}</span>}
      </div>
    </div>
  );
}

export function Segmented<T extends string | number>({ label, options, value, onChange, disabled }: {
  label?: string; options: { v: T; t: ReactNode }[]; value: T; onChange: (v: T) => void; disabled?: boolean;
}) {
  return (
    <div className="og-field">
      {label && <div className="og-label"><span>{label}</span></div>}
      <div className="og-seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={String(o.v)} type="button" role="radio" aria-checked={o.v === value} className={o.v === value ? "on" : ""} disabled={disabled}
            onClick={() => { sfx.click(); onChange(o.v); }}>{o.t}</button>
        ))}
      </div>
    </div>
  );
}

export function BetButton({ children, onClick, disabled, variant = "go", hint = true }: { children: ReactNode; onClick: () => void; disabled?: boolean; variant?: "go" | "cash" | "stop"; hint?: boolean }) {
  return (
    <button type="button" className={"og-bet " + variant} onClick={onClick} disabled={disabled}>
      <span>{children}</span>
      {hint && <kbd className="og-kbd" aria-hidden>Space</kbd>}
    </button>
  );
}

/** Space triggers the main action (not while typing in a field or when a button has focus). */
export function useHotkey(handler: () => void, enabled: boolean) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest("input, textarea, select, button, [contenteditable], summary, a")) return;
      e.preventDefault();
      if (enabled) ref.current();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [enabled]);
}

/* ---------------------------------------------------------------- auto-bet */

export type AutoStep = { bet: number; win: number; done?: Promise<unknown> };
type AutoCfg = { count: string; stopProfit: string; stopLoss: string; onWin: "reset" | "inc"; onWinPct: string; onLoss: "reset" | "inc"; onLossPct: string };

/**
 * Sequential auto-bet: each bet waits for the previous result (and its animation); it stops after
 * the number of bets, at the profit / loss limits, on Stop or on any error (max bet, limits, balance).
 */
export function useAuto(opts: { amount: string; setAmount: (v: string) => void; play: (stake: number) => Promise<AutoStep>; onError: (m: string) => void; gap?: number }) {
  const [cfg, setCfg] = useState<AutoCfg>({ count: "10", stopProfit: "", stopLoss: "", onWin: "reset", onWinPct: "0", onLoss: "reset", onLossPct: "0" });
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const [net, setNet] = useState(0);
  const stopRef = useRef(false);
  const live = useRef(opts);
  live.current = opts;

  const start = async () => {
    if (running) return;
    stopRef.current = false;
    setRunning(true);
    setNet(0);
    const base = Math.max(10, cents(live.current.amount));
    let stake = base, profit = 0;
    const total = Math.max(0, Math.floor(Number(cfg.count) || 0)); // 0 = until stopped
    const stopP = cents(cfg.stopProfit), stopL = cents(cfg.stopLoss);
    try {
      for (let i = 0; total === 0 || i < total; i++) {
        if (stopRef.current) break;
        setLeft(total ? total - i : null);
        let r: AutoStep;
        try {
          r = await live.current.play(stake);
        } catch (e: any) {
          live.current.onError(e?.message ?? "Auto-bet stopped");
          break;
        }
        await r.done;
        profit += r.win - r.bet;
        setNet(profit);
        if (stopP > 0 && profit >= stopP) break;
        if (stopL > 0 && -profit >= stopL) break;
        const won = r.win > r.bet;
        const mode = won ? cfg.onWin : cfg.onLoss;
        const pct = parseFloat(won ? cfg.onWinPct : cfg.onLossPct) || 0;
        stake = mode === "reset" ? base : Math.max(10, Math.round(stake * (1 + pct / 100)));
        live.current.setAmount(dollars(stake));
        await sleep(live.current.gap ?? 220);
      }
    } finally {
      setRunning(false);
      setLeft(null);
    }
  };
  const stop = () => { stopRef.current = true; };
  return { cfg, setCfg, running, left, net, start, stop };
}
export type Auto = ReturnType<typeof useAuto>;

export function AutoPanel({ auto }: { auto: Auto }) {
  const { cfg, setCfg, running } = auto;
  const up = (k: keyof AutoCfg) => (v: string) => setCfg((c) => ({ ...c, [k]: v }));
  const strat = (k: "onWin" | "onLoss", pk: "onWinPct" | "onLossPct", label: string) => (
    <div className="og-field">
      <div className="og-label"><span>{label}</span></div>
      <div className={"og-input strat" + (running ? " disabled" : "")}>
        <div className="og-seg mini">
          <button type="button" className={cfg[k] === "reset" ? "on" : ""} disabled={running} onClick={() => setCfg((c) => ({ ...c, [k]: "reset" }))}>Reset</button>
          <button type="button" className={cfg[k] === "inc" ? "on" : ""} disabled={running} onClick={() => setCfg((c) => ({ ...c, [k]: "inc" }))}>Increase by</button>
        </div>
        <input type="number" min={0} step="1" value={cfg[pk]} disabled={running || cfg[k] === "reset"} onChange={(e) => up(pk)(e.target.value)} aria-label={label + " percent"} />
        <span className="og-suffix">%</span>
      </div>
    </div>
  );
  return (
    <>
      <NumField label="Number of bets" value={cfg.count} onChange={up("count")} disabled={running} step="1" min={0} suffix={cfg.count === "0" || cfg.count === "" ? "∞" : undefined}
        right={auto.left != null ? `${auto.left} left` : undefined} />
      {strat("onWin", "onWinPct", "On win")}
      {strat("onLoss", "onLossPct", "On loss")}
      <div className="og-two">
        <NumField label="Stop on profit" value={cfg.stopProfit} onChange={up("stopProfit")} disabled={running} suffix="$" />
        <NumField label="Stop on loss" value={cfg.stopLoss} onChange={up("stopLoss")} disabled={running} suffix="$" />
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- shell */

export function Sparkline({ curve }: { curve: number[] }) {
  const w = 120, h = 34;
  const pts = curve.length > 1 ? curve : [0, 0];
  const lo = Math.min(0, ...pts), hi = Math.max(0, ...pts);
  const span = hi - lo || 1;
  const y = (v: number) => h - 3 - ((v - lo) / span) * (h - 6);
  const d = pts.map((v, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * w).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = pts[pts.length - 1] >= 0;
  return (
    <svg className="og-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <line x1={0} x2={w} y1={y(0)} y2={y(0)} className="zero" />
      <path d={`${d} L${w},${y(0)} L0,${y(0)} Z`} className={"area " + (up ? "up" : "down")} />
      <path d={d} className={"line " + (up ? "up" : "down")} />
    </svg>
  );
}

export function ResultStrip({ results, onPick, fmt }: { results: Res[]; onPick: (r: Res) => void; fmt?: (r: Res) => string }) {
  return (
    <div className="og-strip" aria-label="Recent results">
      {results.length === 0 && <span className="og-strip-empty">Your last 20 results show up here</span>}
      {results.map((r, i) => (
        <button key={r.id} type="button" className={"og-pill " + (r.win > r.bet ? "w" : r.win > 0 ? "p" : "l") + (i === 0 ? " fresh" : "")}
          title={r.pick ? `Nonce ${r.pick.nonce} · click to verify` : undefined} onClick={() => onPick(r)}>
          {fmt ? fmt(r) : fmtMult(r.mult) + "×"}
        </button>
      ))}
    </div>
  );
}

export function GameShell({ game, mode, onMode, modeLocked, controls, stage, stageClass = "", glow, session, fair, rtp, maxWin, info, fmtPill }: {
  game: FairGame; mode: "manual" | "auto"; onMode: (m: "manual" | "auto") => void; modeLocked?: boolean;
  controls: ReactNode; stage: ReactNode; stageClass?: string; glow?: string; session: Session;
  fair: { refreshKey: number; locked?: boolean }; rtp: number; maxWin: number; info?: ReactNode; fmtPill?: (r: Res) => string;
}) {
  const [sound, setSound] = useSound();
  const [fairOpen, setFairOpen] = useState(false);
  const [pick, setPick] = useState<Pick | null>(null);
  const fairRef = useRef<HTMLDivElement>(null);
  const { stats } = session;
  const openPick = (r: Res) => {
    if (!r.pick) return;
    setPick({ ...r.pick });
    setFairOpen(true);
    setTimeout(() => fairRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  return (
    <section className={"og-shell og-" + game}>
      <div className="og-main">
        <aside className="og-side">
          <div className="og-tabs" role="tablist">
            {(["manual", "auto"] as const).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? "on" : ""} disabled={modeLocked && mode !== m}
                onClick={() => { sfx.click(); onMode(m); }}>{m === "manual" ? "Manual" : "Auto"}</button>
            ))}
          </div>
          <div className="og-controls">{controls}</div>
        </aside>
        <div className="og-stage-col">
          <ResultStrip results={session.results} onPick={openPick} fmt={fmtPill} />
          <div className={"og-stage " + stageClass + (glow ? " glow-" + glow : "")}>{stage}</div>
          <div className="og-bar">
            <div className="og-stats">
              <div><small>Bets</small><b>{stats.bets}</b></div>
              <div><small>Wagered</small><b>{money(stats.wagered)}</b></div>
              <div><small>Profit</small><b className={stats.profit > 0 ? "pos" : stats.profit < 0 ? "neg" : ""}>{stats.profit > 0 ? "+" : ""}{money(stats.profit)}</b></div>
              <Sparkline curve={stats.curve} />
            </div>
            <div className="og-bar-r">
              <span className="og-chip" title="Return to player">RTP {rtp}%</span>
              {maxWin > 0 && <span className="og-chip" title="Maximum win per bet">Max win {money(maxWin)}</span>}
              <button type="button" className={"og-icon-btn" + (sound ? " on" : "")} aria-pressed={sound} aria-label={sound ? "Mute sounds" : "Turn sounds on"}
                title={sound ? "Sound on" : "Sound off"} onClick={() => { setSound(!sound); }}>
                <SpeakerIcon on={sound} />
              </button>
              <button type="button" className={"og-icon-btn fair-btn" + (fairOpen ? " on" : "")} aria-expanded={fairOpen} onClick={() => setFairOpen((o) => !o)}>
                <ShieldIcon /> <span>Fairness</span>
              </button>
            </div>
          </div>
          {info}
        </div>
      </div>
      <div ref={fairRef} className={"og-fair" + (fairOpen ? " open" : "")} hidden={!fairOpen}>
        <FairPanel game={game} refreshKey={fair.refreshKey} pick={pick} locked={fair.locked} rtp={rtp} />
      </div>
    </section>
  );
}

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" />
      {on ? <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></> : <><path d="m16 9 5 6" /><path d="m21 9-5 6" /></>}
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" />
    </svg>
  );
}
