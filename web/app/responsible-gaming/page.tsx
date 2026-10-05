"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, money } from "@/lib/api";
import { useMe } from "@/lib/useMe";
import { Limit, RGState, Session, durationText, exclusionText, fmtDateTime, fmtMinutes } from "@/lib/rg";

const kinds = [
  { kind: "deposit", title: "Deposit limits", icon: "💳", hint: "The most you can deposit. Deposits that would go over the limit are refused." },
  { kind: "loss", title: "Loss limits", icon: "📉", hint: "Your net loss: real-money bets minus real-money wins. Bets that could take you over it are refused." },
  { kind: "wager", title: "Wagering limits", icon: "🎲", hint: "The total you can bet, real and bonus money. Bets over the limit are refused." },
] as const;
const periods = [["day", "Daily", "24 hours"], ["week", "Weekly", "7 days"], ["month", "Monthly", "30 days"]] as const;
const realityOptions = [0, 15, 30, 45, 60, 90, 120];
const sessionOptions = [30, 60, 90, 120, 180, 240, 360, 480];
const timeouts = ["24h", "7d", "30d", "6w"];
const exclusions = ["6m", "1y", "5y", "permanent"];

const cents = (s: string) => Math.round(parseFloat(s.replace(",", ".")) * 100);

export default function ResponsibleGamingPage() {
  const { me, ready, refresh } = useMe();
  const [st, setSt] = useState<RGState | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = () => {
    api<RGState>("/api/rg").then(setSt).catch((e) => setError(e.message));
    api<Session>("/api/rg/session", {}).then(setSession).catch(() => {});
  };
  useEffect(() => { if (me) load(); }, [me?.id]);

  const run = async (fn: () => Promise<string>) => {
    setMsg(""); setError("");
    try { setMsg(await fn()); load(); refresh(); } catch (e: any) { setError(e.message); }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (ready && !me) return <div className="panel"><h2>Log in to manage your limits</h2><Link className="btn" href="/login">Log in</Link></div>;
  if (!me || !st) return error ? <p className="error">{error}</p> : null;

  const limit = (kind: string, period: string) => st.limits.find((l) => l.kind === kind && l.period === period);
  const setLimit = (kind: string, period: string, amount: number | null, label: string) => run(async () => {
    const r = await api<{ applied: boolean; effective_at?: string }>("/api/rg/limits", { kind, period, amount });
    if (r.applied) return amount === null ? `${label} removed` : `${label} set. It applies now.`;
    return `${label} change saved. For your protection it takes effect after 24 hours, on ${fmtDateTime(r.effective_at!)}.`;
  });
  const sess = limit("session", "day");
  const excl = st.exclusion;

  return (
    <>
      <h1>Responsible gaming</h1>
      <p className="muted rg-lead">
        Tools to keep gambling fun. Setting or lowering a limit takes effect immediately; raising or removing one takes
        effect after a 24-hour cooling-off period. Windows are rolling: a daily limit covers the last 24 hours, weekly the
        last 7 days, monthly the last 30 days. Read our <Link className="terms-link" href="/legal/responsible-gaming">Responsible Gaming policy</Link> for
        advice and where to get help.
      </p>
      {msg && <p className="ok rg-msg">{msg}</p>}
      {error && <p className="error rg-msg">{error}</p>}

      {excl && (
        <div className={"panel rg-excl " + excl.kind}>
          <div className="rg-excl-icon">{excl.kind === "timeout" ? "⏸️" : "🛑"}</div>
          <div>
            <h2>{excl.kind === "timeout" ? "Time-out" : "Self-exclusion"} in force</h2>
            <p>{exclusionText(excl)}</p>
            <p className="muted small">
              You can still log in, see your balance and <Link className="terms-link" href="/wallet">withdraw</Link>. Deposits,
              bets, bonuses and promo codes are unavailable{excl.kind === "self_exclusion" ? ", and you will not receive offers" : ""}.
              {excl.by_staff && " This restriction was applied by our team."}
            </p>
            {excl.kind === "self_exclusion" && excl.period_over && !excl.reopen_at && (
              <button className="btn ghost" onClick={() => run(async () => {
                await api("/api/rg/reopen", {});
                return "Request received. Your account reopens in 24 hours.";
              })}>Ask to reopen my account</button>
            )}
          </div>
        </div>
      )}

      {session && (
        <div className="tiles rg-session">
          <div className="tile"><div className="muted">This session</div><div className="v">{fmtMinutes(session.elapsed_seconds / 60)}</div></div>
          <div className="tile"><div className="muted">Net result this session</div>
            <div className={"v " + (session.net > 0 ? "win" : session.net < 0 ? "lose" : "")}>{session.net > 0 ? "+" : ""}{money(session.net)}</div></div>
          <div className="tile"><div className="muted">Played in the last 24 hours</div><div className="v">{fmtMinutes(session.played_today_minutes)}</div></div>
          <div className="tile"><div className="muted">Bets this session</div><div className="v">{session.bets}</div></div>
        </div>
      )}

      <div className="cards rg-cards">
        {kinds.map((k) => (
          <div key={k.kind} className="panel">
            <h2>{k.icon} {k.title}</h2>
            <p className="muted small">{k.hint}</p>
            {periods.map(([p, label, window]) => (
              <LimitRow key={p} label={`${label} ${k.kind} limit`} short={label} window={window} limit={limit(k.kind, p)} money
                onSave={(v) => setLimit(k.kind, p, v, `${label} ${k.kind} limit`)} />
            ))}
          </div>
        ))}
      </div>

      <div className="cols" style={{ marginTop: 16 }}>
        <div className="panel">
          <h2>⏰ Reality check</h2>
          <p className="muted small">A reminder pops up at this interval showing how long you have been playing and your net result for the session.</p>
          <div className="row">
            <label style={{ flex: 1 }}>Remind me every
              <select value={st.reality_check_minutes} onChange={(e) => run(async () => {
                const m = Number(e.target.value);
                await api("/api/rg/reality-check", { minutes: m });
                return m ? `Reality check every ${m} minutes` : "Reality check turned off";
              })}>
                {realityOptions.map((m) => <option key={m} value={m}>{m ? `${m} minutes` : "Off"}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="panel">
          <h2>⌛ Daily play-time limit</h2>
          <p className="muted small">The most time you can spend playing in any 24 hours. Once reached, games and bets are blocked until your time drops below it.</p>
          <LimitRow label="Daily play-time limit" short="Play time" window="24 hours" limit={sess} options={sessionOptions}
            onSave={(v) => setLimit("session", "day", v, "Daily play-time limit")} />
        </div>
      </div>

      <h2 style={{ marginTop: 28 }}>Take a break</h2>
      <div className="cols">
        <div className="panel">
          <h2>⏸️ Time-out</h2>
          <p className="muted small">A short break from playing. Your account reopens by itself at the end. You can still log in to withdraw.</p>
          <div className="rg-buttons">
            {timeouts.map((d) => <button key={d} className="btn ghost" onClick={() => setConfirm(d)}>{durationText[d]}</button>)}
          </div>
        </div>
        <div className="panel">
          <h2>🛑 Self-exclusion</h2>
          <p className="muted small">For a longer break if you feel you are losing control. It cannot be undone or shortened. At the end the account stays closed until you ask to reopen it, and reopens 24 hours after your request.</p>
          <div className="rg-buttons">
            {exclusions.map((d) => <button key={d} className="btn ghost danger" onClick={() => setConfirm(d)}>{durationText[d]}</button>)}
          </div>
        </div>
      </div>

      {confirm && (
        <ConfirmExclusion duration={confirm} onClose={() => setConfirm(null)} onConfirm={() => run(async () => {
          setConfirm(null);
          await api("/api/rg/exclude", { duration: confirm });
          return timeouts.includes(confirm) ? `Time-out started for ${durationText[confirm].toLowerCase()}.` : "Self-exclusion started.";
        })} />
      )}
    </>
  );
}

function LimitRow({ label, short, window, limit, money: isMoney, options, onSave }: {
  label: string; short: string; window: string; limit?: Limit; money?: boolean; options?: number[];
  onSave: (v: number | null) => void;
}) {
  const [value, setValue] = useState("");
  const fmt = (v: number) => (isMoney ? money(v) : fmtMinutes(v));
  const cur = limit?.amount ?? null;
  const used = limit?.used ?? 0;
  const pct = cur ? Math.min(100, (Math.max(used, 0) / cur) * 100) : 0;
  const save = () => {
    const v = isMoney ? cents(value) : Number(value);
    if (!v || v <= 0) return;
    onSave(v);
    setValue("");
  };
  return (
    <div className="rg-limit">
      <div className="rg-limit-head">
        <b>{short}</b>
        <span className="muted small">{cur !== null ? <>{fmt(Math.max(used, 0))} of {fmt(cur)} used · last {window}</> : "No limit"}</span>
      </div>
      {cur !== null && <div className={"progress" + (used >= cur ? " over" : "")}><div style={{ width: `${pct}%` }} /></div>}
      {limit?.pending && (
        <p className="rg-pending small">
          {limit.pending_amount === null ? "Removal" : `Change to ${fmt(limit.pending_amount)}`} takes effect on {fmtDateTime(limit.effective_at!)}
        </p>
      )}
      <div className="rg-limit-form">
        {options ? (
          <select aria-label={label} value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">Choose…</option>
            {options.map((m) => <option key={m} value={m}>{fmtMinutes(m)}</option>)}
          </select>
        ) : (
          <input aria-label={label} inputMode="decimal" placeholder={cur !== null ? "New limit, $" : "Limit, $"} value={value} onChange={(e) => setValue(e.target.value)} />
        )}
        <button className="btn" disabled={!value} onClick={save}>{cur !== null ? "Change" : "Set"}</button>
        {cur !== null && !(limit?.pending && limit.pending_amount === null) && (
          <button className="btn ghost" onClick={() => onSave(null)}>Remove</button>
        )}
      </div>
    </div>
  );
}

function ConfirmExclusion({ duration, onClose, onConfirm }: { duration: string; onClose: () => void; onConfirm: () => void }) {
  const [ok, setOk] = useState(false);
  const timeout = timeouts.includes(duration);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal panel" role="dialog" aria-modal="true">
        <h2>{timeout ? `Take a ${durationText[duration].toLowerCase()} time-out?` : duration === "permanent" ? "Exclude yourself permanently?" : `Self-exclude for ${durationText[duration].toLowerCase()}?`}</h2>
        <ul className="rg-list">
          <li>You will not be able to deposit, play, claim bonuses or use promo codes{timeout ? ` for ${durationText[duration].toLowerCase()}` : ""}.</li>
          <li>You can still log in to see your balance and withdraw your real balance.</li>
          <li>Bonuses waiting for a deposit are cancelled.</li>
          {timeout
            ? <li>The time-out cannot be cancelled; your account reopens automatically when it ends.</li>
            : <li>Self-exclusion <b>cannot be undone or shortened</b>, even by our support team. {duration === "permanent" ? "Your account will never reopen." : "When it ends, your account reopens only 24 hours after you ask for it."}</li>}
        </ul>
        <label className="check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> I understand and want to continue</label>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className={"btn" + (timeout ? "" : " danger-solid")} disabled={!ok} onClick={onConfirm}>{timeout ? "Start time-out" : "Self-exclude"}</button>
        </div>
      </div>
    </div>
  );
}
