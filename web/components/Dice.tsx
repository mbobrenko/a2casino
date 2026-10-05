"use client";
import { useEffect, useState } from "react";
import { api, money } from "@/lib/api";
import { balanceChanged } from "@/lib/useMe";

type Seed = { server_seed_hash: string; client_seed: string; nonce: number; previous_server_seed: string | null };
type Result = { roll: number; target: number; multiplier: number; win: number; nonce: number };

export default function Dice() {
  const [amount, setAmount] = useState("1.00");
  const [target, setTarget] = useState(50);
  const [seed, setSeed] = useState<Seed | null>(null);
  const [clientSeed, setClientSeed] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<Result[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSeed = () => api<Seed>("/api/originals/dice/seed").then((s) => { setSeed(s); setClientSeed(s.client_seed); });
  useEffect(() => { loadSeed().catch((e) => setError(e.message)); }, []);

  const multiplier = 99 / target;

  async function roll() {
    setBusy(true);
    setError("");
    try {
      const r = await api<Result>("/api/originals/dice/bet", { amount: Math.round(parseFloat(amount) * 100), target });
      setResult(r);
      setHistory((h) => [r, ...h].slice(0, 10));
      balanceChanged();
      await loadSeed();
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  }

  async function rotate() {
    const s = await api<Seed>("/api/originals/dice/seed", { client_seed: clientSeed });
    setSeed(s);
  }

  return (
    <div className="cols">
      <div className="panel">
        <div className={"dice-roll " + (result ? (result.win > 0 ? "win" : "lose") : "")}>
          {result ? result.roll.toFixed(2) : "—"}
        </div>
        <p className="muted" style={{ textAlign: "center" }}>
          {result ? (result.win > 0 ? `You won ${money(result.win)}` : "No luck this time") : "Win if the roll is under the target"}
        </p>
        <label>Target: under {target}
          <input type="range" min={2} max={98} value={target} onChange={(e) => setTarget(Number(e.target.value))} />
        </label>
        <div className="tiles" style={{ marginTop: 12 }}>
          <div className="tile"><div className="muted">Win chance</div><div className="v">{target}%</div></div>
          <div className="tile"><div className="muted">Multiplier</div><div className="v">x{multiplier.toFixed(4)}</div></div>
        </div>
        <div className="row">
          <label style={{ flex: 1 }}>Bet, $<input type="number" min="0.1" step="0.1" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <button className="btn gold" onClick={roll} disabled={busy}>Roll</button>
        </div>
        {error && <p className="error">{error}</p>}
        {history.length > 0 && (
          <table style={{ marginTop: 16 }}>
            <thead><tr><th>#</th><th>Roll</th><th>Target</th><th>Payout</th></tr></thead>
            <tbody>{history.map((h) => (
              <tr key={h.nonce}><td>{h.nonce}</td><td className={h.win > 0 ? "win" : "lose"}>{h.roll.toFixed(2)}</td><td>&lt; {h.target}</td><td>{money(h.win)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
      <div className="panel">
        <h2>Provably fair</h2>
        <p className="muted">Result = HMAC-SHA256(server seed, &quot;client seed:nonce&quot;). The server seed hash is shown before you bet; the seed itself is revealed when you rotate it.</p>
        {seed && (
          <>
            <label>Server seed hash<div className="mono">{seed.server_seed_hash}</div></label>
            <p className="muted">Nonce: {seed.nonce}</p>
            <label>Client seed<input value={clientSeed} onChange={(e) => setClientSeed(e.target.value)} /></label>
            <button className="btn ghost" style={{ marginTop: 10 }} onClick={rotate}>Rotate seed</button>
            {seed.previous_server_seed && (
              <label style={{ marginTop: 12 }}>Previous server seed (for verification)<div className="mono">{seed.previous_server_seed}</div></label>
            )}
          </>
        )}
      </div>
    </div>
  );
}
