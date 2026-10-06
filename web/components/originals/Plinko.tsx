"use client";
// Plinko: the server picks the path; the ball animates along it row by row.
import { useEffect, useRef, useState } from "react";
import { api, money } from "@/lib/api";
import { plinkoTable } from "@/lib/fair";
import { balanceChanged } from "@/lib/useMe";
import FairPanel, { Pick } from "./FairPanel";

type Result = {
  rows: number; risk: string; path: number[]; slot: number; multiplier: number; win: number; bet: number;
  nonce: number; client_seed: string; server_seed_hash: string; rtp: number; max_win: number; max_win_applied: boolean;
};
type Ball = { id: number; r: Result; step: number };

const W = 400;
const STEP_MS = 140;

function slotColor(m: number) {
  if (m >= 10) return "#ef4444";
  if (m >= 3) return "#f97316";
  if (m >= 1.5) return "#f59e0b";
  if (m >= 1) return "#eab308";
  return "#64748b";
}

export default function Plinko({ rtp: initialRtp, maxWin: initialMax }: { rtp: number; maxWin: number }) {
  const [amount, setAmount] = useState("1.00");
  const [rows, setRows] = useState(12);
  const [risk, setRisk] = useState("medium");
  const [balls, setBalls] = useState<Ball[]>([]);
  const [hit, setHit] = useState<number | null>(null);
  const [history, setHistory] = useState<Result[]>([]);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [pick, setPick] = useState<Pick | null>(null);
  const seq = useRef(0);
  const [rtp, setRtp] = useState(initialRtp);
  const [maxWin, setMaxWin] = useState(initialMax);

  // Advance every ball one row per tick; landed balls are removed and recorded.
  useEffect(() => {
    if (balls.length === 0) return;
    const t = setTimeout(() => {
      const landed = balls.filter((b) => b.step >= b.r.rows + 1);
      for (const b of landed) {
        setHit(b.r.slot);
        setHistory((h) => [b.r, ...h].slice(0, 12));
      }
      if (landed.length) balanceChanged();
      const gone = new Set(landed.map((b) => b.id));
      setBalls((bs) => bs.filter((b) => !gone.has(b.id)).map((b) => ({ ...b, step: b.step + 1 })));
    }, STEP_MS);
    return () => clearTimeout(t);
  }, [balls]);

  const busyBoard = balls.length > 0;
  const table = plinkoTable(rtp, rows, risk);
  const stake = Math.round((parseFloat(amount) || 0) * 100);
  const top_ = Math.max(...table);
  const capped = maxWin > 0 && Math.floor(stake * top_) > maxWin;
  const s = W / (rows + 2);
  const top = 24;
  const rowH = s * 0.86;
  const height = top + rows * rowH + 34;

  async function drop() {
    setError("");
    try {
      const r = await api<Result>("/api/originals/plinko/bet", { amount: Math.round(parseFloat(amount) * 100), rows, risk });
      setRtp(r.rtp);
      setMaxWin(r.max_win);
      setBalls((bs) => [...bs, { id: ++seq.current, r, step: 0 }]);
      setRefresh((n) => n + 1);
    } catch (e: any) {
      setError(e.message);
    }
  }

  function ballPos(b: Ball) {
    // After k rows with `rights` right bounces the ball sits between pegs of row k.
    const k = Math.min(b.step, b.r.rows);
    const rights = b.r.path.slice(0, k).reduce((a, x) => a + x, 0);
    const x = W / 2 + (rights - k / 2) * s;
    const y = b.step > b.r.rows ? top + rows * rowH + 14 : top - rowH * 0.5 + k * rowH;
    return { x, y };
  }

  return (
    <div className="cols">
      <div className="panel">
        <svg viewBox={`0 0 ${W} ${height}`} className="plinko-board" role="img" aria-label="Plinko board">
          {Array.from({ length: rows }, (_, i) =>
            Array.from({ length: i + 3 }, (_, j) => (
              <circle key={`${i}-${j}`} cx={W / 2 + (j - (i + 2) / 2) * s} cy={top + i * rowH} r={Math.max(2, s * 0.09)} className="peg" />
            )),
          )}
          {table.map((m, j) => {
            const x = W / 2 + (j - rows / 2) * s;
            return (
              <g key={j} className={"pslot" + (hit === j ? " hit" : "")}>
                <rect x={x - s / 2 + 1} y={top + rows * rowH + 4} width={s - 2} height={22} rx={4} fill={slotColor(m)} />
                <text x={x} y={top + rows * rowH + 19} textAnchor="middle" fontSize={rows === 16 ? 7 : 9}>{m}</text>
              </g>
            );
          })}
          {balls.filter((b) => b.r.rows === rows).map((b) => {
            const p = ballPos(b);
            return <circle key={b.id} className="ball" r={Math.max(4, s * 0.22)} cx={0} cy={0} style={{ transform: `translate(${p.x}px, ${p.y}px)` }} />;
          })}
        </svg>
        <div className="row">
          <label style={{ flex: 1 }}>Bet, $<input type="number" min="0.1" step="0.1" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label>Rows
            <select value={rows} disabled={busyBoard} onChange={(e) => { setRows(Number(e.target.value)); setHit(null); }}>
              <option value={8}>8</option><option value={12}>12</option><option value={16}>16</option>
            </select>
          </label>
          <label>Risk
            <select value={risk} disabled={busyBoard} onChange={(e) => { setRisk(e.target.value); setHit(null); }}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </label>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn gold wide" onClick={drop}>Drop ball</button>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          RTP {rtp}%{maxWin > 0 && <> · maximum win {money(maxWin)} per bet{capped ? ` (the ${top_}x slot would pay ${money(Math.floor(stake * top_))}: capped)` : ""}</>}
        </p>
        {error && <p className="error">{error}</p>}
        {history.length > 0 && (
          <div className="table-wrap">
            <table style={{ marginTop: 16 }}>
              <thead><tr><th>Nonce</th><th>Board</th><th>Multiplier</th><th>Payout</th><th></th></tr></thead>
              <tbody>{history.map((h) => (
                <tr key={h.nonce + h.server_seed_hash}>
                  <td>{h.nonce}</td><td>{h.rows} · {h.risk}</td>
                  <td className={h.multiplier >= 1 ? "win" : "lose"}>{h.multiplier}x</td><td>{money(h.win)}</td>
                  <td><button className="link-btn" onClick={() => setPick({ ...h })}>Verify</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      <FairPanel game="plinko" refreshKey={refresh} pick={pick} rtp={rtp} />
    </div>
  );
}
