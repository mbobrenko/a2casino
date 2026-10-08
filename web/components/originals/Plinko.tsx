"use client";
// Plinko: the server picks the path; the canvas animates each ball along it peg by peg (a small
// hop and jitter per row that always ends on the server's peg, so the ball lands in the server's
// slot). Several balls can be in flight; the slot that catches a ball bounces.
// Presentation: a neon cabinet around the board, a dropper the balls come out of, glossy pegs
// (pre-rendered once per size) that pulse and ring when hit, balls with a trail, a specular
// highlight and a squash on each bounce, 3D pill buckets that press down and flash, and a floating
// multiplier rising from the bucket that caught the ball.
import "@/app/og-plinko.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, money } from "@/lib/api";
import { plinkoTable } from "@/lib/fair";
import { balanceChanged } from "@/lib/useMe";
import { reducedMotion, useFx } from "./kit/fx";
import { sfx } from "./kit/sound";
import { AutoPanel, BetButton, BetInput, cents, GameShell, Segmented, useAuto, useHotkey, useMaxBet, useSession } from "./kit/ui";

type Result = {
  rows: number; risk: string; path: number[]; slot: number; multiplier: number; win: number; bet: number;
  nonce: number; client_seed: string; server_seed_hash: string; rtp: number; max_win: number; max_win_applied: boolean;
};
type Ball = { r: Result; t0: number; jit: number[]; land: () => void; landed: boolean; trail: number[] };
type Geo = { w: number; h: number; s: number; rowH: number; top: number; cx: number; pegR: number; ballR: number; slotY: number; slotH: number };
type Float = { slot: number; t0: number; text: string; rgb: number[]; big: boolean };
type Board = { key: string; c: HTMLCanvasElement; peg: HTMLCanvasElement; pegHit: HTMLCanvasElement; pegSz: number };

