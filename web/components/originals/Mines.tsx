"use client";
// Mines: 5×5 glossy raised tiles that flip in 3D into a recessed cell holding a faceted gem or a
// mine; the rest of the board is revealed in a dimmed wave when the round ends. Auto mode plays a
// preset selection of tiles each round.
import "@/app/og-mines.css";
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
  const gemsTotal = 25 - mines;
  const hudMult = round && round.status !== "lost" ? round.multiplier : 1;
  const hudNext = nextMult ? nextMult.toFixed(2) + "×" : "—";
  const stage = (
    <div className={"mx-stage" + (ended ? " ended " + round!.status : open ? " live" : "")}>
      <MinesDefs />
      <div className="mx-amb" aria-hidden>
        {Array.from({ length: 12 }, (_, i) => <i key={i} style={{ "--i": i } as React.CSSProperties} />)}
      </div>
      {round?.status === "lost" && <div key={"flash" + round.id} className="mx-flash" aria-hidden />}
      <div className="mx-hud" aria-hidden>
        <div className="mx-chip mines"><MiniMine /><b>{mines}</b><small>mines</small></div>
        <div className="mx-chip gems">
          <MiniGem /><b>{n}<em>/{gemsTotal}</em></b>
          <span className="mx-prog"><span style={{ width: (n / gemsTotal) * 100 + "%" }} /></span>
        </div>
        <div key={"m" + n + "-" + (round?.id ?? 0)} className={"mx-chip mult" + (open && n > 0 ? " pop" : "")}>
          <small>{open || ended ? "Multiplier" : mode === "auto" ? "Pays" : "First gem"}</small><b>{open || ended ? hudMult.toFixed(2) + "×" : hudNext}</b>
        </div>
        {open && <div key={"n" + n} className="mx-chip next pop"><small>Next gem</small><b>{hudNext}</b></div>}
      </div>
      <div className="mx-frame">
        <i className="mx-stud tl" /><i className="mx-stud tr" /><i className="mx-stud bl" /><i className="mx-stud br" />
        <div className={"mx-board" + (round?.status === "lost" ? " shake" : "") + (round?.status === "cashed" ? " cashed" : "")}>
          {Array.from({ length: 25 }, (_, i) => {
            const revealed = round?.revealed.includes(i);
            const mine = round?.mines_positions?.includes(i);
            const showAll = ended && round?.mines_positions;
            const face = revealed || showAll ? (mine ? "bomb" : "gem") : "";
            const picked = mode === "auto" && selected.includes(i) && !open && !revealed;
            const cls = ["mx-tile", face && "flip", face, revealed ? "hit" : face ? "ghost" : "", last === i && "last", picked && "sel"].filter(Boolean).join(" ");
            const delay = !revealed && order ? 160 + order[i] * 34 : 0;
            const clickable = mode === "manual" ? open && !revealed && !busy : !auto.running && !open;
            const g = revealed ? round!.revealed.indexOf(i) : 0;
            return (
              <button key={i} type="button" className={cls} style={{ "--d": delay + "ms", "--g": g } as React.CSSProperties}
                aria-label={`Tile ${i + 1}${face ? ": " + face : ""}`} disabled={!clickable} onClick={() => (mode === "manual" ? reveal(i) : toggleSel(i))}>
                <span className="mx-inner">
                  <span className="mx-face mx-cover"><span className="mx-sheen" /><span className="mx-mark" /></span>
                  <span className="mx-face mx-cell">
                    {face === "gem" ? <Gem /> : face === "bomb" ? <Mine boom={!!revealed} /> : null}
                    {revealed && face === "gem" && <Burst kind="gem" />}
                    {revealed && face === "bomb" && <><span className="mx-shock" /><span className="mx-shock two" /><Burst kind="fire" /></>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {ended && round && (
        <div className={"mx-banner " + round.status}>
          {round.status === "cashed"
            ? <><small>Cashed out</small><b>{round.multiplier.toFixed(2)}×</b><span>+{money(round.win)}{round.max_win_reached ? " · max win" : ""}</span></>
            : <><small>Mine hit</small><b>Boom!</b><span>{n - 1} gem{n - 1 === 1 ? "" : "s"} found</span></>}
        </div>
      )}
      {!round && mode === "manual" && <div className="mx-hint">Choose your mines and press <b>Bet</b></div>}
      {mode === "auto" && !open && !auto.running && selected.length === 0 && <div className="mx-hint">Tap tiles to pick them for auto-bet</div>}
    </div>
  );

  return (
    <GameShell game="mines" mode={mode} onMode={setMode} modeLocked={auto.running || open} controls={controls} stage={<>{stage}{fx.layer}</>} glow={fx.glow}
      stageClass="mx-bg" session={session} fair={{ refreshKey: refresh, locked: open }} rtp={rtp} maxWin={maxWin} />
  );
}

/** Reveal-all stagger: tiles closer to the last pick flip first. */
function revealOrder(from: number | null) {
  const c = from ?? 12;
  const cx = c % 5, cy = Math.floor(c / 5);
  return Array.from({ length: 25 }, (_, i) => Math.hypot((i % 5) - cx, Math.floor(i / 5) - cy) * 2.2);
}

/** Shared gradients for every gem / mine on the board (one copy in the DOM). */
function MinesDefs() {
  return (
    <svg className="mx-defs" width="0" height="0" aria-hidden focusable="false">
      <defs>
        <linearGradient id="mxGloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".75" /><stop offset=".45" stopColor="#fff" stopOpacity=".08" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="mxMine" cx=".36" cy=".32" r=".75">
          <stop offset="0" stopColor="#8a8fa8" /><stop offset=".45" stopColor="#3a3d52" /><stop offset="1" stopColor="#08090f" />
        </radialGradient>
        <radialGradient id="mxCore" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff6c9" /><stop offset=".4" stopColor="#ff5a3c" /><stop offset="1" stopColor="#ff2d55" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/** Brilliant-cut emerald: flat facets in graded greens, a gloss pass and two twinkling glints. */
function Gem() {
  return (
    <svg viewBox="0 0 64 64" className="mx-gem" aria-hidden>
      <g className="mx-gem-body">
        <path d="M6 25 18 13 24 25z" fill="#7dfbc9" />
        <path d="M18 13h14l-8 12z" fill="#c6ffe8" />
        <path d="M32 13 40 25H24z" fill="#9dfdd6" />
        <path d="M32 13h14l-6 12z" fill="#5ef0b4" />
        <path d="M46 13 58 25H40z" fill="#25d394" />
        <path d="M6 25h18l8 33z" fill="#2fe3a0" />
        <path d="M24 25h16l-8 33z" fill="#16c584" />
        <path d="M40 25h18L32 58z" fill="#078f5e" />
        <path d="M6 25 18 13h28l12 12-26 33z" fill="url(#mxGloss)" opacity=".55" />
        <path d="M6 25 18 13h28l12 12-26 33zM6 25h52M24 25l8 33 8-33M18 13l6 12 8-12 8 12 6-12" fill="none" stroke="#eafff6" strokeWidth="1" strokeLinejoin="round" opacity=".7" />
      </g>
      <path className="mx-glint a" d="M20 8l1.6 4.4L26 14l-4.4 1.6L20 20l-1.6-4.4L14 14l4.4-1.6z" fill="#fff" />
      <path className="mx-glint b" d="M50 30l1.1 3L54 34l-2.9 1.1L50 38l-1.1-2.9L46 34l2.9-1z" fill="#fff" />
    </svg>
  );
}

/** Naval mine: spiked sphere with a glowing core. */
function Mine({ boom }: { boom: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={"mx-mine" + (boom ? " boom" : "")} aria-hidden>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <g key={a} transform={`rotate(${a} 32 33)`}>
          <rect x="30" y="8" width="4" height="10" rx="1.5" fill="#2b2d3d" />
          <circle cx="32" cy="8.5" r="3" fill="#565a73" />
        </g>
      ))}
      <circle cx="32" cy="33" r="17" fill="url(#mxMine)" />
      <circle cx="32" cy="33" r="17" fill="none" stroke="#000" strokeOpacity=".4" />
      <circle className="mx-core" cx="32" cy="33" r="7" fill="url(#mxCore)" />
      <circle cx="32" cy="33" r="2.6" fill="#ffe7a8" />
      <ellipse cx="25" cy="25" rx="5" ry="3.2" transform="rotate(-35 25 25)" fill="#fff" opacity=".35" />
    </svg>
  );
}

/** One-shot particle pop (CSS only): sparks fly out from the tile centre. */
function Burst({ kind }: { kind: "gem" | "fire" }) {
  const count = kind === "gem" ? 10 : 14;
  return (
    <span className={"mx-burst " + kind} aria-hidden>
      {Array.from({ length: count }, (_, k) => (
        <i key={k} style={{ "--a": (360 / count) * k + (k % 2 ? 12 : 0) + "deg", "--r": (kind === "gem" ? 34 : 50) + (k % 3) * 10 + "px" } as React.CSSProperties} />
      ))}
    </span>
  );
}

const MiniGem = () => (
  <svg viewBox="0 0 64 64" width="16" height="16" aria-hidden><path d="M6 25 18 13h28l12 12-26 33z" fill="#2fe3a0" /><path d="M6 25h52L32 58z" fill="#0aa56c" /></svg>
);
const MiniMine = () => (
  <svg viewBox="0 0 64 64" width="16" height="16" aria-hidden><circle cx="32" cy="34" r="18" fill="#ff4d6d" /><path d="M32 6v10M32 52v8M4 34h10M50 34h10M12 14l7 7M45 47l7 7M52 14l-7 7M19 47l-7 7" stroke="#ff4d6d" strokeWidth="6" strokeLinecap="round" /></svg>
);

