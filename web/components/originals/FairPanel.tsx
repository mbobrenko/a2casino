"use client";
// Provably fair panel shared by all A2 Labs: the current seed pair (one pair for all
// originals), seed rotation and an in-browser verifier (WebCrypto) for any game.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { crashPoint, DEFAULT_RTP, diceMultiplier, diceRoll, minesMultiplier, minesPositions, plinkoPath, plinkoTable, RTP_PRESETS, sha256Hex } from "@/lib/fair";

export type Seed = { server_seed_hash: string; client_seed: string; nonce: number; previous_server_seed: string | null };
export type FairGame = "dice" | "crash" | "mines" | "plinko";
/** A past result to load into the verifier. */
export type Pick = {
  client_seed: string; nonce: number; server_seed_hash?: string; rtp?: number;
  mines?: number; rows?: number; risk?: string; target?: number; revealed?: number[]; status?: string;
};

const formulas: Record<FairGame, string> = {
  dice: `HMAC = HMAC-SHA256(server seed, "client seed:nonce")
roll = (first 4 bytes as uint32 mod 10000) / 100   → win if roll < target
multiplier = R × 100 / target   (R = the round's RTP, e.g. 0.99)`,
  crash: `HMAC = HMAC-SHA256(server seed, "client seed:nonce")
H = first 52 bits (13 hex chars), E = 2^52
crash = max(1.00, floor(RTP × E / (E − H)) / 100)   (RTP in percent, e.g. 99)
→ win if crash ≥ auto cash-out; P(crash ≥ m) = R / m`,
  mines: `floats: HMAC-SHA256(server seed, "client seed:nonce:cursor"), cursor = 0, 1, …
each 4 bytes → uint32 / 2^32 (8 floats per HMAC)
tiles = [0..24]; for i = 24 … 1: j = floor(float × (i + 1)), swap(i, j)
mines = first N tiles   (tile = row × 5 + column)
multiplier after n gems = R × C(25, n) / C(25 − N, n)`,
  plinko: `floats: HMAC-SHA256(server seed, "client seed:nonce:cursor"), cursor = 0, 1, …
each 4 bytes → uint32 / 2^32; one float per row: ≥ 0.5 = right, else left
slot = number of rights (0 = far left)   → payout = bet × table[RTP][rows][risk][slot]`,
};

