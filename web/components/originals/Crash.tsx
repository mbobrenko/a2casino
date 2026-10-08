"use client";
// Crash (single player, auto cash-out): the server settles the round at once; the flight is an
// animation of that result. Canvas graph: multiplier m(t) = e^(r·t) rising with time, rescaling
// axes, a rocket riding the curve, the cash-out marker and an explosion at the crash point. The
// flight lasts ln(crash) / r, capped (the rate speeds up for big crash points).
// Presentation: a parallax space scene (three star layers that stretch into speed lines as the
// multiplier climbs, a nebula and a drifting planet), a neon rocket with a flickering flame and an
// exhaust trail, a curve whose colour moves mint → gold → pink with the multiplier, a shockwave
// explosion with a stage shake, and a "Cashed out" badge that flies off the rocket.
import "@/app/og-crash.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, money } from "@/lib/api";
import { balanceChanged } from "@/lib/useMe";
import { reducedMotion, useFx } from "./kit/fx";
import { sfx } from "./kit/sound";
import { AutoPanel, BetButton, BetInput, cents, GameShell, NumField, useAuto, useHotkey, useMaxBet, useSession } from "./kit/ui";

type Result = {
  crash_point: number; target: number; cashed_out: boolean; win: number; bet: number;
  nonce: number; client_seed: string; server_seed_hash: string; rtp: number; max_win: number; max_win_applied: boolean;
};

const BASE_RATE = 0.00042; // per ms: 2× after 1.65 s, 10× after 5.5 s
/** kind 0 = spark, 1 = hull debris, 2 = smoke puff, 3 = exhaust. */
type Spark = { x: number; y: number; vx: number; vy: number; life: number; c: string; s: number; kind: number; r: number; vr: number };
type Flight = { r: Result; rate: number; t: number; dur: number; crashedAt: number | null; sparks: Spark[] };
type Star = { x: number; y: number; z: number; tw: number };
/** Scene state shared by the idle loop and the flight loop (never React state: it changes every frame). */
type Scene = {
  stars: Star[]; speed: number; travel: number; last: number; exhaust: Spark[];
  tip: [number, number]; ang: number; flying: boolean;
  bg: HTMLCanvasElement | null; planet: HTMLCanvasElement | null; key: string;
};

