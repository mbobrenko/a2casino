"use client";
import { useState } from "react";
import { api, money } from "@/lib/api";
import { balanceChanged } from "@/lib/useMe";
import FairPanel, { Pick } from "@/components/originals/FairPanel";
import { diceMultiplier } from "@/lib/fair";

type Result = {
  roll: number; target: number; multiplier: number; win: number; nonce: number; client_seed: string; server_seed_hash: string;
  rtp: number; max_win: number; max_win_applied: boolean;
};

export default function Dice({ rtp: initialRtp, maxWin: initialMax }: { rtp: number; maxWin: number }) {
  const [amount, setAmount] = useState("1.00");
  const [target, setTarget] = useState(50);
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<Result[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [pick, setPick] = useState<Pick | null>(null);
  // The RTP and cap shown follow the last result (a change in the back office applies to the next bet).
  const [rtp, setRtp] = useState(initialRtp);
  const [maxWin, setMaxWin] = useState(initialMax);

  const multiplier = diceMultiplier(target, rtp);
  const stake = Math.round((parseFloat(amount) || 0) * 100);
  const capped = maxWin > 0 && Math.floor(stake * multiplier) > maxWin;

  async function roll() {
    setBusy(true);
    setError("");
    try {
      const r = await api<Result>("/api/originals/dice/bet", { amount: Math.round(parseFloat(amount) * 100), target });
      setResult(r);
      setRtp(r.rtp);
      setMaxWin(r.max_win);
      setHistory((h) => [r, ...h].slice(0, 10));
      balanceChanged();
      setRefresh((n) => n + 1);
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  }

  return (
    <div className="cols">
      <div className="panel">
        <div className={"dice-roll " + (result ? (result.win > 0 ? "win" : "lose") : "")}>
          {result ? result.roll.toFixed(2) : "—"}
        </div>
        <p className="muted" style={{ textAlign: "center" }}>
          {result ? (result.win > 0 ? `You won ${money(result.win)}${result.max_win_applied ? " (maximum win)" : ""}` : "No luck this time") : "Win if the roll is under the target"}
        </p>
        <label>Target: under {target}
          <input type="range" min={2} max={98} value={target} onChange={(e) => setTarget(Number(e.target.value))} />
        </label>
        <div className="tiles" style={{ marginTop: 12 }}>
          <div className="tile"><div className="muted">Win chance</div><div className="v">{target}%</div></div>
          <div className="tile"><div className="muted">Multiplier</div><div className="v">x{multiplier.toFixed(4)}</div></div>
          <div className="tile"><div className="muted">RTP</div><div className="v">{rtp}%</div></div>
        </div>
        {capped && <p className="rule-note" role="note">This bet could win {money(Math.floor(stake * multiplier))}, above the maximum win of {money(maxWin)} per bet: a win pays {money(maxWin)}.</p>}
        <div className="row">
          <label style={{ flex: 1 }}>Bet, $<input type="number" min="0.1" step="0.1" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <button className="btn gold" onClick={roll} disabled={busy}>Roll</button>
        </div>
        {error && <p className="error">{error}</p>}
        {history.length > 0 && (
          <div className="table-wrap">
            <table style={{ marginTop: 16 }}>
              <thead><tr><th>Nonce</th><th>Roll</th><th>Target</th><th>Payout</th><th></th></tr></thead>
              <tbody>{history.map((h) => (
                <tr key={h.nonce + h.server_seed_hash}>
                  <td>{h.nonce}</td><td className={h.win > 0 ? "win" : "lose"}>{h.roll.toFixed(2)}</td><td>&lt; {h.target}</td><td>{money(h.win)}</td>
                  <td><button className="link-btn" onClick={() => setPick({ ...h })}>Verify</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      <FairPanel game="dice" refreshKey={refresh} pick={pick} rtp={rtp} />
    </div>
  );
}
