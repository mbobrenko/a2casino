"use client";
// Win feedback shared by the A2 Labs: a multiplier pop over the stage, a confetti burst for big
// wins (≥ 10×) and a short glow; losses get a subtle dim. Respects prefers-reduced-motion.
import { useCallback, useEffect, useRef, useState } from "react";
import { money } from "@/lib/api";
import { sfx } from "./sound";

export const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

type Pop = { id: number; mult: number; win: number; big: boolean };

export function useFx() {
  const [pop, setPop] = useState<Pop | null>(null);
  const [glow, setGlow] = useState<"" | "win" | "big" | "lose">("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const timers = useRef<number[]>([]);
  const seq = useRef(0);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };

  const win = useCallback((mult: number, winCents: number, opts: { quiet?: boolean } = {}) => {
    const big = mult >= 10;
    const id = ++seq.current;
    if (!opts.quiet) setPop({ id, mult, win: winCents, big });
    setGlow(big ? "big" : "win");
    sfx.win(big);
    if (big && !reducedMotion() && canvas.current) confetti(canvas.current);
    later(() => setPop((p) => (p?.id === id ? null : p)), big ? 2200 : 1400);
    later(() => setGlow(""), big ? 1600 : 900);
  }, []);

  const lose = useCallback(() => {
    setPop(null);
    setGlow("lose");
    sfx.lose();
    later(() => setGlow(""), 500);
  }, []);

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
    </div>
  );
  return { layer, glow, win, lose, clear };
}

export const fmtMult = (m: number) => (m >= 1000 ? m.toLocaleString("en-US", { maximumFractionDigits: 0 }) : m.toFixed(2));

/** Confetti and sparks burst on a canvas covering the stage (~2 s, requestAnimationFrame). */
function confetti(c: HTMLCanvasElement) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = c.clientWidth, h = c.clientHeight;
  c.width = w * dpr; c.height = h * dpr;
  const g = c.getContext("2d");
  if (!g) return;
  g.scale(dpr, dpr);
  const colors = ["#ffd166", "#06d6a0", "#7c5cff", "#ef476f", "#4cc9f0", "#ffffff"];
  const parts = Array.from({ length: 140 }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const v = 6 + Math.random() * 9;
    return { x: w / 2, y: h * 0.55, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
      s: 4 + Math.random() * 6, c: colors[(Math.random() * colors.length) | 0], spark: Math.random() < 0.25 };
  });
  const start = performance.now();
  const step = (now: number) => {
    const t = now - start;
    g.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.vy += 0.28; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.globalAlpha = Math.max(0, 1 - t / 2200);
      g.fillStyle = p.c;
      if (p.spark) { g.beginPath(); g.arc(p.x, p.y, p.s / 3, 0, 7); g.fill(); continue; }
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore();
    }
    if (t < 2200) requestAnimationFrame(step);
    else g.clearRect(0, 0, w, h);
  };
  requestAnimationFrame(step);
}