export default function Crash({ rtp: initialRtp, maxWin: initialMax }: { rtp: number; maxWin: number }) {
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [amount, setAmount] = useState("1.00");
  const [target, setTarget] = useState("2.00");
  const [phase, setPhase] = useState<"idle" | "flying" | "done">("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [rtp, setRtp] = useState(initialRtp);
  const [maxWin, setMaxWin] = useState(initialMax);
  const session = useSession();
  const fx = useFx();
  const { max } = useMaxBet(maxWin);
  const canvas = useRef<HTMLCanvasElement>(null);
  const multEl = useRef<HTMLDivElement>(null);
  const cashEl = useRef<HTMLDivElement>(null);
  const flashEl = useRef<HTMLDivElement>(null);
  const flight = useRef<Flight | null>(null);
  const raf = useRef(0);
  const idleRaf = useRef(0);
  const size = useRef({ w: 600, h: 380, dpr: 1 });
  const scene = useRef<Scene>({ stars: makeStars(), speed: 0.15, travel: 0, last: 0, exhaust: [], tip: [0, 0], ang: -0.5, flying: false, bg: null, planet: null, key: "" });

  const t = parseFloat(target) || 0;
  const chance = t >= 1.01 ? Math.min(rtp / t, rtp / 1.01) : 0;
  const stake = cents(amount);
  const pays = Math.floor(stake * t);
  const capped = maxWin > 0 && pays > maxWin;

  const draw = useCallback(() => {
    const c = canvas.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    const { w, h, dpr } = size.current;
    const now = performance.now();
    advance(scene.current, flight.current, now);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScene(g, w, h, dpr, flight.current, scene.current, now);
  }, []);

  // Keep the canvas at the stage's size (crisp on HiDPI).
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth, h = c.clientHeight;
      size.current = { w, h, dpr };
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      draw();
    });
    ro.observe(c);
    return () => { ro.disconnect(); cancelAnimationFrame(raf.current); };
  }, [draw]);

  // Ambient loop between rounds: the starfield drifts and the parked rocket idles. Paused while a
  // flight is drawing, when the tab is hidden, and entirely under prefers-reduced-motion.
  useEffect(() => {
    if (reducedMotion()) return;
    const loop = () => {
      if (!scene.current.flying && !document.hidden) draw();
      idleRaf.current = requestAnimationFrame(loop);
    };
    idleRaf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(idleRaf.current);
  }, [draw]);

  /** The "Cashed out @ x" badge leaves the rocket and floats up; the stage flashes green. */
  const showCash = (r: Result) => {
    const el = cashEl.current, fl = flashEl.current;
    const [x, y] = scene.current.tip;
    if (el) {
      el.textContent = `Cashed out @ ${r.target.toFixed(2)}×`;
      el.style.left = x + "px"; el.style.top = y + "px";
      el.classList.remove("go"); void el.offsetWidth; el.classList.add("go");
    }
    if (fl) { fl.classList.remove("go"); void fl.offsetWidth; fl.classList.add("go"); }
  };

  async function play(amountCents: number, fast = false) {
    setError("");
    fx.clear();
    const r = await api<Result>("/api/originals/crash/bet", { amount: amountCents, target: Math.round(t * 100) / 100 });
    sfx.bet();
    setRtp(r.rtp);
    setMaxWin(r.max_win);
    setRefresh((n) => n + 1);
    setResult(r);
    setPhase("flying");
    const cap = fast ? 3200 : 8000;
    const ln = Math.log(r.crash_point);
    const rate = ln / BASE_RATE > cap ? ln / cap : BASE_RATE;
    const dur = reducedMotion() ? 0 : ln / rate;
    const f: Flight = { r, rate, t: 0, dur, crashedAt: null, sparks: [] };
    flight.current = f;
    scene.current.exhaust = [];
    cancelAnimationFrame(raf.current);
    cashEl.current?.classList.remove("go");
    if (multEl.current) { delete multEl.current.dataset.tier; multEl.current.style.setProperty("--ms", "1"); }
    let cashedShown = false;
    return {
      bet: r.bet, win: r.win,
      done: new Promise<void>((resolve) => {
        const t0 = performance.now() + (r.crash_point <= 1 ? 250 : 0);
        scene.current.flying = true;
        const step = (now: number) => {
          const el = Math.max(0, now - t0);
          if (f.crashedAt == null) {
            f.t = Math.min(el, dur);
            const m = Math.min(Math.exp(rate * f.t), r.crash_point);
            if (multEl.current) { multEl.current.textContent = m.toFixed(2) + "×"; paintMult(multEl.current, m); }
            if (r.cashed_out && !cashedShown && m >= r.target) {
              cashedShown = true;
              showCash(r);
              fx.win(r.win / r.bet, r.win, { quiet: r.target < 10 });
            }
            if (el >= dur) {
              f.crashedAt = now;
              f.sparks = explode();
              sfx.boom();
              if (!r.cashed_out) fx.lose();
              setPhase("done");
              session.record({ bet: r.bet, win: r.win, mult: r.crash_point, pick: { client_seed: r.client_seed, nonce: r.nonce, server_seed_hash: r.server_seed_hash, rtp: r.rtp, target: r.target } });
              balanceChanged();
            }
          } else {
            const dt = now - f.crashedAt;
            if (dt > (fast ? 350 : 900)) { draw(); resolve(); if (dt > 1400) { scene.current.flying = false; return; } }
          }
          draw();
          raf.current = requestAnimationFrame(step);
        };
        raf.current = requestAnimationFrame(step);
      }),
    };
  }

  const auto = useAuto({ amount, setAmount, play: (c) => play(c, true), onError: setError, gap: 300 });
  const busy = phase === "flying" || auto.running;
  const manual = () => { if (!busy) play(stake).catch((e) => setError(e.message)); };
  useHotkey(() => (mode === "auto" ? (auto.running ? auto.stop() : auto.start()) : manual()), mode === "auto" || !busy);

  const crashed = phase === "done" && result;
  const nudge = (k: number) => setTarget((v) => Math.min(1000, Math.max(1.01, (parseFloat(v) || 2) * k)).toFixed(2));

  const controls = (
    <>
      <BetInput value={amount} onChange={setAmount} disabled={busy} max={max} />
      <div className="og-field">
        <div className="og-label"><span>Cash out at</span><span className="og-label-r">{chance.toFixed(2)}% chance</span></div>
        <div className={"og-input" + (busy ? " disabled" : "")}>
          <input type="number" inputMode="decimal" min="1.01" max="1000" step="0.01" value={target} disabled={busy} aria-label="Auto cash-out multiplier"
            onChange={(e) => setTarget(e.target.value)} onBlur={() => setTarget(Math.min(1000, Math.max(1.01, parseFloat(target) || 2)).toFixed(2))} />
          <span className="og-suffix">×</span>
          <div className="og-quick">
            <button type="button" disabled={busy} onClick={() => nudge(1 / 1.25)} aria-label="Lower">−</button>
            <button type="button" disabled={busy} onClick={() => nudge(1.25)} aria-label="Higher">+</button>
          </div>
        </div>
      </div>
      <NumField label="Profit on win" value={(((capped ? maxWin : pays) - stake) / 100).toFixed(2)} readOnly suffix="$" right={capped ? "max win" : undefined} />
      {mode === "auto" && <AutoPanel auto={auto} />}
      {mode === "manual"
        ? <BetButton onClick={manual} disabled={busy}>{phase === "flying" ? "Flying…" : "Bet"}</BetButton>
        : auto.running ? <BetButton variant="stop" onClick={auto.stop}>Stop auto-bet</BetButton> : <BetButton onClick={auto.start}>Start auto-bet</BetButton>}
      {capped && <p className="og-note">Stake × cash-out is {money(pays)}, above the maximum win of {money(maxWin)} per bet: a win pays {money(maxWin)}.</p>}
      {error && <p className="og-error" role="alert">{error}</p>}
    </>
  );

  const stage = (
    <div className={"crash-stage" + (crashed ? (result.cashed_out ? " won" : " lost") : "") + (phase === "flying" ? " flying" : "")}>
      <canvas ref={canvas} className="crash-canvas" aria-hidden />
      <div className="crash-vignette" aria-hidden />
      <div ref={flashEl} className="crash-flash g" aria-hidden />
      <div className="crash-flash r" aria-hidden />
      <div className="crash-hud">
        <div ref={multEl} className="crash-mult">{result ? (phase === "done" ? result.crash_point.toFixed(2) : "1.00") : "1.00"}×</div>
        <div className="crash-sub">
          {phase === "idle" && <span className="crash-ready"><i aria-hidden />Set your cash-out and place a bet</span>}
          {phase === "flying" && result && <span className="crash-chip">Auto cash-out <b>{result.target.toFixed(2)}×</b></span>}
          {crashed && <span className="crash-tag">Crashed @ {result.crash_point.toFixed(2)}×</span>}
        </div>
        {crashed && <div className={"crash-res " + (result.cashed_out ? "w" : "l")}>{result.cashed_out ? `Cashed out ${result.target.toFixed(2)}× · +${money(result.win)}${result.max_win_applied ? " (max win)" : ""}` : `Lost ${money(result.bet)}`}</div>}
      </div>
      <div ref={cashEl} className="crash-cash" aria-hidden />
    </div>
  );

  return (
    <GameShell game="crash" mode={mode} onMode={setMode} modeLocked={auto.running} controls={controls} stage={<>{stage}{fx.layer}</>} glow={fx.glow}
      session={session} fair={{ refreshKey: refresh }} rtp={rtp} maxWin={maxWin} fmtPill={(r) => r.mult.toFixed(2) + "×"} />
  );
}

