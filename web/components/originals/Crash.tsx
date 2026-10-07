"use client";
// Crash (single player, auto cash-out): the server settles the round at once; the flight is an
// animation of that result. Canvas graph: multiplier m(t) = e^(r·t) rising with time, rescaling
// axes, a rocket riding the curve, the cash-out marker and an explosion at the crash point. The
// flight lasts ln(crash) / r, capped (the rate speeds up for big crash points).
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
type Spark = { x: number; y: number; vx: number; vy: number; life: number; c: string; s: number };
type Flight = { r: Result; rate: number; t: number; dur: number; crashedAt: number | null; sparks: Spark[]; stars: { x: number; y: number; z: number }[] };

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
  const flight = useRef<Flight | null>(null);
  const raf = useRef(0);
  const size = useRef({ w: 600, h: 380, dpr: 1 });

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
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScene(g, w, h, flight.current);
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
    const f: Flight = { r, rate, t: 0, dur, crashedAt: null, sparks: [], stars: flight.current?.stars ?? makeStars() };
    flight.current = f;
    cancelAnimationFrame(raf.current);
    let cashedShown = false;
    return {
      bet: r.bet, win: r.win,
      done: new Promise<void>((resolve) => {
        const t0 = performance.now() + (r.crash_point <= 1 ? 250 : 0);
        let last = t0;
        const step = (now: number) => {
          const el = Math.max(0, now - t0);
          for (const s of f.stars) { s.x -= (now - last) * 0.02 * s.z; if (s.x < 0) s.x += 1; }
          last = now;
          if (f.crashedAt == null) {
            f.t = Math.min(el, dur);
            const m = Math.min(Math.exp(rate * f.t), r.crash_point);
            if (multEl.current) multEl.current.textContent = m.toFixed(2) + "×";
            if (r.cashed_out && !cashedShown && m >= r.target) {
              cashedShown = true;
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
            for (const s of f.sparks) { s.x += s.vx; s.y += s.vy; s.vy += 0.12; s.vx *= 0.97; s.life -= 0.022; }
            if (dt > (fast ? 350 : 900)) { draw(); resolve(); if (dt > 1400) return; }
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
      <div className="crash-hud">
        <div ref={multEl} className="crash-mult">{result ? (phase === "done" ? result.crash_point.toFixed(2) : "1.00") : "1.00"}×</div>
        <div className={"crash-sub" + (phase === "flying" ? " hidden" : "")}>
          {phase === "idle" && "Set your cash-out and place a bet"}
          {crashed && <span className="crash-tag">Crashed @ {result.crash_point.toFixed(2)}×</span>}
        </div>
        {crashed && <div className={"crash-res " + (result.cashed_out ? "w" : "l")}>{result.cashed_out ? `Cashed out ${result.target.toFixed(2)}× · +${money(result.win)}${result.max_win_applied ? " (max win)" : ""}` : `Lost ${money(result.bet)}`}</div>}
      </div>
    </div>
  );

  return (
    <GameShell game="crash" mode={mode} onMode={setMode} modeLocked={auto.running} controls={controls} stage={<>{stage}{fx.layer}</>} glow={fx.glow}
      session={session} fair={{ refreshKey: refresh }} rtp={rtp} maxWin={maxWin} fmtPill={(r) => r.mult.toFixed(2) + "×"} />
  );
}

/* ------------------------------------------------------------------------------- canvas drawing */

function makeStars() {
  return Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8 }));
}
function explode(): Spark[] {
  const cs = ["#ffd166", "#ff7b39", "#ff3d5a", "#ffffff"];
  return Array.from({ length: 70 }, () => {
    const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 6;
    return { x: 0, y: 0, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, life: 0.7 + Math.random() * 0.5, c: cs[(Math.random() * cs.length) | 0], s: 1.5 + Math.random() * 3 };
  });
}
function niceStep(span: number, n: number) {
  const raw = span / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const k of [1, 2, 2.5, 5, 10]) if (raw <= k * p) return k * p;
  return 10 * p;
}

