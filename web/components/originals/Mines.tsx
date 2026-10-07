"use client";
// Mines: 5×5 bevelled tiles that flip to a glowing gem or a bomb; the board is revealed with a
// stagger when the round ends. Auto mode plays a preset selection of tiles each round.
import { useEffect, useRef, useState } from "react";
import { api, money } from "@/lib/api";
import { minesMultiplier } from "@/lib/fair";
import { balanceChanged } from "@/lib/useMe";
import { reducedMotion, useFx } from "./kit/fx";
import { sfx } from "./kit/sound";
import { AutoPanel, BetButton, BetInput, cents, GameShell, NumField, useAuto, useHotkey, useMaxBet, useSession } from "./kit/ui";

type Round = {
  id: number; bet: number; mines: number; revealed: number[]; status: "open" | "lost" | "cashed"; win: number;
  multiplier: number; next_multiplier?: number; payout: number; mines_positions?: number[];
  nonce: number; client_seed: string; server_seed_hash: string; rtp: number; max_win: number; max_win_reached: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MINE_CHIPS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 24];

export default function Mines({ rtp: gameRtp, maxWin: gameMax }: { rtp: number; maxWin: number }) {
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [amount, setAmount] = useState("1.00");
  const [mines, setMines] = useState(3);
  const [round, setRound] = useState<Round | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [last, setLast] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const session = useSession();
  const fx = useFx();
  const { max } = useMaxBet(gameMax);
  const roundRef = useRef<Round | null>(null);
  roundRef.current = round;

  // An unfinished round continues after a reload.
  useEffect(() => {
    api<{ round: Round | null }>("/api/originals/mines/current").then((r) => {
      if (r.round) { setRound(r.round); setMines(r.round.mines); setAmount((r.round.bet / 100).toFixed(2)); }
    }).catch((e) => setError(e.message));
  }, []);

  const open = round?.status === "open";

  function finished(r: Round, quiet = false) {
    setRefresh((n) => n + 1);
    session.record({ bet: r.bet, win: r.win, mult: r.win > 0 ? r.multiplier : 0,
      pick: { client_seed: r.client_seed, nonce: r.nonce, server_seed_hash: r.server_seed_hash, rtp: r.rtp, mines: r.mines, revealed: r.revealed, status: r.status } });
    if (r.status === "cashed") fx.win(r.multiplier, r.win, { quiet: quiet && r.multiplier < 10 });
  }

  async function call(path: string, body: unknown, quiet = false): Promise<Round> {
    const r = (await api<{ round: Round }>(path, body)).round;
    setRound(r);
    if (r.status === "lost") { sfx.boom(); fx.lose(); }
    else if (path.endsWith("reveal")) sfx.gem(r.revealed.length);
    if (r.status !== "open") finished(r, quiet);
    balanceChanged();
    return r;
  }
  const guard = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try { await fn(); } catch (e: any) { setError(e.message); }
    setBusy(false);
  };

  const start = () => guard(async () => { setLast(null); fx.clear(); sfx.bet(); await call("/api/originals/mines/start", { amount: cents(amount), mines }); setRefresh((n) => n + 1); });
  const reveal = (tile: number) => guard(async () => { setLast(tile); await call("/api/originals/mines/reveal", { tile }); });
  const cashout = () => guard(async () => { await call("/api/originals/mines/cashout", {}); });
  const randomTile = () => {
    const free = Array.from({ length: 25 }, (_, i) => i).filter((i) => !round?.revealed.includes(i));
    if (free.length) reveal(free[(Math.random() * free.length) | 0]);
  };

  // Auto: start, reveal the selected tiles one by one, cash out if every one is a gem.
  async function autoRound(stake: number) {
    if (selected.length === 0) throw new Error("Pick the tiles to reveal on the board first");
    setLast(null);
    fx.clear();
    let r = await call("/api/originals/mines/start", { amount: stake, mines }, true);
    for (const tile of selected) {
      if (r.status !== "open") break;
      await sleep(reducedMotion() ? 0 : 170);
      setLast(tile);
      r = await call("/api/originals/mines/reveal", { tile }, true);
    }
    if (r.status === "open") r = await call("/api/originals/mines/cashout", {}, true);
    return { bet: r.bet, win: r.win, done: sleep(r.status === "lost" ? 700 : 450) };
  }
  const auto = useAuto({ amount, setAmount, play: autoRound, onError: setError, gap: 250 });
  const toggleSel = (i: number) => {
    sfx.click();
    setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : s.length < 25 - mines ? [...s, i] : s));
  };

  const manualAction = () => {
    if (busy) return;
    if (!open) start();
    else if ((round?.revealed.length ?? 0) > 0) cashout();
  };
  useHotkey(() => (mode === "auto" ? (auto.running ? auto.stop() : auto.start()) : manualAction()), mode === "auto" || !busy);

  const n = round?.revealed.length ?? 0;
  const rtp = open ? round!.rtp : gameRtp;
  const maxWin = open ? round!.max_win : gameMax;
  const stake = cents(amount);
  const nextMult = open ? round!.next_multiplier : minesMultiplier(mines, Math.max(1, mode === "auto" ? selected.length : 1), rtp);
  const curMult = open ? round!.multiplier : 1;
  const maxMult = minesMultiplier(mines, 25 - mines, rtp);
  const ended = round && !open;
  const lockSetup = open || auto.running;

  const controls = (
    <>
      <BetInput value={amount} onChange={setAmount} disabled={lockSetup || busy} max={max} />
      <div className="og-field">
        <div className="og-label"><span>Mines</span><span className="og-label-r">{25 - mines} gems</span></div>
        <div className="mines-chips" role="radiogroup" aria-label="Number of mines">
          {MINE_CHIPS.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mines === m} className={mines === m ? "on" : ""} disabled={lockSetup}
              onClick={() => { sfx.click(); setMines(m); setSelected((s) => s.slice(0, 25 - m)); }}>{m}</button>
          ))}
        </div>
        <div className="mines-range">
          <input type="range" min={1} max={24} value={mines} disabled={lockSetup} aria-label="Mines (fine)" onChange={(e) => { setMines(Number(e.target.value)); setSelected((s) => s.slice(0, 25 - Number(e.target.value))); }} />
        </div>
      </div>
      {mode === "manual" && open && (
        <div className="mines-live">
          <div><small>Current</small><b>{curMult.toFixed(4)}×</b></div>
          <div><small>Next gem</small><b>{nextMult ? nextMult.toFixed(4) + "×" : "—"}</b></div>
          <div className="wide"><small>Profit on cash-out</small><b className="pos">+{money(Math.max(0, round!.payout - round!.bet))}</b></div>
        </div>
      )}
      {mode === "manual" && !open && (
        <NumField label="First gem pays" value={(nextMult ?? 1).toFixed(4)} readOnly suffix="×" right={`max ${maxMult >= 1e6 ? maxMult.toExponential(2) : maxMult.toFixed(2)}×`} />
      )}
      {mode === "auto" && (
        <>
          <NumField label="Tiles selected" value={String(selected.length)} readOnly right={selected.length ? `pays ${minesMultiplier(mines, selected.length, rtp).toFixed(4)}×` : "tap tiles on the board"}
            suffix={<button type="button" className="og-mini-link" disabled={auto.running || !selected.length} onClick={() => setSelected([])}>Clear</button>} />
          <AutoPanel auto={auto} />
        </>
      )}
      {mode === "manual" && (open ? (
        <>
          <BetButton variant="cash" onClick={cashout} disabled={busy || n === 0}>{n === 0 ? "Pick a tile" : `Cash out ${money(round!.payout)}`}</BetButton>
          <button type="button" className="og-ghost" onClick={randomTile} disabled={busy}>Pick random tile</button>
        </>
      ) : <BetButton onClick={start} disabled={busy}>Bet</BetButton>)}
      {mode === "auto" && (auto.running
        ? <BetButton variant="stop" onClick={auto.stop}>Stop auto-bet</BetButton>
        : <BetButton onClick={auto.start} disabled={open || selected.length === 0}>{open ? "Finish the open round" : "Start auto-bet"}</BetButton>)}
      {maxWin > 0 && stake * maxMult > maxWin && <p className="og-note">Maximum win {money(maxWin)} per bet: once reached, the round cashes out.</p>}
      {open && round!.rtp !== gameRtp && <p className="og-note">This round plays at its starting RTP of {round!.rtp}%.</p>}
      {error && <p className="og-error" role="alert">{error}</p>}
    </>
  );

  const order = round?.mines_positions ? revealOrder(last) : null;
  const stage = (
    <div className={"mines-stage" + (ended ? " ended " + round!.status : "")}>
      <div className={"mines-board2" + (round?.status === "lost" ? " shake" : "")}>
        {Array.from({ length: 25 }, (_, i) => {
          const revealed = round?.revealed.includes(i);
          const mine = round?.mines_positions?.includes(i);
          const showAll = ended && round?.mines_positions;
          const face = revealed || showAll ? (mine ? "bomb" : "gem") : "";
          const picked = mode === "auto" && selected.includes(i) && !open && !revealed;
          const cls = ["mt", face && "flip", face, revealed ? "hit" : face ? "ghost" : "", last === i && "last", picked && "sel"].filter(Boolean).join(" ");
          const delay = !revealed && order ? order[i] * 28 : 0;
          const clickable = mode === "manual" ? open && !revealed && !busy : !auto.running && !open;
          return (
            <button key={i} type="button" className={cls} style={{ "--d": delay + "ms" } as React.CSSProperties} aria-label={`Tile ${i + 1}${face ? ": " + face : ""}`}
              disabled={!clickable} onClick={() => (mode === "manual" ? reveal(i) : toggleSel(i))}>
              <span className="mt-face back" />
              <span className="mt-face front">{face === "gem" ? <Gem /> : face === "bomb" ? <Bomb boom={!!revealed} /> : null}</span>
            </button>
          );
        })}
      </div>
      {ended && round && (
        <div className={"mines-banner " + round.status}>
          {round.status === "cashed" ? <><b>{round.multiplier.toFixed(2)}×</b><span>+{money(round.win)}{round.max_win_reached ? " · max win" : ""}</span></> : <><b>Boom</b><span>{n - 1} gem{n - 1 === 1 ? "" : "s"} found</span></>}
        </div>
      )}
      {!round && mode === "manual" && <div className="mines-hint">Choose your mines and press Bet</div>}
    </div>
  );

  return (
    <GameShell game="mines" mode={mode} onMode={setMode} modeLocked={auto.running || open} controls={controls} stage={<>{stage}{fx.layer}</>} glow={fx.glow}
      session={session} fair={{ refreshKey: refresh, locked: open }} rtp={rtp} maxWin={maxWin} />
  );
}

