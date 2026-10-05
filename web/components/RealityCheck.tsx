"use client";
// Reality check: while the site is open in a visible tab it reports activity once a minute and, at the
// interval the player chose on /responsible-gaming, shows how long they have played and the session result.
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, money, setToken } from "@/lib/api";
import { useMe } from "@/lib/useMe";
import { Session, fmtMinutes } from "@/lib/rg";

const ackKey = (s: Session) => "a2c_rc_" + s.started_at;

export default function RealityCheck() {
  const { me } = useMe();
  const [shown, setShown] = useState<Session | null>(null);

  useEffect(() => {
    if (!me) return;
    let stop = false;
    const ping = async () => {
      if (document.hidden) return;
      try {
        const s = await api<Session>("/api/rg/session", {});
        if (stop || !s.reality_check_minutes) return;
        const due = Math.floor(s.elapsed_seconds / 60 / s.reality_check_minutes);
        let acked = 0;
        try { acked = Number(sessionStorage.getItem(ackKey(s)) || 0); } catch { /* storage blocked */ }
        if (due > acked) setShown(s);
      } catch { /* offline or logged out: try again next minute */ }
    };
    ping();
    const t = setInterval(ping, 60_000);
    return () => { stop = true; clearInterval(t); };
  }, [me?.id]);

  if (!shown) return null;
  const close = () => {
    const due = Math.floor(shown.elapsed_seconds / 60 / shown.reality_check_minutes);
    try { sessionStorage.setItem(ackKey(shown), String(due)); } catch { /* storage blocked */ }
    setShown(null);
  };
  return (
    <div className="modal-backdrop">
      <div className="modal panel reality" role="alertdialog" aria-modal="true" aria-labelledby="rc-title">
        <div className="reality-icon">⏰</div>
        <h2 id="rc-title">Reality check</h2>
        <p>You have been playing for <b>{fmtMinutes(shown.elapsed_seconds / 60)}</b>.</p>
        <div className="kv reality-kv">
          <div><span className="muted">Bets this session</span><b>{shown.bets} · {money(shown.wagered)}</b></div>
          <div><span className="muted">Wins this session</span><b>{money(shown.won)}</b></div>
          <div><span className="muted">Net result</span>
            <b className={shown.net > 0 ? "win" : shown.net < 0 ? "lose" : ""}>{shown.net > 0 ? "+" : ""}{money(shown.net)}</b></div>
          {shown.session_limit_minutes !== null && (
            <div><span className="muted">Daily play-time limit</span><b>{fmtMinutes(shown.played_today_minutes)} of {fmtMinutes(shown.session_limit_minutes)}</b></div>
          )}
        </div>
        <div className="reality-actions">
          <button className="btn" onClick={close}>Continue playing</button>
          <Link className="btn ghost" href="/responsible-gaming" onClick={close}>Limits &amp; breaks</Link>
          <button className="btn ghost" onClick={() => { close(); setToken(null); }}>Log out</button>
        </div>
      </div>
    </div>
  );
}