function drawScene(g: CanvasRenderingContext2D, w: number, h: number, f: Flight | null) {
  g.clearRect(0, 0, w, h);
  const L = 48, B = 30, T = 18, R = 18;
  const pw = w - L - R, ph = h - B - T;
  // Background stars.
  for (const s of f?.stars ?? STATIC_STARS) {
    g.globalAlpha = 0.15 + s.z * 0.45;
    g.fillStyle = "#cfd6ff";
    g.fillRect(L + s.x * pw, T + s.y * ph, s.z * 1.8, s.z * 1.8);
  }
  g.globalAlpha = 1;

  const tNow = f ? f.t : 0;
  const rate = f ? f.rate : BASE_RATE;
  const m = f ? Math.min(Math.exp(rate * tNow), f.r.crash_point) : 1;
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
    g.strokeStyle = "rgba(255,255,255,.06)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke();
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
  }
  g.strokeStyle = "rgba(255,255,255,.18)"; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(L, T); g.lineTo(L, T + ph); g.lineTo(w - R, T + ph); g.stroke();
  if (!f) return;

  const crashed = f.crashedAt != null;
  const won = f.r.cashed_out;
  // The auto cash-out level.
  if (f.r.target <= yMax) {
    const ty = Y(f.r.target);
    const passed = won && m >= f.r.target;
    g.save();
    g.setLineDash([6, 6]); g.lineWidth = 1.2;
    g.strokeStyle = passed ? "rgba(34,230,130,.55)" : "rgba(255,255,255,.22)";
    g.beginPath(); g.moveTo(L, ty); g.lineTo(w - R, ty); g.stroke(); g.setLineDash([]);
    g.font = "700 11px system-ui, sans-serif"; g.textAlign = "right"; g.textBaseline = "bottom";
    g.fillStyle = passed ? "#5dffa8" : "rgba(230,225,255,.6)";
    g.fillText("Cash out " + f.r.target.toFixed(2) + "×", w - R - 4, ty - 4);
    g.restore();
  }
  // Curve with gradient fill.
  const N = 90;
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) { const t = (tNow * i) / N; pts.push([X(t), Y(Math.min(Math.exp(rate * t), f.r.crash_point))]); }
  const fill = g.createLinearGradient(0, T, 0, T + ph);
  fill.addColorStop(0, crashed && !won ? "rgba(255,61,90,.38)" : "rgba(255,170,60,.42)");
  fill.addColorStop(1, "rgba(124,92,255,0.02)");
  g.beginPath(); g.moveTo(X(0), Y(1));
  for (const [x, y] of pts) g.lineTo(x, y);
  g.lineTo(pts[N][0], Y(1)); g.closePath(); g.fillStyle = fill; g.fill();
  const stroke = g.createLinearGradient(L, 0, pts[N][0] || L + 1, 0);
  if (crashed && !won) { stroke.addColorStop(0, "#ff7b9c"); stroke.addColorStop(1, "#ff3d5a"); }
  else { stroke.addColorStop(0, "#ffb547"); stroke.addColorStop(1, "#ffe27a"); }
  g.save();
  g.shadowColor = crashed && !won ? "rgba(255,61,90,.8)" : "rgba(255,190,80,.9)"; g.shadowBlur = 14;
  g.strokeStyle = stroke; g.lineWidth = 4; g.lineJoin = "round"; g.lineCap = "round";
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  g.restore();

  // Cash-out marker and "+$X" bubble.
  if (won && m >= f.r.target) {
    const tc = Math.log(f.r.target) / rate;
    const cx = X(tc), cy = Y(f.r.target);
    g.save();
    g.strokeStyle = "rgba(34,230,130,.5)"; g.setLineDash([4, 4]); g.lineWidth = 1;
    g.beginPath(); g.moveTo(L, cy); g.lineTo(cx, cy); g.stroke(); g.setLineDash([]);
    g.fillStyle = "#22e682"; g.shadowColor = "#22e682"; g.shadowBlur = 14;
    g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.fill();
    g.shadowBlur = 0;
    const label = "+" + money(f.r.win);
    g.font = "800 13px system-ui, sans-serif";
    const tw = g.measureText(label).width + 18;
    const bx = Math.min(Math.max(cx - tw / 2, L + 2), w - R - tw), by = cy - 36;
    g.fillStyle = "#13c66f"; roundRect(g, bx, by, tw, 24, 12); g.fill();
    g.beginPath(); g.moveTo(cx - 5, by + 24); g.lineTo(cx + 5, by + 24); g.lineTo(cx, by + 30); g.fill();
    g.fillStyle = "#032914"; g.textAlign = "center"; g.fillText(label, bx + tw / 2, by + 12.5);
    g.restore();
  }

  const [hx, hy] = pts[N];
  if (!crashed) {
    // Rocket riding the tip, pointing along the curve's tangent.
    const t2 = Math.max(0, tNow - 40);
    const [px, py] = [X(t2), Y(Math.min(Math.exp(rate * t2), f.r.crash_point))];
    let ang = Math.atan2(hy - py, hx - px);
    if (!isFinite(ang) || (hx === px && hy === py)) ang = -0.25;
    drawRocket(g, hx, hy, ang, performance.now());
  } else {
    const dt = performance.now() - f.crashedAt!;
    // Crash point mark (stays), flash ring and sparks.
    g.save();
    g.shadowColor = "rgba(255,61,90,.9)"; g.shadowBlur = 18;
    g.fillStyle = "#ff3d5a";
    g.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? 5 : 12; g.lineTo(hx + Math.cos(a) * rr, hy + Math.sin(a) * rr); }
    g.closePath(); g.fill();
    g.fillStyle = "#ffe0e6"; g.beginPath(); g.arc(hx, hy, 3.5, 0, 7); g.fill();
    g.restore();
    const k = Math.min(1, dt / 500);
    g.save();
    g.globalAlpha = 1 - k;
    const rg = g.createRadialGradient(hx, hy, 0, hx, hy, 20 + k * 70);
    rg.addColorStop(0, "rgba(255,255,220,1)"); rg.addColorStop(0.35, "rgba(255,160,60,.9)"); rg.addColorStop(1, "rgba(255,40,80,0)");
    g.fillStyle = rg; g.beginPath(); g.arc(hx, hy, 20 + k * 70, 0, 7); g.fill();
    g.restore();
    for (const s of f.sparks) {
      if (s.life <= 0) continue;
      g.globalAlpha = Math.max(0, s.life);
      g.fillStyle = s.c;
      g.beginPath(); g.arc(hx + s.x, hy + s.y, s.s, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  }
}
const STATIC_STARS = makeStars();

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function drawRocket(g: CanvasRenderingContext2D, x: number, y: number, ang: number, now: number) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  // Flame (flickers).
  const fl = 18 + Math.sin(now / 40) * 4 + Math.random() * 6;
  const fg = g.createLinearGradient(-8, 0, -8 - fl, 0);
  fg.addColorStop(0, "rgba(255,255,210,1)"); fg.addColorStop(0.35, "rgba(255,170,50,.95)"); fg.addColorStop(1, "rgba(255,60,60,0)");
  g.fillStyle = fg;
  g.beginPath(); g.moveTo(-8, -5); g.quadraticCurveTo(-8 - fl * 0.6, -6, -8 - fl, 0); g.quadraticCurveTo(-8 - fl * 0.6, 6, -8, 5); g.closePath(); g.fill();
  g.shadowColor = "rgba(255,180,80,.8)"; g.shadowBlur = 16;
  // Fins.
  g.fillStyle = "#e0314f";
  g.beginPath(); g.moveTo(-4, -6); g.lineTo(-12, -13); g.lineTo(-10, -4); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(-4, 6); g.lineTo(-12, 13); g.lineTo(-10, 4); g.closePath(); g.fill();
  // Body.
  const bg = g.createLinearGradient(0, -7, 0, 7);
  bg.addColorStop(0, "#ffffff"); bg.addColorStop(0.55, "#d9dcf0"); bg.addColorStop(1, "#8f93b5");
  g.fillStyle = bg;
  g.beginPath(); g.moveTo(-10, -6); g.lineTo(8, -6); g.quadraticCurveTo(20, -4, 24, 0); g.quadraticCurveTo(20, 4, 8, 6); g.lineTo(-10, 6); g.closePath(); g.fill();
  g.shadowBlur = 0;
  // Nose and window.
  g.fillStyle = "#e0314f";
  g.beginPath(); g.moveTo(14, -4.6); g.quadraticCurveTo(21, -3, 24, 0); g.quadraticCurveTo(21, 3, 14, 4.6); g.closePath(); g.fill();
  g.fillStyle = "#4cc9f0"; g.strokeStyle = "#2a2f55"; g.lineWidth = 1.5;
  g.beginPath(); g.arc(4, 0, 3.2, 0, 7); g.fill(); g.stroke();
  g.restore();
}
