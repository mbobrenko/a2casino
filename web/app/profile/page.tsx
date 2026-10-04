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
  CL: "Чили", MX: "Мексика", GT: "Гватемала", HN: "Гондурас", SV: "Сальвадор",
  NI: "Никарагуа", BO: "Боливия", CR: "Коста-Рика", PA: "Панама", BR: "Бразилия",
};
const verificationText: Record<string, string> = {
  new: "не пройдена", not_verified: "не пройдена", manual_review: "на проверке", duplicate: "дубликат аккаунта", verified: "пройдена",
};
const providerText: Record<string, string> = { originals: "A2 Originals", mock: "Провайдер", freespins: "Фриспины" };

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

  if (ready && !me) return <div className="panel"><h2>Войдите, чтобы открыть профиль</h2><Link className="btn" href="/login">Войти</Link></div>;
  if (!me || !p) return error ? <p className="error">{error}</p> : null;

  const lvl = levels.find((l) => l.level === p.vip.level);
  const s = p.stats;
  const tiles: [string, string][] = [
    ["Ставок", s.bets.toLocaleString("ru-RU")],
    ["Сумма ставок", money(s.bet_sum)],
    ["Выигрышей", s.wins.toLocaleString("ru-RU")],
    ["Сумма выигрышей", money(s.win_sum)],
    ["Депозитов", s.deposits.toLocaleString("ru-RU")],
    ["Сумма депозитов", money(s.deposit_sum)],
    ["Выводов", s.withdrawals.toLocaleString("ru-RU")],
    ["Сумма выводов", money(s.withdrawal_sum)],
  ];

  return (
    <>
      <h1>Профиль</h1>
      <div className="cols">
        <div className="panel">
          <h2>Аккаунт</h2>
          <div className="kv">
            <div><span className="muted">Email</span><b className="ellipsis">{p.email}</b></div>
            <div><span className="muted">Страна</span><b>{countryNames[p.country] ?? p.country}</b></div>
            <div><span className="muted">Верификация</span>
              <b className={p.verification === "verified" ? "win" : ""}>{verificationText[p.verification] ?? p.verification}</b></div>
            <div><span className="muted">Дата регистрации</span><b>{fmtDate(p.created_at)}</b></div>
            <div><span className="muted">VIP-уровень</span>
              <b><Link href="/vip">{levelIcon[p.vip.level - 1] ?? "⭐"} {lvl?.name ?? p.vip.level} · {p.vip.points.toLocaleString("ru-RU")} очков</Link></b></div>
          </div>
        </div>
        <div className="panel">
          <h2>Баланс</h2>
          <div className="kv">
            <div><span className="muted">Реальный</span><b>{money(p.balance.real)}</b></div>
            <div><span className="muted">Бонусный</span><b>{money(p.balance.bonus)}</b></div>
            <div><span className="muted">В ожидании вывода</span><b>{money(p.balance.locked)}</b></div>
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <Link href="/wallet" className="btn gold">Пополнить</Link>
            <Link href="/promo" className="btn ghost">Мои бонусы</Link>
          </div>
        </div>
      </div>

      <h2 style={{ marginTop: 24 }}>Статистика</h2>
      <div className="tiles stats">
        {tiles.map(([k, v]) => <div key={k} className="tile"><div className="muted">{k}</div><div className="v">{v}</div></div>)}
      </div>

      <div className="panel">
        <div className="tabs">
          <button className={"tab" + (tab === "rounds" ? " active" : "")} onClick={() => setTab("rounds")}>История ставок</button>
          <button className={"tab" + (tab === "tx" ? " active" : "")} onClick={() => setTab("tx")}>Транзакции</button>
          <button className={"tab" + (tab === "payments" ? " active" : "")} onClick={() => setTab("payments")}>Платежи</button>
        </div>

        {tab === "rounds" && (rounds?.length === 0 ? <p className="muted">Ставок пока нет</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Дата</th><th>Игра</th><th>Ставка</th><th>Выигрыш</th><th className="hide-sm">Статус</th></tr></thead>
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

        {tab === "tx" && (txs?.length === 0 ? <p className="muted">Операций пока нет</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Дата</th><th>Операция</th><th>Сумма</th></tr></thead>
            <tbody>{txs?.map((t) => (
              <tr key={t.id}>
                <td className="nowrap">{fmtShort(t.created_at)}</td>
                <td>{txText[t.type] ?? t.type}</td>
                <td className={t.amount > 0 ? "win" : t.amount < 0 ? "lose" : ""}>{t.amount > 0 ? "+" : ""}{money(t.amount)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ))}

        {tab === "payments" && (payments?.length === 0 ? <p className="muted">Платежей пока нет</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Дата</th><th>Тип</th><th className="hide-sm">Способ</th><th>Сумма</th><th>Статус</th></tr></thead>
            <tbody>{payments?.map((x) => (
              <tr key={x.id}>
                <td className="nowrap">{fmtShort(x.created_at)}</td>
                <td>{x.direction === "deposit" ? "Депозит" : "Вывод"}</td>
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