/** Multiplier text: colour tier (mint → gold → pink → hot) and a scale that grows with the value. */
function paintMult(el: HTMLElement, m: number) {
  const tier = m >= 10 ? "3" : m >= 5 ? "2" : m >= 2 ? "1" : "0";
  if (el.dataset.tier !== tier) {
    el.dataset.tier = tier;
    el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
  }
  el.style.setProperty("--ms", (1 + Math.min(0.28, Math.log10(m) * 0.16)).toFixed(3));
}

/* ------------------------------------------------------------------------------- canvas drawing */

function makeStars(): Star[] {
  const layers = [0.25, 0.55, 1];
  return Array.from({ length: 150 }, (_, i) => ({ x: Math.random(), y: Math.random(), z: layers[i % 3] * (0.85 + Math.random() * 0.3), tw: Math.random() * 6.28 }));
}
function explode(): Spark[] {
  const cs = ["#ffd166", "#ff7b39", "#ff3d5a", "#ffffff", "#ff5fb0"];
  const out: Spark[] = [];
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 7;
    out.push({ x: 0, y: 0, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, life: 0.7 + Math.random() * 0.6, c: cs[(Math.random() * cs.length) | 0], s: 1.2 + Math.random() * 2.6, kind: 0, r: 0, vr: 0 });
  }
  const hull = ["#e9e4ff", "#ff4fa3", "#a42cff", "#8f84cf"];
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 4;
    out.push({ x: 0, y: 0, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2.5, life: 1.2 + Math.random() * 0.5, c: hull[i % hull.length], s: 3 + Math.random() * 4, kind: 1, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4 });
  }
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, v = 0.4 + Math.random() * 1.4;
    out.push({ x: 0, y: 0, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.4, life: 1, c: "", s: 8 + Math.random() * 10, kind: 2, r: 0, vr: 0 });
  }
  return out;
}
function niceStep(span: number, n: number) {
  const raw = span / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const k of [1, 2, 2.5, 5, 10]) if (raw <= k * p) return k * p;
  return 10 * p;
}
const flightMult = (f: Flight) => Math.min(Math.exp(f.rate * f.t), f.r.crash_point);

