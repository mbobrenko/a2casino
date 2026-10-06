"use client";
import { useEffect, useState } from "react";
import { api, money } from "@/lib/api";
import { minesMultiplier } from "@/lib/fair";
import { balanceChanged } from "@/lib/useMe";
import FairPanel, { Pick } from "./FairPanel";

type Round = {
  id: number; bet: number; mines: number; revealed: number[]; status: "open" | "lost" | "cashed"; win: number;
  multiplier: number; next_multiplier?: number; payout: number; mines_positions?: number[];
  nonce: number; client_seed: string; server_seed_hash: string;
};

export default function Mines() {
  const [amount, setAmount] = useState("1.00");
  const [mines, setMines] = useState(3);
  const [round, setRound] = useState<Round | null>(null);
  const [history, setHistory] = useState<Round[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [pick, setPick] = useState<Pick | null>(null);
  const [last, setLast] = useState<number | null>(null);

  // An unfinished round continues after a reload.
  useEffect(() => {
    api<{ round: Round | null }>("/api/originals/mines/current").then((r) => {
      if (r.round) { setRound(r.round); setMines(r.round.mines); setAmount((r.round.bet / 100).toFixed(2)); }
    }).catch((e) => setError(e.message));
  }, []);

  const open = round?.status === "open";

  async function call(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ round: Round }>(path, body);
      setRound(r.round);
      if (r.round.status !== "open") {
        setHistory((h) => [r.round, ...h].slice(0, 10));
        setRefresh((n) => n + 1);
      }
      balanceChanged();
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  }

  const start = () => { setLast(null); call("/api/originals/mines/start", { amount: Math.round(parseFloat(amount) * 100), mines }).then(() => setRefresh((n) => n + 1)); };
  const reveal = (tile: number) => { setLast(tile); call("/api/originals/mines/reveal", { tile }); };
  const cashout = () => call("/api/originals/mines/cashout", {});

  const n = round?.revealed.length ?? 0;
  const nextMult = open ? round!.next_multiplier : minesMultiplier(mines, 1);

  return (
    <div className="cols">
      <div className="panel">
        <div className={"mines-board" + (round && !open ? " over" : "")}>
          {Array.from({ length: 25 }, (_, i) => {
            const revealed = round?.revealed.includes(i);
            const mine = round?.mines_positions?.includes(i);
            const cls = revealed ? (mine ? "tile-m boom" : "tile-m gem") : round && !open ? (mine ? "tile-m mine dim" : "tile-m dim") : "tile-m";
            return (
              <button key={i} className={cls + (last === i ? " last" : "")} disabled={!open || revealed || busy} onClick={() => reveal(i)} aria-label={`Tile ${i + 1}`}>
                <span>{revealed ? (mine ? "💥" : "💎") : round && !open && mine ? "💣" : ""}</span>
              </button>
            );
          })}
        </div>
        <div className="mines-status">
          {!round && <span className="muted">Pick the number of mines and start a round</span>}
          {open && <span>Revealed {n} · current <b>{round!.multiplier.toFixed(4)}x</b>{nextMult && <> · next {nextMult.toFixed(4)}x</>}</span>}
          {round?.status === "lost" && <span className="lose">Boom! You hit a mine.</span>}
          {round?.status === "cashed" && <span className="win">Cashed out {round.multiplier.toFixed(4)}x · won {money(round.win)}</span>}
        </div>
        <div className="row">
          <label style={{ flex: 1 }}>Bet, $<input type="number" min="0.1" step="0.1" value={amount} disabled={open} onChange={(e) => setAmount(e.target.value)} /></label>
          <label style={{ flex: 1 }}>Mines
            <select value={mines} disabled={open} onChange={(e) => setMines(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
          </label>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          {open ? (
            <button className="btn gold wide" onClick={cashout} disabled={busy || n === 0}>
              {n === 0 ? "Reveal a tile" : `Cash out ${money(round!.payout)}`}
            </button>
          ) : (
            <button className="btn gold wide" onClick={start} disabled={busy}>Start · first gem {nextMult?.toFixed(4)}x</button>
          )}
        </div>
        {error && <p className="error">{error}</p>}
        {history.length > 0 && (
          <div className="table-wrap">
            <table style={{ marginTop: 16 }}>
              <thead><tr><th>Nonce</th><th>Mines</th><th>Gems</th><th>Payout</th><th></th></tr></thead>
              <tbody>{history.map((h) => (
                <tr key={h.id}>
                  <td>{h.nonce}</td><td>{h.mines}</td>
                  <td>{h.revealed.length - (h.status === "lost" ? 1 : 0)}</td>
                  <td className={h.win > 0 ? "win" : "lose"}>{money(h.win)}</td>
                  <td><button className="link-btn" onClick={() => setPick({ ...h })}>Verify</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      <FairPanel game="mines" refreshKey={refresh} pick={pick} locked={open} />
    </div>
  );
}
