"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, fmtDate, money } from "@/lib/api";
import { balanceChanged, useMe } from "@/lib/useMe";
import { VipLevel, VipStatus, levelIcon } from "@/lib/labels";

export default function Vip() {
  const { me, ready } = useMe();
  const [levels, setLevels] = useState<VipLevel[]>([]);
  const [status, setStatus] = useState<VipStatus | null>(null);
  const [msg, setMsg] = useState<Partial<Record<"cashback" | "rakeback", { ok: boolean; text: string }>>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ levels: VipLevel[] }>("/api/vip/levels").then((r) => setLevels(r.levels)).catch((e) => setError(e.message));
  }, []);

  const reload = () => api<{ levels: VipLevel[]; status: VipStatus }>("/api/vip").then((r) => setStatus(r.status)).catch(() => {});
  useEffect(() => {
    if (me) reload();
    else setStatus(null);
  }, [me?.id]);

  async function claim(kind: "cashback" | "rakeback") {
    setBusy(kind);
    setMsg((m) => ({ ...m, [kind]: undefined }));
    try {
      const r = await api<{ amount: number }>(`/api/vip/claim-${kind}`, {});
      setMsg((m) => ({ ...m, [kind]: { ok: true, text: `${money(r.amount)} credited to your real balance` } }));
      reload(); balanceChanged();
    } catch (e: any) {
      setMsg((m) => ({ ...m, [kind]: { ok: false, text: e.code === "nothing_to_claim" ? "Minimum $1" : e.message } }));
    }
    setBusy("");
  }

  const cur = status ? levels.find((l) => l.level === status.level) : undefined;
  const next = status ? levels.find((l) => l.level === status.level + 1) : undefined;
  const pct = status && cur && next
    ? Math.min(100, ((status.points - cur.min_points) / (next.min_points - cur.min_points)) * 100)
    : 100;

  return (
    <>
      <section className="hero vip-hero">
        <h1>👑 A2 VIP Club</h1>
        <div>Earn 1 point for every $1 wagered with real money. Climb the levels to unlock cashback on losses and rakeback on every bet.</div>
        <div style={{ marginTop: 10, fontSize: 14 }}>
          <Link href="/legal/vip" style={{ textDecoration: "underline" }}>VIP & Loyalty Terms</Link>
        </div>
      </section>
      {error && <p className="error">{error}</p>}

      {ready && !me && (
        <div className="panel" style={{ marginBottom: 24 }}>
          <h2>Log in to see your level and claim rewards</h2>
          <Link className="btn" href="/login">Log in</Link>
        </div>
      )}

      {status && (
        <>
          <div className="panel vip-status">
            <div className="vip-badge">{levelIcon[status.level - 1] ?? "⭐"}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="muted">Your level</div>
              <div className="vip-name">{cur?.name ?? `Level ${status.level}`}</div>
              <div className="wager-label"><span>{status.points.toLocaleString("en-US")} points</span>
                <span className="muted">{next ? `${(next.min_points - status.points).toLocaleString("en-US")} to ${next.name}` : "Top level reached"}</span>
              </div>
              <div className="progress"><div style={{ width: pct + "%" }} /></div>
            </div>
          </div>

          <div className="cols" style={{ margin: "16px 0 28px" }}>
            <div className="panel claim">
              <div className="muted">Cashback{cur ? ` ${cur.cashback_pct}%` : ""}</div>
              <div className="v">{money(status.cashback_available)}</div>
              <p className="muted">{status.net_loss > 0 ? `Net loss ${money(status.net_loss)}` : `You're up ${money(-status.net_loss)}`} since {fmtDate(status.cashback_from)}</p>
              <button className="btn gold" disabled={busy === "cashback"} onClick={() => claim("cashback")}>Claim</button>
              {msg.cashback && <p className={msg.cashback.ok ? "ok" : "error"}>{msg.cashback.text}</p>}
            </div>
            <div className="panel claim">
              <div className="muted">Rakeback{cur ? ` ${cur.rakeback_pct}%` : ""}</div>
              <div className="v">{money(status.rakeback_available)}</div>
              <p className="muted">Earned on every real-money bet</p>
              <button className="btn gold" disabled={busy === "rakeback"} onClick={() => claim("rakeback")}>Claim</button>
              {msg.rakeback && <p className={msg.rakeback.ok ? "ok" : "error"}>{msg.rakeback.text}</p>}
            </div>
          </div>
        </>
      )}

      <h2>Levels</h2>
      <div className="ladder">
        {levels.map((l) => (
          <div key={l.level} className={"panel level" + (status?.level === l.level ? " current" : "") + (status && l.level < status.level ? " passed" : "")}>
            <div className="level-icon">{levelIcon[l.level - 1] ?? "⭐"}</div>
            <div className="level-name">{l.name}</div>
            <div className="muted small">from {l.min_points.toLocaleString("en-US")} points</div>
            <div className="level-stats">
              <div><span className="muted">Cashback</span><b>{l.cashback_pct}%</b></div>
              <div><span className="muted">Rakeback</span><b>{l.rakeback_pct}%</b></div>
            </div>
            <div className="small">{l.perks}</div>
            {status?.level === l.level && <span className="gbadge new level-you">You are here</span>}
          </div>
        ))}
      </div>
    </>
  );
}
