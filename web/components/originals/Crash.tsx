"use client";
// Crash (single player): the result comes from the server at once; the rising multiplier is an
// animation of that result, up to the crash point.
import { useEffect, useRef, useState } from "react";
import { api, money } from "@/lib/api";
import { balanceChanged } from "@/lib/useMe";
import FairPanel, { Pick } from "./FairPanel";

type Result = {
  crash_point: number; target: number; cashed_out: boolean; win: number; bet: number;
  nonce: number; client_seed: string; server_seed_hash: string; rtp: number; max_win: number; max_win_applied: boolean;
};

const W = 320, H = 180;

export default function Crash({ rtp: initialRtp, maxWin: initialMax }: { rtp: number; maxWin: number }) {
  const [amount, setAmount] = useState("1.00");
  const [target, setTarget] = useState("2.00");
  const [shown, setShown] = useState(1);
  const [phase, setPhase] = useState<"idle" | "flying" | "done">("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [points, setPoints] = useState<[number, number][]>([]);
  const [history, setHistory] = useState<Result[]>([]);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [pick, setPick] = useState<Pick | null>(null);
  const raf = useRef(0);
  const [rtp, setRtp] = useState(initialRtp);
  const [maxWin, setMaxWin] = useState(initialMax);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const t = parseFloat(target) || 0;
  // P(crash ≥ t) = R / t; the 1.00x crashes cap it at R / 1.01.
  const chance = t >= 1.01 ? rtp / t : 0;
  const stake = Math.round((parseFloat(amount) || 0) * 100);
  const pays = Math.floor(stake * t);
  const capped = maxWin > 0 && pays > maxWin;

  function animate(r: Result) {
    // Exponential growth, sped up for big crash points so a round lasts at most ~5 seconds.
    const duration = Math.min(5000, Math.max(600, (Math.log(r.crash_point) / 0.00035)));
    const rate = Math.log(r.crash_point) / duration;
    const start = performance.now();
    const pts: [number, number][] = [];
    const step = (now: number) => {
      const el = Math.min(now - start, duration);
      const m = Math.min(Math.exp(rate * el), r.crash_point);
      pts.push([el / duration, m]);
      setPoints([...pts]);
      setShown(m);
      if (el < duration) raf.current = requestAnimationFrame(step);
      else {
        setShown(r.crash_point);
        setPhase("done");
        setHistory((h) => [r, ...h].slice(0, 12));
        balanceChanged();
      }
    };
    raf.current = requestAnimationFrame(step);
  }

  async function bet() {
    setError("");
    try {
      const r = await api<Result>("/api/originals/crash/bet", { amount: Math.round(parseFloat(amount) * 100), target: Math.round(t * 100) / 100 });
      setResult(r);
      setRtp(r.rtp);
      setMaxWin(r.max_win);
      setPhase("flying");
      setShown(1);
      setPoints([]);
      setRefresh((n) => n + 1);
      animate(r);
    } catch (e: any) {
      setError(e.message);
    }
  }

  const maxM = Math.max(2, ...points.map((p) => p[1]));
  const path = points.map(([x, m], i) => `${i ? "L" : "M"}${(x * (W - 20) + 10).toFixed(1)},${(H - 10 - ((m - 1) / (maxM - 1)) * (H - 30)).toFixed(1)}`).join(" ");
  const passed = result && phase !== "idle" && result.cashed_out && shown >= result.target;
  const crashed = phase === "done";

  return (
    <div className="cols">
      <div className="panel">
        <div className={"crash-screen" + (crashed ? (result?.cashed_out ? " won" : " lost") : "")}>
          <svg viewBox={`0 0 ${W} ${H}`} className="crash-graph" aria-hidden>
            <path d={path} className="crash-line" />
          </svg>
          <div className="crash-mult">{shown.toFixed(2)}x</div>
          <div className="crash-sub">
            {phase === "idle" && "Set your auto cash-out and place a bet"}
            {phase === "flying" && (passed ? `Cashed out at ${result!.target.toFixed(2)}x` : "Flying…")}
            {crashed && result && (result.cashed_out ? `Crashed at ${result.crash_point.toFixed(2)}x · you won ${money(result.win)}` : `Crashed at ${result.crash_point.toFixed(2)}x`)}
          </div>
          {passed && <div className="crash-badge">✓ {money(result!.win)}</div>}
        </div>
        <div className="crash-strip">
          {history.map((h) => (
            <span key={h.nonce + h.server_seed_hash} className={"chip-x " + (h.crash_point >= 2 ? "hi" : "lo")}>{h.crash_point.toFixed(2)}x</span>
          ))}
        </div>
        <div className="row">
          <label style={{ flex: 1 }}>Bet, $<input type="number" min="0.1" step="0.1" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label style={{ flex: 1 }}>Auto cash-out, x<input type="number" min="1.01" max="1000" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <span className="muted small" style={{ flex: 1 }}>Win chance {chance.toFixed(2)}% · pays {money(capped ? maxWin : pays)}{capped ? " (maximum win)" : ""} · RTP {rtp}%</span>
          <button className="btn gold" onClick={bet} disabled={phase === "flying"}>Bet</button>
        </div>
        {capped && <p className="rule-note" role="note" style={{ marginTop: 10 }}>Stake × auto cash-out is {money(pays)}, above the maximum win of {money(maxWin)} per bet: a win pays {money(maxWin)}.</p>}
        {error && <p className="error">{error}</p>}
        {history.length > 0 && (
          <div className="table-wrap">
            <table style={{ marginTop: 16 }}>
              <thead><tr><th>Nonce</th><th>Crash</th><th>Cash-out</th><th>Payout</th><th></th></tr></thead>
              <tbody>{history.map((h) => (
                <tr key={h.nonce + h.server_seed_hash}>
                  <td>{h.nonce}</td><td className={h.cashed_out ? "win" : "lose"}>{h.crash_point.toFixed(2)}x</td><td>{h.target.toFixed(2)}x</td><td>{money(h.win)}</td>
                  <td><button className="link-btn" onClick={() => setPick({ ...h })}>Verify</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      <FairPanel game="crash" refreshKey={refresh} pick={pick} rtp={rtp} />
    </div>
  );
}
