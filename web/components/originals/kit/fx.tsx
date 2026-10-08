"use client";
// Win feedback shared by the A2 Labs games: a multiplier pop over the stage for ordinary wins, a
// tiered celebration for big ones (Big ≥ 10×, Mega ≥ 50×, Epic ≥ 250×: light rays, a count-up and
// a coin shower; a tap skips it) and a short glow; losses get a subtle dim. Respects
// prefers-reduced-motion.
import { useCallback, useEffect, useRef, useState } from "react";
import { money } from "@/lib/api";
import { sfx } from "./sound";

export const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

type Pop = { id: number; mult: number; win: number; big: boolean };
type Tier = "big" | "mega" | "epic";
type Celebration = { id: number; mult: number; win: number; tier: Tier };

export const winTier = (mult: number): Tier | null => (mult >= 250 ? "epic" : mult >= 50 ? "mega" : mult >= 10 ? "big" : null);
const TIER_TEXT: Record<Tier, string> = { big: "Big win", mega: "Mega win", epic: "Epic win" };
const TIER_MS: Record<Tier, number> = { big: 2600, mega: 3400, epic: 4200 };

export function useFx() {
  const [pop, setPop] = useState<Pop | null>(null);
  const [glow, setGlow] = useState<"" | "win" | "big" | "lose">("");
  const [cel, setCel] = useState<Celebration | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const timers = useRef<number[]>([]);
  const seq = useRef(0);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };

  const win = useCallback((mult: number, winCents: number, opts: { quiet?: boolean } = {}) => {
    const tier = winTier(mult);
    const big = tier !== null;
    const id = ++seq.current;
    setGlow(big ? "big" : "win");
    sfx.win(big);
    if (tier) {
      // Big wins always celebrate, even in fast auto-bet: they are rare and the moment players share.
      const ms = reducedMotion() ? 1600 : TIER_MS[tier];
      setPop(null);
      setCel({ id, mult, win: winCents, tier });
      if (!reducedMotion() && canvas.current) coinShower(canvas.current, tier === "epic" ? 220 : tier === "mega" ? 160 : 100, ms);
      later(() => setCel((c) => (c?.id === id ? null : c)), ms);
      later(() => setGlow(""), ms - 400);
      return;
    }
    if (!opts.quiet) setPop({ id, mult, win: winCents, big });
    later(() => setPop((p) => (p?.id === id ? null : p)), 1400);
    later(() => setGlow(""), 900);
  }, []);

  const lose = useCallback(() => {
    setPop(null);
    setGlow("lose");
    sfx.lose();
    later(() => setGlow(""), 500);
  }, []);

  // A new bet clears the small pop but lets a big-win celebration finish (a tap skips it).
  const clear = useCallback(() => { setPop(null); }, []);

  const layer = (
    <div className="fx-layer" aria-live="polite">
      <canvas ref={canvas} className="fx-confetti" aria-hidden />
      {pop && (
        <div key={pop.id} className={"fx-pop" + (pop.big ? " big" : "")}>
          <div className="fx-mult">{fmtMult(pop.mult)}×</div>
          <div className="fx-amt">+{money(pop.win)}</div>
        </div>
      )}
      {cel && (
        <div key={cel.id} className={"fx-cel " + cel.tier} onClick={() => setCel(null)} role="status">
          <div className="fx-rays" aria-hidden />
          <div className="fx-cel-box">
            <div className="fx-cel-title">{TIER_TEXT[cel.tier]}</div>
            <CountUp key={cel.id} to={cel.win} ms={Math.min(1800, TIER_MS[cel.tier] - 900)} />
            <div className="fx-cel-mult">{fmtMult(cel.mult)}×</div>
          </div>
        </div>
      )}
    </div>
  );
  return { layer, glow, win, lose, clear };
}

/** The win amount rolling up from zero with an ease-out, ticking coin sounds on the way. */
function CountUp({ to, ms }: { to: number; ms: number }) {
  const [v, setV] = useState(reducedMotion() ? to : 0);
  useEffect(() => {
    if (reducedMotion()) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return <div className="fx-cel-amt">{money(v)}</div>;
}

export const fmtMult = (m: number) => (m >= 1000 ? m.toLocaleString("en-US", { maximumFractionDigits: 0 }) : m.toFixed(2));

/** Gold coins and sparks bursting up from the stage and raining down (canvas, requestAnimationFrame). */
function coinShower(c: HTMLCanvasElement, n: number, ms: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = c.clientWidth, h = c.clientHeight;
  c.width = w * dpr; c.height = h * dpr;
  const g = c.getContext("2d");
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const parts = Array.from({ length: n }, (_, i) => {
    const fountain = i % 3 !== 0;
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
    const v = 7 + Math.random() * 10;
    return fountain
      ? { x: w / 2 + (Math.random() - 0.5) * 60, y: h * 0.62, vx: Math.cos(a) * v, vy: Math.sin(a) * v, d: 0 }
      : { x: Math.random() * w, y: -20 - Math.random() * h * 0.8, vx: (Math.random() - 0.5) * 1.5, vy: 1 + Math.random() * 3, d: Math.random() * 600 };
  }).map((p) => ({ ...p, r: 6 + Math.random() * 7, a: Math.random() * 6, va: 0.08 + Math.random() * 0.2, spark: Math.random() < 0.2 }));
  const start = performance.now();
  const step = (now: number) => {
    const t = now - start;
    g.clearRect(0, 0, w, h);
    g.globalAlpha = Math.max(0, Math.min(1, (ms - t) / 500));
    for (const p of parts) {
      if (t < p.d) continue;
      p.vy += 0.3; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      if (p.spark) { g.fillStyle = "#fff6c8"; g.beginPath(); g.arc(p.x, p.y, 2, 0, 7); g.fill(); continue; }
      const sx = Math.max(0.15, Math.abs(Math.cos(p.a)));
      g.save(); g.translate(p.x, p.y); g.scale(sx, 1);
      const gr = g.createRadialGradient(-p.r * 0.3, -p.r * 0.3, 0, 0, 0, p.r);
      gr.addColorStop(0, "#fff6c8"); gr.addColorStop(0.6, "#f5c542"); gr.addColorStop(1, "#a86f12");
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, p.r, 0, 7); g.fill();
      g.strokeStyle = "#7a4a06"; g.lineWidth = 1.2; g.stroke();
      g.beginPath(); g.arc(0, 0, p.r * 0.62, 0, 7); g.strokeStyle = "rgba(122,74,6,.55)"; g.stroke();
      g.restore();
    }
    if (t < ms) requestAnimationFrame(step);
    else g.clearRect(0, 0, w, h);
  };
  requestAnimationFrame(step);
}