export default function FairPanel({ game, refreshKey, locked, pick, rtp }: { game: FairGame; refreshKey: number; locked?: boolean; pick?: Pick | null; rtp?: number }) {
  const [seed, setSeed] = useState<Seed | null>(null);
  const [clientSeed, setClientSeed] = useState("");
  const [error, setError] = useState("");

  const load = () => api<Seed>("/api/originals/seed").then((s) => { setSeed(s); setClientSeed((c) => c || s.client_seed); });
  useEffect(() => { load().catch((e) => setError(e.message)); }, [refreshKey]);

  async function rotate() {
    setError("");
    try {
      const s = await api<Seed>("/api/originals/seed", { client_seed: clientSeed });
      setSeed(s);
      setClientSeed(s.client_seed);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="panel fair">
      <h2>Provably fair</h2>
      <p className="muted small">
        One seed pair is used for all A2 Labs. The hash of the server seed is shown before you bet; the seed itself is
        revealed when you rotate the pair, so you can check every result made with it. The nonce goes up by one with each bet.
      </p>
      {seed && (
        <>
          <label>Server seed hash (SHA-256)<div className="mono">{seed.server_seed_hash}</div></label>
          <p className="muted small">Next nonce: <b>{seed.nonce}</b></p>
          <label>Client seed<input value={clientSeed} maxLength={64} onChange={(e) => setClientSeed(e.target.value)} /></label>
          <button className="btn ghost" style={{ marginTop: 10 }} onClick={rotate} disabled={locked}
            title={locked ? "Finish the current round first" : undefined}>Rotate seed pair</button>
          {locked && <p className="muted small">Finish the current round before rotating: rotating reveals the server seed.</p>}
          {seed.previous_server_seed && (
            <label style={{ marginTop: 12 }}>Previous server seed (revealed)<div className="mono">{seed.previous_server_seed}</div></label>
          )}
        </>
      )}
      {error && <p className="error">{error}</p>}
      <Verifier game={game} revealed={seed?.previous_server_seed ?? ""} pick={pick} rtp={rtp ?? DEFAULT_RTP} />
    </div>
  );
}

function Verifier({ game: initial, revealed, pick, rtp: currentRtp }: { game: FairGame; revealed: string; pick?: Pick | null; rtp: number }) {
  const [game, setGame] = useState<FairGame>(initial);
  const [server, setServer] = useState("");
  const [client, setClient] = useState("");
  const [nonce, setNonce] = useState("0");
  const [mines, setMines] = useState(3);
  const [rows, setRows] = useState(16);
  const [risk, setRisk] = useState("medium");
  const [rtp, setRtp] = useState(currentRtp);
  const [target, setTarget] = useState("");
  const [gems, setGems] = useState("");
  const [out, setOut] = useState<{ hash: string; text: string; board?: number[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [expectHash, setExpectHash] = useState("");

  useEffect(() => { if (revealed) setServer(revealed); }, [revealed]);
  useEffect(() => { if (!pick) setRtp(currentRtp); }, [currentRtp]);
  useEffect(() => {
    if (!pick) return;
    setGame(initial);
    setClient(pick.client_seed);
    setNonce(String(pick.nonce));
    if (pick.mines) setMines(pick.mines);
    if (pick.rows) setRows(pick.rows);
    if (pick.risk) setRisk(pick.risk);
    setRtp(pick.rtp ?? DEFAULT_RTP);
    setTarget(pick.target != null ? String(pick.target) : "");
    setGems(pick.revealed ? String(pick.revealed.length - (pick.status === "lost" ? 1 : 0)) : "");
    setExpectHash(pick.server_seed_hash ?? "");
    setOut(null);
  }, [pick]);

  async function verify() {
    setBusy(true);
    try {
      const n = Number(nonce) || 0;
      const hash = await sha256Hex(server);
      let text = "";
      let board: number[] | undefined;
      const tg = parseFloat(target);
      if (game === "dice") {
        const roll = await diceRoll(server, client, n);
        text = `Roll ${roll.toFixed(2)}`;
        if (tg >= 2 && tg <= 98) text += roll < tg ? ` < ${tg}: win, x${diceMultiplier(tg, rtp).toFixed(4)} at ${rtp}% RTP` : ` ≥ ${tg}: loss`;
      }
      if (game === "crash") {
        const cp = await crashPoint(server, client, n, rtp);
        text = `Crash point ${cp.toFixed(2)}x at ${rtp}% RTP`;
        if (tg >= 1.01) text += cp >= tg ? ` ≥ ${tg.toFixed(2)}x: cashed out` : ` < ${tg.toFixed(2)}x: loss`;
      }
      if (game === "mines") {
        board = await minesPositions(server, client, n, mines);
        text = `Mines at tiles ${[...board].sort((a, b) => a - b).join(", ")}`;
        const g = parseInt(gems);
        if (g > 0 && g <= 25 - mines) text += ` · ${g} gems = ${minesMultiplier(mines, g, rtp).toFixed(4)}x at ${rtp}% RTP`;
      }
      if (game === "plinko") {
        const p = await plinkoPath(server, client, n, rows);
        text = `Path ${p.path.map((b) => (b ? "R" : "L")).join("")} → slot ${p.slot}, ${plinkoTable(rtp, rows, risk)[p.slot]}x at ${rtp}% RTP`;
      }
      setOut({ hash, text, board });
    } catch {
      setOut({ hash: "", text: "Your browser cannot run WebCrypto here (it needs HTTPS or localhost)." });
    }
    setBusy(false);
  }

  return (
    <details className="verify" open>
      <summary>Verify a result</summary>
      <pre className="formula"><code>{formulas[game]}</code></pre>
      <p className="muted small">
        After rotating, paste the revealed server seed with the client seed and nonce of a bet (shown in your results). The
        check runs in your browser; the SHA-256 of the seed must equal the hash you saw before betting.
      </p>
      <div className="verify-grid">
        <label>Game
          <select value={game} onChange={(e) => setGame(e.target.value as FairGame)}>
            <option value="dice">Dice</option><option value="crash">Crash</option>
            <option value="mines">Mines</option><option value="plinko">Plinko</option>
          </select>
        </label>
        <label>Nonce<input type="number" min={0} value={nonce} onChange={(e) => setNonce(e.target.value)} /></label>
        <label title="The RTP the bet was played at (shown with each result)">RTP, %
          <select value={rtp} onChange={(e) => setRtp(Number(e.target.value))}>
            {RTP_PRESETS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        {(game === "dice" || game === "crash") && (
          <label>{game === "dice" ? "Target" : "Auto cash-out"}<input type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="optional" /></label>
        )}
        {game === "mines" && <label>Gems<input type="number" min={0} max={24} value={gems} onChange={(e) => setGems(e.target.value)} placeholder="optional" /></label>}
        {game === "mines" && (
          <label>Mines<input type="number" min={1} max={24} value={mines} onChange={(e) => setMines(Math.max(1, Math.min(24, Number(e.target.value) || 1)))} /></label>
        )}
        {game === "plinko" && (
          <>
            <label>Rows<select value={rows} onChange={(e) => setRows(Number(e.target.value))}><option>8</option><option>12</option><option>16</option></select></label>
            <label>Risk<select value={risk} onChange={(e) => setRisk(e.target.value)}><option>low</option><option>medium</option><option>high</option></select></label>
          </>
        )}
      </div>
      <label>Server seed<input value={server} onChange={(e) => setServer(e.target.value)} placeholder="revealed after rotation" /></label>
      <label>Client seed<input value={client} onChange={(e) => setClient(e.target.value)} /></label>
      <button className="btn ghost" style={{ marginTop: 10 }} onClick={verify} disabled={busy || !server}>Verify</button>
      {out && (
        <div className="verify-out">
          {out.hash && <label>SHA-256 of the server seed<div className="mono">{out.hash}</div></label>}
          {out.hash && expectHash && (out.hash === expectHash
            ? <p className="ok small">Matches the hash shown before the bet.</p>
            : <p className="error small">Does not match the bet&apos;s server seed hash: use the seed revealed after that bet&apos;s pair was rotated.</p>)}
          <p><b>{out.text}</b></p>
          {out.board && (
            <div className="mini-board">
              {Array.from({ length: 25 }, (_, i) => <span key={i} className={out.board!.includes(i) ? "m" : ""}>{out.board!.includes(i) ? "💣" : ""}</span>)}
            </div>
          )}
        </div>
      )}
    </details>
  );
}