/** Curve colour by multiplier: mint at 1×, gold at 2–3×, pink from 10× up (log-spaced). */
function tierRGB(m: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [[1, [110, 255, 196]], [2.2, [255, 200, 70]], [10, [255, 72, 196]], [100, [190, 110, 255]]];
  const lm = Math.log(Math.max(1, m));
  for (let i = 1; i < stops.length; i++) {
    const [m1, c1] = stops[i - 1], [m2, c2] = stops[i];
    if (m <= m2) {
      const u = (lm - Math.log(m1)) / (Math.log(m2) - Math.log(m1));
      return [0, 1, 2].map((k) => Math.round(c1[k] + (c2[k] - c1[k]) * u)) as [number, number, number];
    }
  }
  return stops[stops.length - 1][1];
}
const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Time step shared by both loops: star parallax, exhaust trail and explosion physics. */
function advance(sc: Scene, f: Flight | null, now: number) {
  const dt = sc.last ? Math.min(50, Math.max(0, now - sc.last)) : 16;
  sc.last = now;
  if (dt === 0) return;
  const k = dt / 16.67;
  const live = !!f && f.crashedAt == null;
  const m = f ? flightMult(f) : 1;
  const want = live ? 0.6 + Math.min(7.5, Math.log(m) * 2.4) : 0.15;
  sc.speed += (want - sc.speed) * Math.min(1, (live ? 0.06 : 0.025) * k);
  sc.travel += dt * sc.speed;
  for (const s of sc.stars) { s.x -= dt * 0.00006 * sc.speed * s.z; if (s.x < 0) { s.x += 1; s.y = Math.random(); } }
  // Exhaust: puffs leave the nozzle backwards along the tangent and stream off with the scenery.
  if (live && f!.t > 0) {
    const n = Math.min(4, Math.round(k * 2));
    const bx = -Math.cos(sc.ang), by = -Math.sin(sc.ang);
    for (let i = 0; i < n; i++) {
      const v = 1.2 + Math.random() * 1.6;
      sc.exhaust.push({ x: sc.tip[0] + bx * 18, y: sc.tip[1] + by * 18, vx: bx * v + (Math.random() - 0.5) * 0.6, vy: by * v + (Math.random() - 0.5) * 0.6,
        life: 1, c: "", s: 2 + Math.random() * 2.5, kind: 3, r: 0, vr: 0 });
    }
  }
  for (const p of sc.exhaust) { p.x += (p.vx - sc.speed * 0.5) * k; p.y += p.vy * k; p.vx *= 0.96; p.vy *= 0.96; p.s += 0.22 * k; p.life -= 0.028 * k; }
  if (sc.exhaust.length) sc.exhaust = sc.exhaust.filter((p) => p.life > 0);
  if (sc.exhaust.length > 160) sc.exhaust.splice(0, sc.exhaust.length - 160);
  if (f && f.crashedAt != null) {
    for (const s of f.sparks) {
      if (s.life <= 0) continue;
      if (s.kind === 2) { s.x += s.vx * k; s.y += s.vy * k; s.vx *= 0.96; s.vy *= 0.96; s.s += 0.35 * k; s.life -= 0.012 * k; continue; }
      s.x += s.vx * k; s.y += s.vy * k; s.vy += 0.12 * k; s.vx *= Math.pow(0.97, k); s.r += s.vr * k; s.life -= (s.kind === 1 ? 0.014 : 0.022) * k;
    }
  }
}

/** Nebula backdrop and planet are drawn once per stage size into offscreen canvases. */
function ensureSprites(sc: Scene, w: number, h: number, dpr: number) {
  const key = `${w}x${h}@${dpr}`;
  if (sc.key === key && sc.bg) return;
  sc.key = key;
  const bg = document.createElement("canvas");
  bg.width = Math.max(1, Math.round(w * dpr)); bg.height = Math.max(1, Math.round(h * dpr));
  const b = bg.getContext("2d")!;
  b.scale(dpr, dpr);
  const sky = b.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#0d0a24"); sky.addColorStop(0.6, "#120c2c"); sky.addColorStop(1, "#1a0f33");
  b.fillStyle = sky; b.fillRect(0, 0, w, h);
  const blob = (x: number, y: number, r: number, c: string) => {
    const gr = b.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, c); gr.addColorStop(1, "rgba(0,0,0,0)");
    b.fillStyle = gr; b.fillRect(0, 0, w, h);
  };
  blob(w * 0.18, h * 0.85, Math.max(w, h) * 0.6, "rgba(124,92,255,.26)");
  blob(w * 0.82, h * 0.12, Math.max(w, h) * 0.45, "rgba(255,80,170,.14)");
  blob(w * 0.55, h * 0.5, Math.max(w, h) * 0.32, "rgba(60,200,255,.07)");
  blob(w * 0.35, h * 0.2, Math.max(w, h) * 0.22, "rgba(170,120,255,.08)");
  // Faint dust band across the sky.
  b.save(); b.translate(w / 2, h / 2); b.rotate(-0.35);
  const band = b.createLinearGradient(0, -h * 0.18, 0, h * 0.18);
  band.addColorStop(0, "rgba(200,180,255,0)"); band.addColorStop(0.5, "rgba(200,180,255,.05)"); band.addColorStop(1, "rgba(200,180,255,0)");
  b.fillStyle = band; b.fillRect(-w, -h * 0.18, w * 2, h * 0.36);
  b.restore();
  sc.bg = bg;

  const R = Math.max(26, Math.min(w, h) * 0.13);
  const pad = R * 0.9, S = (R + pad) * 2;
  const pc = document.createElement("canvas");
  pc.width = Math.round(S * dpr); pc.height = Math.round(S * dpr);
  const p = pc.getContext("2d")!;
  p.scale(dpr, dpr); p.translate(S / 2, S / 2);
  const atm = p.createRadialGradient(0, 0, R * 0.9, 0, 0, R * 1.6);
  atm.addColorStop(0, "rgba(160,120,255,.35)"); atm.addColorStop(1, "rgba(160,120,255,0)");
  p.fillStyle = atm; p.beginPath(); p.arc(0, 0, R * 1.6, 0, 7); p.fill();
  const ring = (front: boolean) => {
    p.save(); p.rotate(-0.38); p.scale(1, 0.26);
    p.beginPath();
    if (front) p.arc(0, 0, R * 1.62, 0, Math.PI); else p.arc(0, 0, R * 1.62, Math.PI, Math.PI * 2);
    p.lineWidth = R * 0.34; p.strokeStyle = "rgba(255,170,220,.28)"; p.stroke();
    p.lineWidth = R * 0.08; p.strokeStyle = "rgba(255,220,240,.45)"; p.stroke();
    p.restore();
  };
  ring(false);
  const body = p.createRadialGradient(-R * 0.4, -R * 0.45, R * 0.1, 0, 0, R);
  body.addColorStop(0, "#d9c2ff"); body.addColorStop(0.45, "#7b4fe0"); body.addColorStop(1, "#22104a");
  p.fillStyle = body; p.beginPath(); p.arc(0, 0, R, 0, 7); p.fill();
  p.save(); p.beginPath(); p.arc(0, 0, R, 0, 7); p.clip();
  p.globalAlpha = 0.18; p.fillStyle = "#ffffff";
  for (const [yy, hh] of [[-0.35, 0.1], [-0.05, 0.16], [0.32, 0.08]]) { p.save(); p.rotate(-0.38); p.fillRect(-R, R * yy, R * 2, R * hh); p.restore(); }
  p.globalAlpha = 1;
  const shade = p.createLinearGradient(-R, -R, R, R);
  shade.addColorStop(0.45, "rgba(8,4,24,0)"); shade.addColorStop(1, "rgba(8,4,24,.75)");
  p.fillStyle = shade; p.fillRect(-R, -R, R * 2, R * 2);
  p.restore();
  ring(true);
  sc.planet = pc;
}

