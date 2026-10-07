"use client";
// Plinko: the server picks the path; the canvas animates each ball along it peg by peg (a small
// hop and jitter per row that always ends on the server's peg, so the ball lands in the server's
// slot). Several balls can be in flight; the slot that catches a ball bounces.
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
type Ball = { r: Result; t0: number; jit: number[]; land: () => void; landed: boolean };
type Geo = { w: number; h: number; s: number; rowH: number; top: number; cx: number; pegR: number; ballR: number; slotY: number; slotH: number };

const SEG_MS = 125;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Slot colour: yellow in the centre to red at the edges. */
function slotColor(k: number, rows: number) {
  const t = Math.abs(k - rows / 2) / (rows / 2);
  const a = [255, 201, 60], b = [255, 128, 32], c = [255, 32, 80];
  const mix = (p: number[], q: number[], u: number) => p.map((v, i) => Math.round(v + (q[i] - v) * u));
  const rgb = t < 0.5 ? mix(a, b, t * 2) : mix(b, c, (t - 0.5) * 2);
  return `rgb(${rgb.join(",")})`;
}

function geometry(w: number, rows: number): Geo {
  const s = (w - 16) / (rows + 2);
  const rowH = s * 0.92;
  const top = s * 0.9;
  const slotH = Math.max(22, s * 0.78);
  const slotY = top + (rows - 1) * rowH + rowH * 0.75;
  return { w, h: slotY + slotH + 14, s, rowH, top, cx: w / 2, pegR: Math.max(2.2, s * 0.085), ballR: Math.max(4, s * 0.2), slotY, slotH };
}

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
  const canvas = useRef<HTMLCanvasElement>(null);
  const balls = useRef<Ball[]>([]);
  const pegHits = useRef(new Map<string, number>());
  const slotHits = useRef(new Map<number, number>());
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

  const frame = useCallback((now: number) => {
    const c = canvas.current, g = c?.getContext("2d");
    if (!c || !g) { running.current = false; return; }
    const G = geo.current;
    const { rows, table } = view.current;
    g.setTransform(dpr.current, 0, 0, dpr.current, 0, 0);
    g.clearRect(0, 0, G.w, G.h);
    // Pegs (a hit peg glows briefly).
    for (let i = 0; i < rows; i++) {
      const y = G.top + i * G.rowH;
      for (let j = 0; j < i + 3; j++) {
        const x = G.cx + (j - (i + 2) / 2) * G.s;
        const hit = pegHits.current.get(i + ":" + j);
        const k = hit ? Math.max(0, 1 - (now - hit) / 400) : 0;
        if (k > 0) {
          g.fillStyle = `rgba(255,190,90,${0.35 * k})`;
          g.beginPath(); g.arc(x, y, G.pegR * (2 + 2.5 * k), 0, 7); g.fill();
        }
        g.fillStyle = k > 0 ? "#fff3d6" : "#e9e6ff";
        g.shadowColor = "rgba(180,170,255,.6)"; g.shadowBlur = 6;
        g.beginPath(); g.arc(x, y, G.pegR * (1 + 0.4 * k), 0, 7); g.fill();
        g.shadowBlur = 0;
      }
    }
    // Slot buckets.
    const fs = Math.max(9, Math.min(13, G.s * 0.4));
    g.font = `800 ${fs}px system-ui, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    for (let k = 0; k <= rows; k++) {
      const x = G.cx + (k - rows / 2) * G.s;
      const hit = slotHits.current.get(k);
      const e = hit ? (now - hit) / 450 : 1;
      const dy = e < 1 ? Math.sin(e * Math.PI) * 7 * (1 - e * 0.5) : 0;
      const bw = G.s - 3, bh = G.slotH;
      const bx = x - bw / 2, by = G.slotY + dy;
      g.fillStyle = "rgba(0,0,0,.45)";
      rr(g, bx, G.slotY + 4, bw, bh, 5); g.fill();
      const col = slotColor(k, rows);
      const grd = g.createLinearGradient(0, by, 0, by + bh);
      grd.addColorStop(0, col); grd.addColorStop(1, shade(col));
      g.fillStyle = grd;
      if (e < 1) { g.shadowColor = col; g.shadowBlur = 18 * (1 - e); }
      rr(g, bx, by, bw, bh, 5); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = "rgba(255,255,255,.35)"; rr(g, bx + 2, by + 2, bw - 4, 3, 2); g.fill();
      g.fillStyle = "#2a0d00";
      const m = table[k];
      const label = m >= 1000 ? Math.round(m / 100) / 10 + "K" : String(m);
      const tw = g.measureText(label).width;
      if (tw > bw - 3) { g.save(); g.translate(x, by + bh / 2 + 1); g.scale((bw - 3) / tw, 1); g.fillText(label, 0, 0); g.restore(); }
      else g.fillText(label, x, by + bh / 2 + 1);
    }
    // Balls.
    let active = false;
    for (const b of balls.current) {
      const p = ballAt(b, now, G, pegHits.current);
      if (!p) continue;
      active = true;
      const glow = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, G.ballR * 2.4);
      glow.addColorStop(0, "rgba(255,90,140,.45)"); glow.addColorStop(1, "rgba(255,90,140,0)");
      g.fillStyle = glow; g.beginPath(); g.arc(p.x, p.y, G.ballR * 2.4, 0, 7); g.fill();
      const bg = g.createRadialGradient(p.x - G.ballR * 0.35, p.y - G.ballR * 0.4, 0, p.x, p.y, G.ballR);
      bg.addColorStop(0, "#fff"); bg.addColorStop(0.35, "#ff7aa8"); bg.addColorStop(1, "#d6194f");
      g.fillStyle = bg; g.beginPath(); g.arc(p.x, p.y, G.ballR, 0, 7); g.fill();
      if (p.landed && !b.landed) {
        b.landed = true;
        slotHits.current.set(b.r.slot, now);
        b.land();
      }
    }
    balls.current = balls.current.filter((b) => !b.landed);
    if (active || balls.current.length) lastActive.current = now;
    if (now - lastActive.current < 900) raf.current = requestAnimationFrame(frame);
    else running.current = false;
  }, []);

  const kick = useCallback(() => {
    lastActive.current = performance.now();
    if (running.current) return;
    running.current = true;
    raf.current = requestAnimationFrame(frame);
  }, [frame]);

  // Canvas follows the stage width; height follows the board.
  useEffect(() => {
    const el = wrap.current, c = canvas.current;
    if (!el || !c) return;
    const fit = () => {
      const d = Math.min(2, window.devicePixelRatio || 1);
      let w = Math.min(el.clientWidth - 8, 760);
      const maxH = window.innerWidth <= 860 ? 520 : 600;
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
      if (reducedMotion()) { slotHits.current.set(r.slot, performance.now()); land(); kick(); return; }
      const jit = Array.from({ length: r.rows + 2 }, () => (Math.random() - 0.5) * 0.5);
      balls.current.push({ r, t0: performance.now(), jit, land, landed: false });
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
    <div className="plinko-stage" ref={wrap}>
      <canvas ref={canvas} className="plinko-canvas" role="img" aria-label={`Plinko board, ${rows} rows, ${risk} risk`} />
    </div>
  );

  return (
    <GameShell game="plinko" mode={mode} onMode={setMode} modeLocked={auto.running} controls={controls} stage={<>{stage}{fx.layer}</>} glow={fx.glow}
      session={session} fair={{ refreshKey: refresh }} rtp={rtp} maxWin={maxWin} />
  );
}

/** Where a ball is at `now`: one hop per row between the pegs the server's path hits. */
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
    return { x: p.x + b.jit[0] * G.s * 0.3 * (1 - u), y: p.y - G.rowH * 1.2 * (1 - u * u), landed: false };
  }
  const seg = Math.floor((el - first) / SEG_MS);
  if (seg >= rows) return { ...contact(rows), landed: true };
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
  return { x, y, landed: false };
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function shade(rgb: string) {
  const [r, g, b] = rgb.match(/\d+/g)!.map(Number);
  return `rgb(${Math.round(r * 0.72)},${Math.round(g * 0.6)},${Math.round(b * 0.6)})`;
}
