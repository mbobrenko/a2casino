"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, Balance, fmtDate, fmtShort, money } from "@/lib/api";
import { useMe } from "@/lib/useMe";
import { VipLevel, VipStatus, levelIcon, paymentStatusText, roundStatusText, txText } from "@/lib/labels";

type Stats = {
  bets: number; bet_sum: number; wins: number; win_sum: number;
  deposits: number; deposit_sum: number; withdrawals: number; withdrawal_sum: number;
};
type Profile = {
  id: string; email: string; country: string; currency: string; status: string; verification: string; created_at: string;
  balance: Balance; vip: VipStatus; stats: Stats;
};
type Round = { id: number; game: string; emoji: string; provider: string; bet: number; win: number; status: string; created_at: string };
type Tx = { id: string; type: string; amount: number; created_at: string };
type Payment = { id: string; direction: string; method: string; amount: number; status: string; created_at: string };

const countryNames: Record<string, string> = {
  CL: "Chile", MX: "Mexico", GT: "Guatemala", HN: "Honduras", SV: "El Salvador",
  NI: "Nicaragua", BO: "Bolivia", CR: "Costa Rica", PA: "Panama", BR: "Brazil",
};
const verificationText: Record<string, string> = {
  new: "Not verified", not_verified: "Not verified", manual_review: "Under review", duplicate: "Duplicate account", verified: "Verified",
};
const providerText: Record<string, string> = { originals: "A2 Originals", mock: "Provider", freespins: "Free spins" };

type Tab = "rounds" | "tx" | "payments";

export default function ProfilePage() {
  const { me, ready } = useMe();
  const [p, setP] = useState<Profile | null>(null);
  const [levels, setLevels] = useState<VipLevel[]>([]);
  const [tab, setTab] = useState<Tab>("rounds");
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ levels: VipLevel[] }>("/api/vip/levels").then((r) => setLevels(r.levels)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!me) return;
    api<Profile>("/api/profile").then(setP).catch((e) => setError(e.message));
    api<{ items: Round[] }>("/api/rounds?limit=50").then((r) => setRounds(r.items)).catch(() => setRounds([]));
    api<{ items: Tx[] }>("/api/wallet/transactions?limit=100").then((r) => setTxs(r.items)).catch(() => setTxs([]));
    api<{ items: Payment[] }>("/api/payments").then((r) => setPayments(r.items)).catch(() => setPayments([]));
  }, [me?.id, me?.balance.real, me?.balance.bonus]);

  if (ready && !me) return <div className="panel"><h2>Log in to view your profile</h2><Link className="btn" href="/login">Log in</Link></div>;
  if (!me || !p) return error ? <p className="error">{error}</p> : null;

  const lvl = levels.find((l) => l.level === p.vip.level);
  const s = p.stats;
  const tiles: [string, string][] = [
    ["Bets", s.bets.toLocaleString("en-US")],
    ["Total wagered", money(s.bet_sum)],
    ["Wins", s.wins.toLocaleString("en-US")],
    ["Total won", money(s.win_sum)],
    ["Deposits", s.deposits.toLocaleString("en-US")],
    ["Total deposited", money(s.deposit_sum)],
    ["Withdrawals", s.withdrawals.toLocaleString("en-US")],
    ["Total withdrawn", money(s.withdrawal_sum)],
  ];

  return (
    <>
      <h1>Profile</h1>
      <div className="cols">
        <div className="panel">
          <h2>Account</h2>
          <div className="kv">
            <div><span className="muted">Email</span><b className="ellipsis">{p.email}</b></div>
            <div><span className="muted">Country</span><b>{countryNames[p.country] ?? p.country}</b></div>
            <div><span className="muted">Verification</span>
              <b className={p.verification === "verified" ? "win" : ""}>{verificationText[p.verification] ?? p.verification}</b></div>
            <div><span className="muted">Member since</span><b>{fmtDate(p.created_at)}</b></div>
            <div><span className="muted">VIP level</span>
              <b><Link href="/vip">{levelIcon[p.vip.level - 1] ?? "⭐"} {lvl?.name ?? p.vip.level} · {p.vip.points.toLocaleString("en-US")} points</Link></b></div>
          </div>
        </div>
        <div className="panel">
          <h2>Balance</h2>
          <div className="kv">
            <div><span className="muted">Real</span><b>{money(p.balance.real)}</b></div>
            <div><span className="muted">Bonus</span><b>{money(p.balance.bonus)}</b></div>
            <div><span className="muted">Pending withdrawal</span><b>{money(p.balance.locked)}</b></div>
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <Link href="/wallet" className="btn gold">Deposit</Link>
            <Link href="/promo" className="btn ghost">My bonuses</Link>
          </div>
        </div>
      </div>

      <h2 style={{ marginTop: 24 }}>Statistics</h2>
      <div className="tiles stats">
        {tiles.map(([k, v]) => <div key={k} className="tile"><div className="muted">{k}</div><div className="v">{v}</div></div>)}
      </div>

      <div className="panel">
        <div className="tabs">
          <button className={"tab" + (tab === "rounds" ? " active" : "")} onClick={() => setTab("rounds")}>Bet history</button>
          <button className={"tab" + (tab === "tx" ? " active" : "")} onClick={() => setTab("tx")}>Transactions</button>
          <button className={"tab" + (tab === "payments" ? " active" : "")} onClick={() => setTab("payments")}>Payments</button>
        </div>

        {tab === "rounds" && (rounds?.length === 0 ? <p className="muted">No bets yet</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Date</th><th>Game</th><th>Bet</th><th>Win</th><th className="hide-sm">Status</th></tr></thead>
            <tbody>{rounds?.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{fmtShort(r.created_at)}</td>
                <td>{r.emoji} {r.game} <span className="muted small hide-sm">{providerText[r.provider] ?? r.provider}</span></td>
                <td>{money(r.bet)}</td>
                <td className={r.win > 0 ? "win" : "muted"}>{money(r.win)}</td>
                <td className="hide-sm"><span className={"status " + (r.status === "settled" ? "completed" : r.status === "open" ? "pending" : "failed")}>{roundStatusText[r.status] ?? r.status}</span></td>
              </tr>
            ))}</tbody>
          </table></div>
        ))}

        {tab === "tx" && (txs?.length === 0 ? <p className="muted">No transactions yet</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Date</th><th>Transaction</th><th>Amount</th></tr></thead>
            <tbody>{txs?.map((t) => (
              <tr key={t.id}>
                <td className="nowrap">{fmtShort(t.created_at)}</td>
                <td>{txText[t.type] ?? t.type}</td>
                <td className={t.amount > 0 ? "win" : t.amount < 0 ? "lose" : ""}>{t.amount > 0 ? "+" : ""}{money(t.amount)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ))}

        {tab === "payments" && (payments?.length === 0 ? <p className="muted">No payments yet</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Date</th><th>Type</th><th className="hide-sm">Method</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>{payments?.map((x) => (
              <tr key={x.id}>
                <td className="nowrap">{fmtShort(x.created_at)}</td>
                <td>{x.direction === "deposit" ? "Deposit" : "Withdrawal"}</td>
                <td className="hide-sm">{x.method}</td>
                <td>{money(x.amount)}</td>
                <td><span className={"status " + x.status}>{paymentStatusText[x.status] ?? x.status}</span></td>
              </tr>
            ))}</tbody>
          </table></div>
        ))}
      </div>
    </>
  );
}