function drawScene(g: CanvasRenderingContext2D, w: number, h: number, dpr: number, f: Flight | null, sc: Scene, now: number) {
  g.clearRect(0, 0, w, h);
  if (w < 2 || h < 2) return;
  ensureSprites(sc, w, h, dpr);
  g.drawImage(sc.bg!, 0, 0, w, h);
  const L = 48, B = 30, T = 18, R = 18;
  const pw = w - L - R, ph = h - B - T;

  // Planet: drifts right to left at a crawl (far away), wraps around.
  const pc = sc.planet!, ps = pc.width / dpr;
  const span = w + ps * 2;
  const px = ((((w * 0.8 + ps) - sc.travel * 0.006) % span) + span) % span - ps;
  g.drawImage(pc, px - ps / 2, h * 0.3 - ps / 2, ps, ps);

  // Stars: three parallax layers; they stretch into speed lines as the rocket accelerates.
  const streak = Math.max(0, sc.speed - 1.4);
  g.lineCap = "round";
  for (const s of sc.stars) {
    const x = s.x * w, y = s.y * h;
    const a = (0.25 + s.z * 0.55) * (0.75 + 0.25 * Math.sin(now / 600 + s.tw));
    const len = streak * s.z * 16;
    if (len > 1.5) {
      g.strokeStyle = s.z > 0.8 ? `rgba(255,236,250,${a})` : `rgba(200,206,255,${a})`;
      g.lineWidth = s.z * 1.6;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y); g.stroke();
    } else {
      g.fillStyle = `rgba(214,218,255,${a})`;
      g.fillRect(x, y, s.z * 1.9, s.z * 1.9);
    }
  }

  const tNow = f ? f.t : 0;
  const rate = f ? f.rate : BASE_RATE;
  const m = f ? flightMult(f) : 1;
  const xMax = Math.max(4000 * (BASE_RATE / rate), tNow * 1.2);
  const yMax = Math.max(1.8, 1 + (m - 1) * 1.3);
  const X = (t: number) => L + (t / xMax) * pw;
  const Y = (v: number) => T + ph - ((v - 1) / (yMax - 1)) * ph;

  // Grid and axis labels (they rescale as the curve grows).
  g.font = "600 11px system-ui, sans-serif";
  g.textBaseline = "middle";
  const ys = niceStep(yMax - 1, 4);
  for (let v = 1; v <= yMax + 1e-9; v += ys) {
    const y = Y(v);
    g.strokeStyle = "rgba(190,180,255,.07)"; g.lineWidth = 1;
    g.setLineDash([2, 6]);
    g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke();
    g.setLineDash([]);
    g.fillStyle = "rgba(220,215,255,.55)"; g.textAlign = "right";
    g.fillText((Math.round(v * 100) / 100).toFixed(v < 10 ? 1 : 0) + "×", L - 8, y);
  }
  const secs = xMax / (1000 * (BASE_RATE / rate));
  const xs = niceStep(secs, 5);
  g.textAlign = "center";
  for (let s = 0; s <= secs + 1e-9; s += xs) {
    const x = L + (s / secs) * pw;
    g.fillStyle = "rgba(220,215,255,.45)";
    g.fillText(s.toFixed(xs < 1 ? 1 : 0) + "s", x, h - B / 2 + 2);
    g.fillStyle = "rgba(220,215,255,.25)"; g.fillRect(x - 0.5, T + ph, 1, 4);
  }
  const axis = g.createLinearGradient(L, 0, w - R, 0);
  axis.addColorStop(0, "rgba(200,190,255,.35)"); axis.addColorStop(1, "rgba(200,190,255,.06)");
  g.strokeStyle = axis; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(L, T); g.lineTo(L, T + ph); g.lineTo(w - R, T + ph); g.stroke();

  const scale = Math.max(0.75, Math.min(1.15, w / 680));
  if (!f) {
    // Parked on the pad, idling.
    const ox = X(0) + 16 * scale, oy = Y(1) - 6 * scale;
    const pad = g.createRadialGradient(ox, Y(1), 0, ox, Y(1), 46 * scale);
    pad.addColorStop(0, "rgba(255,150,220,.35)"); pad.addColorStop(1, "rgba(255,150,220,0)");
    g.fillStyle = pad; g.beginPath(); g.ellipse(ox, Y(1), 46 * scale, 12 * scale, 0, 0, 7); g.fill();
    sc.tip = [ox, oy]; sc.ang = -0.55;
    drawRocket(g, ox, oy, -0.55 + Math.sin(now / 500) * 0.02, now, scale, 0.25);
    return;
  }

  const crashed = f.crashedAt != null;
  const won = f.r.cashed_out;
  const red = crashed && !won;
  const tint: [number, number, number] = red ? [255, 61, 90] : tierRGB(m);
  // The auto cash-out level.
  if (f.r.target <= yMax) {
    const ty = Y(f.r.target);
    const passed = won && m >= f.r.target;
    g.save();
    g.setLineDash([6, 6]); g.lineWidth = 1.2;
    g.strokeStyle = passed ? "rgba(34,230,130,.6)" : "rgba(255,255,255,.25)";
    g.beginPath(); g.moveTo(L, ty); g.lineTo(w - R, ty); g.stroke(); g.setLineDash([]);
    g.font = "700 11px system-ui, sans-serif"; g.textAlign = "right"; g.textBaseline = "middle";
    const label = (passed ? "✓ " : "") + "Cash out " + f.r.target.toFixed(2) + "×";
    const tw = g.measureText(label).width + 14;
    g.fillStyle = passed ? "rgba(18,80,48,.9)" : "rgba(30,24,60,.85)";
    roundRect(g, w - R - tw, ty - 21, tw, 18, 9); g.fill();
    g.fillStyle = passed ? "#5dffa8" : "rgba(230,225,255,.75)";
    g.fillText(label, w - R - 7, ty - 12);
    g.restore();
  }
  // Curve with a tinted gradient fill and a layered glow.
  const N = 90;
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) { const t = (tNow * i) / N; pts.push([X(t), Y(Math.min(Math.exp(rate * t), f.r.crash_point))]); }
  const [hx, hy] = pts[N];
  const fill = g.createLinearGradient(0, hy, 0, T + ph);
  fill.addColorStop(0, rgba(tint, 0.42)); fill.addColorStop(0.6, rgba(tint, 0.12)); fill.addColorStop(1, "rgba(124,92,255,0.02)");
  g.beginPath(); g.moveTo(X(0), Y(1));
  for (const [x, y] of pts) g.lineTo(x, y);
  g.lineTo(hx, Y(1)); g.closePath(); g.fillStyle = fill; g.fill();
  // Fill hatch: thin vertical lines that scroll, a "data" feel without shadows.
  g.save(); g.clip();
  g.strokeStyle = rgba(tint, 0.08); g.lineWidth = 1;
  const off = (sc.travel * 0.04) % 14;
  g.beginPath();
  for (let x = L - off; x < hx; x += 14) { g.moveTo(x, T); g.lineTo(x, T + ph); }
  g.stroke(); g.restore();
  const path = () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); };
  const stroke = g.createLinearGradient(L, 0, hx || L + 1, 0);
  if (red) { stroke.addColorStop(0, "#ff7b9c"); stroke.addColorStop(1, "#ff3d5a"); }
  else { stroke.addColorStop(0, rgba(tierRGB(1), 1)); stroke.addColorStop(1, rgba(tint, 1)); }
  g.save();
  g.lineJoin = "round"; g.lineCap = "round";
  g.globalCompositeOperation = "lighter";
  path(); g.strokeStyle = rgba(tint, 0.12); g.lineWidth = 16; g.stroke();
  path(); g.strokeStyle = rgba(tint, 0.25); g.lineWidth = 8; g.stroke();
  g.globalCompositeOperation = "source-over";
  path(); g.strokeStyle = stroke; g.lineWidth = 4; g.stroke();
  path(); g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = 1.2; g.stroke();
  g.restore();

  // Cash-out marker and "+$X" bubble.
  if (won && m >= f.r.target) {
    const tc = Math.log(f.r.target) / rate;
    const cx = X(tc), cy = Y(f.r.target);
    g.save();
    g.strokeStyle = "rgba(34,230,130,.5)"; g.setLineDash([4, 4]); g.lineWidth = 1;
    g.beginPath(); g.moveTo(L, cy); g.lineTo(cx, cy); g.stroke(); g.setLineDash([]);
    const pulse = 0.5 + 0.5 * Math.sin(now / 180);
    g.fillStyle = `rgba(34,230,130,${0.18 + 0.15 * pulse})`; g.beginPath(); g.arc(cx, cy, 11 + pulse * 3, 0, 7); g.fill();
    g.fillStyle = "#22e682"; g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.fill();
    g.fillStyle = "#eafff3"; g.beginPath(); g.arc(cx, cy, 2.4, 0, 7); g.fill();
    const label = "+" + money(f.r.win);
    g.font = "800 13px system-ui, sans-serif";
    const tw = g.measureText(label).width + 18;
    const bx = Math.min(Math.max(cx - tw / 2, L + 2), w - R - tw), by = cy - 38;
    const bg = g.createLinearGradient(0, by, 0, by + 24);
    bg.addColorStop(0, "#3dff9c"); bg.addColorStop(1, "#10b85e");
    g.fillStyle = bg; roundRect(g, bx, by, tw, 24, 12); g.fill();
    g.beginPath(); g.moveTo(cx - 5, by + 23); g.lineTo(cx + 5, by + 23); g.lineTo(cx, by + 30); g.fill();
    g.fillStyle = "#032914"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(label, bx + tw / 2, by + 12.5);
    g.restore();
  }

  // Exhaust trail (additive): hot near the nozzle, cooling to violet smoke.
  if (sc.exhaust.length) {
    g.save(); g.globalCompositeOperation = "lighter";
    for (const p of sc.exhaust) {
      const l = p.life;
      g.fillStyle = l > 0.7 ? `rgba(255,220,140,${0.5 * l})` : l > 0.4 ? `rgba(255,110,150,${0.42 * l})` : `rgba(140,100,255,${0.5 * l})`;
      g.beginPath(); g.arc(p.x, p.y, p.s * scale, 0, 7); g.fill();
    }
    g.restore();
  }

  if (!crashed) {
    // Rocket riding the tip, pointing along the curve's tangent.
    const t2 = Math.max(0, tNow - 40);
    const [px2, py2] = [X(t2), Y(Math.min(Math.exp(rate * t2), f.r.crash_point))];
    let ang = Math.atan2(hy - py2, hx - px2);
    if (!isFinite(ang) || (hx === px2 && hy === py2)) ang = -0.25;
    sc.tip = [hx, hy]; sc.ang = ang;
    // Halo around the tip in the tier colour.
    const halo = g.createRadialGradient(hx, hy, 0, hx, hy, 60 * scale);
    halo.addColorStop(0, rgba(tint, 0.28)); halo.addColorStop(1, rgba(tint, 0));
    g.fillStyle = halo; g.beginPath(); g.arc(hx, hy, 60 * scale, 0, 7); g.fill();
    drawRocket(g, hx, hy, ang + Math.sin(now / 90) * 0.025, now, scale, Math.min(1, 0.45 + sc.speed / 6));
  } else {
    const dt = now - f.crashedAt!;
    // Crash point mark (stays), flash, shockwave rings, debris, sparks, smoke.
    for (const s of f.sparks) {
      if (s.kind !== 2 || s.life <= 0) continue;
      g.fillStyle = `rgba(60,30,80,${0.35 * s.life})`;
      g.beginPath(); g.arc(hx + s.x, hy + s.y, s.s, 0, 7); g.fill();
    }
    g.save();
    g.fillStyle = "#ff3d5a";
    g.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? 5 : 12; g.lineTo(hx + Math.cos(a) * rr, hy + Math.sin(a) * rr); }
    g.closePath(); g.fill();
    g.fillStyle = "#ffe0e6"; g.beginPath(); g.arc(hx, hy, 3.5, 0, 7); g.fill();
    g.restore();
    const k = Math.min(1, dt / 500);
    g.save();
    g.globalCompositeOperation = "lighter";
    if (k < 1) {
      g.globalAlpha = 1 - k;
      const rg = g.createRadialGradient(hx, hy, 0, hx, hy, 24 + k * 90);
      rg.addColorStop(0, "rgba(255,255,230,1)"); rg.addColorStop(0.3, "rgba(255,170,60,.9)"); rg.addColorStop(1, "rgba(255,40,80,0)");
      g.fillStyle = rg; g.beginPath(); g.arc(hx, hy, 24 + k * 90, 0, 7); g.fill();
    }
    for (const [delay, dur, maxR, col] of [[0, 650, 150, "255,200,120"], [90, 800, 210, "255,80,150"]] as const) {
      const u = (dt - delay) / dur;
      if (u <= 0 || u >= 1) continue;
      const e = 1 - Math.pow(1 - u, 3);
      g.globalAlpha = 1 - u;
      g.strokeStyle = `rgba(${col},.9)`; g.lineWidth = 2 + 8 * (1 - u);
      g.beginPath(); g.arc(hx, hy, 10 + e * maxR * scale, 0, 7); g.stroke();
    }
    g.globalAlpha = 1;
    for (const s of f.sparks) {
      if (s.kind !== 0 || s.life <= 0) continue;
      g.globalAlpha = Math.max(0, Math.min(1, s.life));
      g.strokeStyle = s.c; g.lineWidth = s.s; g.lineCap = "round";
      g.beginPath(); g.moveTo(hx + s.x, hy + s.y); g.lineTo(hx + s.x - s.vx * 2.2, hy + s.y - s.vy * 2.2); g.stroke();
    }
    g.restore();
    for (const s of f.sparks) {
      if (s.kind !== 1 || s.life <= 0) continue;
      g.save();
      g.globalAlpha = Math.max(0, Math.min(1, s.life));
      g.translate(hx + s.x, hy + s.y); g.rotate(s.r);
      g.fillStyle = s.c;
      g.beginPath(); g.moveTo(-s.s, -s.s * 0.5); g.lineTo(s.s, -s.s * 0.2); g.lineTo(s.s * 0.2, s.s * 0.7); g.closePath(); g.fill();
      g.restore();
    }
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/* The rocket (pointing +x, nose at x = 24) as SVG path data, built lazily (Path2D is browser-only). */
let ROCKET: { body: Path2D; finT: Path2D; finB: Path2D; finM: Path2D; nozzle: Path2D } | null = null;
function rocketPaths() {
  if (!ROCKET) ROCKET = {
    body: new Path2D("M24 0 C19 -8.5 7 -10.5 -9 -9.2 L-13 -6.8 L-13 6.8 L-9 9.2 C7 10.5 19 8.5 24 0 Z"),
    finT: new Path2D("M-2 -8.8 L-11 -19 Q-14.5 -21 -16.5 -17.5 L-14.5 -6.5 Z"),
    finB: new Path2D("M-2 8.8 L-11 19 Q-14.5 21 -16.5 17.5 L-14.5 6.5 Z"),
    finM: new Path2D("M-4 -1.6 L-17 -1.1 L-17 1.1 L-4 1.6 Z"),
    nozzle: new Path2D("M-13 -5.2 L-18 -7 L-18 7 L-13 5.2 Z"),
  };
  return ROCKET;
}