/** Reveal-all stagger: tiles closer to the last pick flip first. */
function revealOrder(from: number | null) {
  const c = from ?? 12;
  const cx = c % 5, cy = Math.floor(c / 5);
  return Array.from({ length: 25 }, (_, i) => Math.hypot((i % 5) - cx, Math.floor(i / 5) - cy) * 2.2);
}

function Gem() {
  return (
    <svg viewBox="0 0 64 64" className="gem-svg" aria-hidden>
      <defs>
        <linearGradient id="gm1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b6ffe0" /><stop offset="1" stopColor="#11c98a" /></linearGradient>
        <linearGradient id="gm2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3dfcb4" /><stop offset="1" stopColor="#048a5c" /></linearGradient>
      </defs>
      <path d="M14 22 22 10h20l8 12-18 32z" fill="url(#gm2)" />
      <path d="M14 22h36L32 54z" fill="url(#gm1)" opacity=".85" />
      <path d="M22 10 26 22 32 10 38 22 42 10" fill="none" stroke="#e9fff6" strokeWidth="1.5" opacity=".8" />
      <path d="M14 22h36M26 22l6 32 6-32" fill="none" stroke="#e9fff6" strokeWidth="1.2" opacity=".55" />
      <circle cx="24" cy="16" r="2" fill="#fff" />
    </svg>
  );
}
function Bomb({ boom }: { boom: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={"bomb-svg" + (boom ? " boom" : "")} aria-hidden>
      {boom && <g className="blast"><circle cx="32" cy="34" r="28" fill="#ff7a3d" opacity=".35" /><path d="M32 4l5 14 12-9-4 14 15-1-12 9 12 9-15-1 4 14-12-9-5 14-5-14-12 9 4-14-15 1 12-9-12-9 15 1-4-14 12 9z" fill="#ffb347" opacity=".55" /></g>}
      <defs><radialGradient id="bm1" cx=".35" cy=".35" r=".7"><stop offset="0" stopColor="#6b6f86" /><stop offset="1" stopColor="#0d0e17" /></radialGradient></defs>
      <circle cx="30" cy="36" r="17" fill="url(#bm1)" />
      <rect x="35" y="15" width="9" height="8" rx="2" transform="rotate(35 39 19)" fill="#3a3d52" />
      <path d="M42 15c3-5 8-5 10-2" fill="none" stroke="#c9a46a" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="53" cy="12" r="3.5" fill="#ffd166" /><circle cx="53" cy="12" r="1.6" fill="#fff" />
      <circle cx="24" cy="30" r="4" fill="#fff" opacity=".25" />
    </svg>
  );
}