const SEG_MS = 125;
const FLOAT_MS = 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Slot colour: yellow in the centre through orange and red to hot pink at the edges. */
function slotRGB(k: number, rows: number) {
  const t = Math.abs(k - rows / 2) / (rows / 2);
  const stops = [[255, 214, 70], [255, 150, 40], [255, 60, 70], [255, 40, 140]];
  const x = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), u = x - i;
  return stops[i].map((v, n) => Math.round(v + (stops[i + 1][n] - v) * u));
}
const rgb = (c: number[], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const mul = (c: number[], k: number) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
const lift = (c: number[], k: number) => c.map((v) => Math.round(v + (255 - v) * k));

function geometry(w: number, rows: number): Geo {
  const s = (w - 16) / (rows + 2);
  const rowH = s * 0.92;
  const top = s * 1.9;
  const slotH = Math.max(24, s * 0.8);
  const slotY = top + (rows - 1) * rowH + rowH * 0.75;
  return { w, h: slotY + slotH + 16, s, rowH, top, cx: w / 2, pegR: Math.max(2.2, s * 0.085), ballR: Math.max(4, s * 0.2), slotY, slotH };
}
const pegXY = (G: Geo, i: number, j: number) => [G.cx + (j - (i + 2) / 2) * G.s, G.top + i * G.rowH] as const;
/** Where the dropper's mouth is: the start of every ball's first segment. */
const mouthY = (G: Geo) => G.top - G.pegR - G.ballR * 0.9 - G.rowH * 1.2;

export default function Plinko({ rtp: initialRtp, maxWin: initialMax }: { rtp: number; maxWin: number }) {
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [amount, setAmount] = useState("1.00");
  const [rows, setRows] = useState(12);
  const [risk, setRisk] = useState("medium");
  const [inFlight, setInFlight] = useState(0);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [rtp, setRtp] = useState(initialRtp);
  const [maxWin, setMaxWin] = useState(initialMax);
  const session = useSession();
  const fx = useFx();
  const { max } = useMaxBet(maxWin);
  const wrap = useRef<HTMLDivElement>(null);
  const cab = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const balls = useRef<Ball[]>([]);
  const pegHits = useRef(new Map<string, number>());
  const slotHits = useRef(new Map<number, number>());
  const floats = useRef<Float[]>([]);
  const board = useRef<Board | null>(null);
  const lastDrop = useRef(0);
  const still = useRef(false);
  const geo = useRef<Geo>(geometry(600, 12));
  const dpr = useRef(1);
  const raf = useRef(0);
  const running = useRef(false);
  const lastActive = useRef(0);
  const view = useRef({ rows, table: plinkoTable(rtp, rows, risk) });
  view.current = { rows, table: plinkoTable(rtp, rows, risk) };

  const table = view.current.table;
  const stake = cents(amount);
  const topM = Math.max(...table);
  const capped = maxWin > 0 && Math.floor(stake * topM) > maxWin;

  /** A ball reached its bucket: the bucket presses and flashes, its multiplier floats up. */
  const bucketHit = useCallback((r: Result, now: number) => {
    slotHits.current.set(r.slot, now);
    const m = r.multiplier;
    floats.current.push({ slot: r.slot, t0: now, text: (m >= 1000 ? Math.round(m / 100) / 10 + "K" : String(m)) + "×", rgb: slotRGB(r.slot, r.rows), big: m >= 10 });
    if (floats.current.length > 10) floats.current.shift();
  }, []);

  const frame = useCallback((now: number) => {
    const c = canvas.current, g = c?.getContext("2d");
    if (!c || !g) { running.current = false; return; }
    const G = geo.current;
    const { rows, table } = view.current;
    const d = dpr.current;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, G.w, G.h);
    const B = boardFor(board, G, rows, d);
    g.drawImage(B.c, 0, 0, G.w, G.h);

    // Dropper mouth flashes as a ball is released.
    const dk = Math.max(0, 1 - (now - lastDrop.current) / 260);
    if (dk > 0) {
      const my = mouthY(G);
      g.save(); g.globalCompositeOperation = "lighter";
      const gr = g.createRadialGradient(G.cx, my, 0, G.cx, my, G.s * 0.9);
      gr.addColorStop(0, `rgba(255,140,210,${0.7 * dk})`); gr.addColorStop(1, "rgba(255,140,210,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(G.cx, my, G.s * 0.9, 0, 7); g.fill();
      g.restore();
    }

    // Hit pegs: glow, an expanding ring and a hot core (only the recently hit ones are redrawn).
    g.save();
    g.globalCompositeOperation = "lighter";
    for (const [key, hit] of pegHits.current) {
      const k = Math.max(0, 1 - (now - hit) / 420);
      if (k <= 0) continue;
      const sep = key.indexOf(":");
      const [x, y] = pegXY(G, +key.slice(0, sep), +key.slice(sep + 1));
      g.fillStyle = `rgba(255,120,200,${0.32 * k})`;
      g.beginPath(); g.arc(x, y, G.pegR * (2 + 2.6 * k), 0, 7); g.fill();
      g.strokeStyle = `rgba(255,214,240,${0.85 * k})`; g.lineWidth = 1.4;
      g.beginPath(); g.arc(x, y, G.pegR * (1.5 + 3.8 * (1 - k)), 0, 7); g.stroke();
      const sz = B.pegSz * (1 + 0.35 * k);
      g.globalAlpha = k;
      g.drawImage(B.pegHit, x - sz / 2, y - sz / 2, sz, sz);
      g.globalAlpha = 1;
    }
    g.restore();

    // Buckets: glossy 3D pills that press down, flash and light a beam when they catch a ball.
    const fs = Math.max(9, Math.min(14, G.s * 0.4));
    g.textAlign = "center"; g.textBaseline = "middle";
    const bw = Math.max(6, G.s - 4), bh = G.slotH, depth = Math.max(3, bh * 0.16);
    const rad = Math.min(bh * 0.42, bw * 0.32);
    for (let k = 0; k <= rows; k++) {
      const x = G.cx + (k - rows / 2) * G.s;
      const hit = slotHits.current.get(k);
      const e = hit ? (now - hit) / 520 : 1;
      const on = e < 1;
      const press = on ? Math.sin(Math.min(1, e * 1.6) * Math.PI) * depth * (1 - e * 0.3) : 0;
      const bx = x - bw / 2, by = G.slotY + press;
      const col = slotRGB(k, rows);
      if (on) {
        g.save(); g.globalCompositeOperation = "lighter";
        const beam = g.createLinearGradient(0, G.slotY - G.rowH * 2.4, 0, G.slotY + bh);
        beam.addColorStop(0, rgb(col, 0)); beam.addColorStop(1, rgb(col, 0.3 * (1 - e)));
        g.fillStyle = beam; g.fillRect(bx + 2, G.slotY - G.rowH * 2.4, bw - 4, G.rowH * 2.4 + bh);
        const halo = g.createRadialGradient(x, by + bh / 2, 0, x, by + bh / 2, bw * 1.5);
        halo.addColorStop(0, rgb(col, 0.55 * (1 - e))); halo.addColorStop(1, rgb(col, 0));
        g.fillStyle = halo; g.beginPath(); g.arc(x, by + bh / 2, bw * 1.5, 0, 7); g.fill();
        g.restore();
      }
      // Base (the pill's side) and drop shadow.
      g.fillStyle = "rgba(0,0,0,.5)"; rr(g, bx + 1, G.slotY + depth + 3, bw - 2, bh, rad); g.fill();
      g.fillStyle = rgb(mul(col, 0.48)); rr(g, bx, G.slotY + depth, bw, bh, rad); g.fill();
      // Face.
      const face = g.createLinearGradient(0, by, 0, by + bh);
      face.addColorStop(0, rgb(lift(col, 0.35))); face.addColorStop(0.5, rgb(col)); face.addColorStop(1, rgb(mul(col, 0.72)));
      g.fillStyle = face; rr(g, bx, by, bw, bh, rad); g.fill();
      // Gloss and rim.
      const gl = g.createLinearGradient(0, by, 0, by + bh * 0.5);
      gl.addColorStop(0, "rgba(255,255,255,.6)"); gl.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gl; rr(g, bx + 2, by + 1.5, bw - 4, bh * 0.45, Math.max(1, rad - 2)); g.fill();
      g.strokeStyle = rgb(lift(col, 0.5), 0.6); g.lineWidth = 1; rr(g, bx + 0.5, by + 0.5, bw - 1, bh - 1, rad); g.stroke();
      if (on) { g.fillStyle = `rgba(255,255,255,${0.55 * Math.max(0, 1 - e * 1.8)})`; rr(g, bx, by, bw, bh, rad); g.fill(); }
      // Label.
      const m = table[k];
      const label = m >= 1000 ? Math.round(m / 100) / 10 + "K" : String(m);
      const edge = Math.abs(k - rows / 2) / (rows / 2) > 0.55;
      g.font = `900 ${fs}px system-ui, sans-serif`;
      g.fillStyle = edge ? "#fff" : "#3a1200";
      const tw = g.measureText(label).width;
      const ly = by + bh / 2 + 1;
      if (tw > bw - 4) { g.save(); g.translate(x, ly); g.scale((bw - 4) / tw, 1); g.fillText(label, 0, 0); g.restore(); }
      else g.fillText(label, x, ly);
    }

    // Balls: trail, glow, then a squashed glossy sphere.
    let active = false;
    for (const b of balls.current) {
      const p = ballAt(b, now, G, pegHits.current);
      if (!p) continue;
      active = true;
      const R = G.ballR;
      b.trail.push(p.x, p.y);
      if (b.trail.length > 16) b.trail.splice(0, 2);
      g.save(); g.globalCompositeOperation = "lighter";
      const n = b.trail.length / 2;
      for (let i = 0; i < n - 1; i++) {
        const a = (i + 1) / n;
        g.fillStyle = `rgba(255,80,160,${0.28 * a})`;
        g.beginPath(); g.arc(b.trail[i * 2], b.trail[i * 2 + 1], R * (0.35 + 0.55 * a), 0, 7); g.fill();
      }
      const glow = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * 2.6);
      glow.addColorStop(0, "rgba(255,90,160,.5)"); glow.addColorStop(1, "rgba(255,90,160,0)");
      g.fillStyle = glow; g.beginPath(); g.arc(p.x, p.y, R * 2.6, 0, 7); g.fill();
      g.restore();
      g.save();
      g.translate(p.x, p.y + p.sq * R * 0.2);
      g.scale(1 + 0.2 * p.sq, 1 - 0.24 * p.sq);
      const bg = g.createRadialGradient(-R * 0.35, -R * 0.4, 0, 0, 0, R);
      bg.addColorStop(0, "#fff"); bg.addColorStop(0.3, "#ff8cbc"); bg.addColorStop(0.8, "#e0185a"); bg.addColorStop(1, "#8a0d3a");
      g.fillStyle = bg; g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill();
      g.fillStyle = "rgba(255,255,255,.9)";
      g.beginPath(); g.ellipse(-R * 0.38, -R * 0.42, R * 0.28, R * 0.18, -0.6, 0, 7); g.fill();
      g.strokeStyle = "rgba(255,200,230,.35)"; g.lineWidth = 1;
      g.beginPath(); g.arc(0, 0, R - 0.5, 0, 7); g.stroke();
      g.restore();
      if (p.landed && !b.landed) {
        b.landed = true;
        bucketHit(b.r, now);
        b.land();
      }
    }
    balls.current = balls.current.filter((b) => !b.landed);

    // Floating multipliers rising from the bucket.
    if (floats.current.length) {
      floats.current = floats.current.filter((f) => now - f.t0 < FLOAT_MS);
      for (const f of floats.current) {
        const e = (now - f.t0) / FLOAT_MS;
        const x = G.cx + (f.slot - rows / 2) * G.s;
        const rise = still.current ? 0.5 : 1 - Math.pow(1 - e, 3);
        const y = G.slotY - 10 - rise * G.rowH * 1.8;
        const pop = still.current ? 1 : e < 0.12 ? 0.6 + (e / 0.12) * 0.5 : Math.max(1, 1.1 - (e - 0.12) * 0.8);
        const a = e < 0.7 ? 1 : 1 - (e - 0.7) / 0.3;
        const size = Math.max(12, G.s * 0.5) * (f.big ? 1.35 : 1) * pop;
        g.save();
        g.globalAlpha = a;
        g.font = `900 ${size}px system-ui, sans-serif`;
        g.lineJoin = "round"; g.lineWidth = Math.max(3, size * 0.22);
        g.strokeStyle = "rgba(20,8,30,.85)"; g.strokeText(f.text, x, y);
        g.fillStyle = rgb(lift(f.rgb, 0.35)); g.fillText(f.text, x, y);
        g.restore();
      }
    }

    if (active || balls.current.length) lastActive.current = now;
    if (now - lastActive.current < FLOAT_MS + 200) raf.current = requestAnimationFrame(frame);
    else running.current = false;
  }, [bucketHit]);

  const kick = useCallback(() => {
    lastActive.current = performance.now();
    if (running.current) return;
    running.current = true;
    raf.current = requestAnimationFrame(frame);
  }, [frame]);

  // Canvas follows the stage width; height follows the board.
  useEffect(() => {
    const el = wrap.current, c = canvas.current, box = cab.current;
    if (!el || !c || !box) return;
    still.current = !!reducedMotion();
    const fit = () => {
      const d = Math.min(2, window.devicePixelRatio || 1);
      const cs = getComputedStyle(box);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      let w = Math.min(el.clientWidth - 8 - padX, 760);
      const maxH = (window.innerWidth <= 860 ? 520 : 600) - padY;
      const h0 = geometry(w, rows).h;
      if (h0 > maxH) w = Math.floor((w * maxH) / h0);
      const G = geometry(w, rows);
      geo.current = G; dpr.current = d;
      c.style.width = w + "px"; c.style.height = G.h + "px";
      c.width = Math.round(w * d); c.height = Math.round(G.h * d);
      kick();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows, kick]);
  useEffect(() => { kick(); }, [risk, rtp, kick]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  async function play(amountCents: number, fromAuto = false) {
    setError("");
    const r = await api<Result>("/api/originals/plinko/bet", { amount: amountCents, rows, risk });
    sfx.bet();
    setRtp(r.rtp);
    setMaxWin(r.max_win);
    setRefresh((n) => n + 1);
    setInFlight((n) => n + 1);
    const landed = new Promise<void>((resolve) => {
      const land = () => {
        setInFlight((n) => n - 1);
        session.record({ bet: r.bet, win: r.win, mult: r.multiplier,
          pick: { client_seed: r.client_seed, nonce: r.nonce, server_seed_hash: r.server_seed_hash, rtp: r.rtp, rows: r.rows, risk: r.risk } });
        if (r.multiplier >= 2) fx.win(r.multiplier, r.win, { quiet: r.multiplier < 10 });
        else sfx.tick(0.6);
        balanceChanged();
        resolve();
      };
      if (reducedMotion()) { bucketHit(r, performance.now()); land(); kick(); return; }
      const jit = Array.from({ length: r.rows + 2 }, () => (Math.random() - 0.5) * 0.5);
      lastDrop.current = performance.now();
      balls.current.push({ r, t0: performance.now(), jit, land, landed: false, trail: [] });
      kick();
    });
    return { bet: r.bet, win: r.win, done: fromAuto ? sleep(160) : landed };
  }

  const auto = useAuto({ amount, setAmount, play: (c) => play(c, true), onError: setError, gap: 180 });
  const manual = () => play(stake).catch((e) => setError(e.message));
  useHotkey(() => (mode === "auto" ? (auto.running ? auto.stop() : auto.start()) : manual()), true);
  const locked = inFlight > 0 || auto.running;

  const controls = (
    <>
      <BetInput value={amount} onChange={setAmount} disabled={auto.running} max={max} />
      <Segmented label="Risk" value={risk} onChange={setRisk} disabled={locked}
        options={[{ v: "low", t: "Low" }, { v: "medium", t: "Medium" }, { v: "high", t: "High" }]} />
      <Segmented label="Rows" value={rows} onChange={setRows} disabled={locked}
        options={[8, 12, 16].map((n) => ({ v: n, t: String(n) }))} />
      {mode === "auto" && <AutoPanel auto={auto} />}
      {mode === "manual"
        ? <BetButton onClick={manual}>Bet</BetButton>
        : auto.running ? <BetButton variant="stop" onClick={auto.stop}>Stop auto-bet</BetButton> : <BetButton onClick={auto.start}>Start auto-bet</BetButton>}
      <p className="og-note subtle">Top slot {topM}× · RTP {rtp}%{maxWin > 0 && <> · max win {money(maxWin)}{capped ? ` (the ${topM}× slot would pay ${money(Math.floor(stake * topM))}: capped)` : ""}</>}</p>
      {error && <p className="og-error" role="alert">{error}</p>}
    </>
  );

  const stage = (
    <div className={"plinko-stage" + (risk === "high" ? " risk-high" : "")} ref={wrap}>
      <div className="plk-dust" aria-hidden>{Array.from({ length: 14 }, (_, i) => <i key={i} />)}</div>
      <div className="plk-cab" ref={cab}>
        <canvas ref={canvas} className="plinko-canvas" role="img" aria-label={`Plinko board, ${rows} rows, ${risk} risk`} />
      </div>
    </div>
  );

  return (
    <GameShell game="plinko" mode={mode} onMode={setMode} modeLocked={auto.running} controls={controls} stage={<>{stage}{fx.layer}</>} glow={fx.glow}
      session={session} fair={{ refreshKey: refresh }} rtp={rtp} maxWin={maxWin} />
  );
}

/** Where a ball is at `now`: one hop per row between the pegs the server's path hits. `sq` is the
 *  squash (0..1) right after it bounces off a peg or lands. */
function ballAt(b: Ball, now: number, G: Geo, pegHits: Map<string, number>) {
  const rows = b.r.rows;
  const contact = (i: number) => {
    const rights = b.r.path.slice(0, i).reduce((a, x) => a + x, 0);
    if (i >= rows) return { x: G.cx + (rights - rows / 2) * G.s, y: G.slotY + G.slotH * 0.4, j: -1 };
    return { x: G.cx + (rights - i / 2) * G.s, y: G.top + i * G.rowH - G.pegR - G.ballR * 0.9, j: rights + 1 };
  };
  const el = now - b.t0;
  // Segment -1: the drop onto the first peg; segment i: peg i → peg i+1 (rows → slot).
  const first = SEG_MS * 1.3;
  if (el < first) {
    const u = el / first;
    const p = contact(0);
    return { x: p.x + b.jit[0] * G.s * 0.3 * (1 - u), y: p.y - G.rowH * 1.2 * (1 - u * u), landed: false, sq: 0 };
  }
  const seg = Math.floor((el - first) / SEG_MS);
  if (seg >= rows) return { ...contact(rows), landed: true, sq: 1 };
  const u = (el - first - seg * SEG_MS) / SEG_MS;
  const a = contact(seg), z = contact(seg + 1);
  if (a.j >= 0) {
    const key = seg + ":" + a.j;
    const prev = pegHits.get(key) ?? 0;
    if (now - prev > SEG_MS * 2 && u < 0.5) { pegHits.set(key, now); sfx.peg(seg); }
  }
  const hop = G.rowH * 0.32;
  const x = a.x + (z.x - a.x) * (1 - (1 - u) * (1 - u)) + Math.sin(Math.PI * u) * b.jit[seg + 1] * G.s * 0.35;
  const y = a.y + (z.y - a.y) * u * u - hop * 4 * u * (1 - u);
  return { x, y, landed: false, sq: Math.max(0, 1 - u / 0.22) };
}

/** The static board (backdrop, rails, pegs, dropper), drawn once per size / row count. */
function boardFor(ref: { current: Board | null }, G: Geo, rows: number, d: number): Board {
  const key = `${G.w}|${G.h}|${rows}|${d}`;
  if (ref.current?.key === key) return ref.current;
  const pegSz = Math.ceil(G.pegR * 6);
  const peg = sprite(pegSz, d, (g, c) => {
    const halo = g.createRadialGradient(c, c, 0, c, c, c);
    halo.addColorStop(0, "rgba(190,170,255,.35)"); halo.addColorStop(1, "rgba(190,170,255,0)");
    g.fillStyle = halo; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill();
    const r = G.pegR;
    const body = g.createRadialGradient(c - r * 0.35, c - r * 0.4, 0, c, c, r);
    body.addColorStop(0, "#ffffff"); body.addColorStop(0.45, "#d8d2ff"); body.addColorStop(1, "#7466c8");
    g.fillStyle = body; g.beginPath(); g.arc(c, c, r, 0, 7); g.fill();
  });
  const pegHit = sprite(pegSz, d, (g, c) => {
    const r = G.pegR;
    const body = g.createRadialGradient(c - r * 0.3, c - r * 0.35, 0, c, c, r * 1.1);
    body.addColorStop(0, "#ffffff"); body.addColorStop(0.5, "#ffe1f1"); body.addColorStop(1, "#ff6fb8");
    g.fillStyle = body; g.beginPath(); g.arc(c, c, r * 1.1, 0, 7); g.fill();
  });

  const c = document.createElement("canvas");
  c.width = Math.round(G.w * d); c.height = Math.round(G.h * d);
  const g = c.getContext("2d")!;
  g.scale(d, d);
  // Pyramid backdrop with neon rails along its sides.
  const yT = G.top - G.rowH * 0.6, yB = G.slotY - G.rowH * 0.15;
  const xT = G.s * 1.5, xB = ((rows + 2) / 2) * G.s + G.s * 0.15;
  const tri = () => { g.beginPath(); g.moveTo(G.cx - xT, yT); g.lineTo(G.cx + xT, yT); g.lineTo(G.cx + xB, yB); g.lineTo(G.cx - xB, yB); g.closePath(); };
  const fill = g.createLinearGradient(0, yT, 0, yB);
  fill.addColorStop(0, "rgba(124,92,255,.16)"); fill.addColorStop(1, "rgba(255,79,163,.07)");
  tri(); g.fillStyle = fill; g.fill();
  g.save(); tri(); g.clip();
  g.strokeStyle = "rgba(190,170,255,.05)"; g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i < rows; i++) { const y = G.top + i * G.rowH; g.moveTo(0, y); g.lineTo(G.w, y); }
  g.stroke(); g.restore();
  const rail = g.createLinearGradient(0, yT, 0, yB);
  rail.addColorStop(0, "rgba(255,111,184,.0)"); rail.addColorStop(0.25, "rgba(255,111,184,.7)"); rail.addColorStop(1, "rgba(124,92,255,.8)");
  g.lineCap = "round";
  for (const [lw, a] of [[6, 0.18], [2, 1]] as const) {
    g.globalAlpha = a; g.strokeStyle = rail; g.lineWidth = lw;
    g.beginPath(); g.moveTo(G.cx - xT, yT); g.lineTo(G.cx - xB, yB); g.moveTo(G.cx + xT, yT); g.lineTo(G.cx + xB, yB); g.stroke();
  }
  g.globalAlpha = 1;
  // Bucket tray.
  const tray = g.createLinearGradient(0, G.slotY - 4, 0, G.h);
  tray.addColorStop(0, "rgba(10,6,24,0)"); tray.addColorStop(1, "rgba(10,6,24,.55)");
  g.fillStyle = tray; g.fillRect(G.cx - xB - G.s * 0.3, G.slotY - 4, (xB + G.s * 0.3) * 2, G.h - G.slotY + 4);
  // Pegs.
  for (let i = 0; i < rows; i++) for (let j = 0; j < i + 3; j++) {
    const [x, y] = pegXY(G, i, j);
    g.drawImage(peg, x - pegSz / 2, y - pegSz / 2, pegSz, pegSz);
  }
  // Dropper: a neon funnel whose mouth sits where every ball starts.
  const my = mouthY(G);
  const topW = G.s * 1.1, mw = G.ballR * 1.5, y0 = Math.min(-2, my - G.s);
  g.save();
  const fun = () => {
    g.beginPath();
    g.moveTo(G.cx - topW, y0);
    g.lineTo(G.cx + topW, y0);
    g.quadraticCurveTo(G.cx + topW * 0.9, my - G.s * 0.35, G.cx + mw, my - G.ballR * 0.3);
    g.lineTo(G.cx + mw, my + G.ballR * 0.2);
    g.lineTo(G.cx - mw, my + G.ballR * 0.2);
    g.lineTo(G.cx - mw, my - G.ballR * 0.3);
    g.quadraticCurveTo(G.cx - topW * 0.9, my - G.s * 0.35, G.cx - topW, y0);
    g.closePath();
  };
  const fb = g.createLinearGradient(G.cx - topW, 0, G.cx + topW, 0);
  fb.addColorStop(0, "#1a1236"); fb.addColorStop(0.5, "#3a2a6e"); fb.addColorStop(1, "#1a1236");
  fun(); g.fillStyle = fb; g.fill();
  g.strokeStyle = "rgba(255,111,184,.25)"; g.lineWidth = 5; fun(); g.stroke();
  g.strokeStyle = "rgba(255,150,210,.95)"; g.lineWidth = 1.4; fun(); g.stroke();
  const mouth = g.createRadialGradient(G.cx, my + G.ballR * 0.2, 0, G.cx, my + G.ballR * 0.2, mw * 2.2);
  mouth.addColorStop(0, "rgba(255,170,220,.55)"); mouth.addColorStop(1, "rgba(255,170,220,0)");
  g.fillStyle = mouth; g.beginPath(); g.arc(G.cx, my + G.ballR * 0.2, mw * 2.2, 0, 7); g.fill();
  g.restore();

  ref.current = { key, c, peg, pegHit, pegSz };
  return ref.current;
}

function sprite(size: number, d: number, paint: (g: CanvasRenderingContext2D, c: number) => void) {
  const c = document.createElement("canvas");
  c.width = Math.ceil(size * d); c.height = Math.ceil(size * d);
  const g = c.getContext("2d")!;
  g.scale(d, d);
  paint(g, size / 2);
  return c;
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