function drawRocket(g: CanvasRenderingContext2D, x: number, y: number, ang: number, now: number, scale: number, thrust: number) {
  const P = rocketPaths();
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.scale(scale, scale);
  g.translate(-6, 0);
  // Flame: three additive teardrops that flicker, plus a hot halo at the nozzle.
  g.save();
  g.globalCompositeOperation = "lighter";
  const fl = (14 + 26 * thrust) * (0.82 + 0.18 * Math.sin(now / 33) + Math.random() * 0.16);
  const drop = (len: number, wd: number, c0: string, c1: string) => {
    const gr = g.createLinearGradient(-18, 0, -18 - len, 0);
    gr.addColorStop(0, c0); gr.addColorStop(1, c1);
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(-18, -wd); g.quadraticCurveTo(-18 - len * 0.45, -wd * 1.25, -18 - len, 0); g.quadraticCurveTo(-18 - len * 0.45, wd * 1.25, -18, wd); g.closePath(); g.fill();
  };
  drop(fl, 7.5, "rgba(255,90,170,.85)", "rgba(140,60,255,0)");
  drop(fl * 0.72, 5.2, "rgba(255,190,80,1)", "rgba(255,90,60,0)");
  drop(fl * 0.4, 3, "rgba(255,255,240,1)", "rgba(255,240,200,0)");
  const halo = g.createRadialGradient(-19, 0, 0, -19, 0, 20);
  halo.addColorStop(0, "rgba(255,190,120,.55)"); halo.addColorStop(1, "rgba(255,120,120,0)");
  g.fillStyle = halo; g.beginPath(); g.arc(-19, 0, 20, 0, 7); g.fill();
  g.restore();
  // Fins and nozzle.
  const pink = g.createLinearGradient(0, -20, 0, 20);
  pink.addColorStop(0, "#ff6fb8"); pink.addColorStop(0.5, "#d43a9a"); pink.addColorStop(1, "#7b2bd6");
  g.fillStyle = pink;
  g.fill(P.finT); g.fill(P.finB);
  g.fillStyle = "#3a3166"; g.fill(P.nozzle);
  g.strokeStyle = "rgba(160,150,220,.9)"; g.lineWidth = 1; g.stroke(P.nozzle);
  // Hull with a neon outline (one shadow pass).
  const hull = g.createLinearGradient(0, -10, 0, 10);
  hull.addColorStop(0, "#ffffff"); hull.addColorStop(0.45, "#e7e2ff"); hull.addColorStop(0.8, "#9d92d8"); hull.addColorStop(1, "#5b4fa0");
  g.save();
  g.shadowColor = "rgba(120,230,255,.9)"; g.shadowBlur = 12;
  g.fillStyle = hull; g.fill(P.body);
  g.restore();
  g.save();
  g.clip(P.body);
  const nose = g.createLinearGradient(0, -10, 0, 10);
  nose.addColorStop(0, "#ff7cc2"); nose.addColorStop(1, "#b0237d");
  g.fillStyle = nose; g.fillRect(13, -12, 14, 24);
  g.fillStyle = "#ff4fa3"; g.fillRect(-6, -12, 3, 24);
  g.fillStyle = "rgba(255,255,255,.55)"; g.fillRect(-12, -8.4, 30, 2.2);
  g.restore();
  g.strokeStyle = "rgba(140,240,255,.95)"; g.lineWidth = 1.1; g.stroke(P.body);
  g.fillStyle = "#ff4fa3"; g.fill(P.finM);
  // Porthole.
  const win = g.createRadialGradient(4, -1.5, 0.5, 5, 0, 5);
  win.addColorStop(0, "#e6fdff"); win.addColorStop(0.4, "#3fd2ff"); win.addColorStop(1, "#0b3a70");
  g.fillStyle = win; g.beginPath(); g.arc(5, 0, 4.4, 0, 7); g.fill();
  g.strokeStyle = "#2a2350"; g.lineWidth = 1.8; g.stroke();
  g.fillStyle = "rgba(255,255,255,.9)"; g.beginPath(); g.arc(3.6, -1.6, 1.2, 0, 7); g.fill();
  g.restore();
}
