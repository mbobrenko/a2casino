"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, money } from "@/lib/api";
import { balanceChanged, useMe } from "@/lib/useMe";

type Method = { code: string; title: string; kind: "fiat" | "crypto"; network?: string; min_cents: number };
type Payment = { id: string; direction: string; method: string; amount: number; status: string; address: string | null; created_at: string };
type Tx = { id: string; type: string; amount: number; created_at: string };
type Address = { network: string; address: string; min_cents: number; note: string };

const statusText: Record<string, string> = {
  pending: "в обработке", confirming: "подтверждается", completed: "зачислен", failed: "ошибка",
  approved: "выплачен", rejected: "отклонён", frozen: "на проверке",
};
const txText: Record<string, string> = {
  deposit: "Депозит", bet: "Ставка", win: "Выигрыш", rollback: "Отмена ставки", adjustment: "Корректировка",
  withdraw_hold: "Вывод (резерв)", withdraw_release: "Вывод отменён", withdraw_complete: "Вывод выплачен",
};
const cents = (s: string) => Math.round(parseFloat(s || "0") * 100);
const date = (s: string) => new Date(s).toLocaleString("ru-RU");

export default function Wallet() {
  const { me, ready } = useMe();
  const [methods, setMethods] = useState<Method[]>([]);
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [method, setMethod] = useState("card_mock");
  const [amount, setAmount] = useState("50");
  const [address, setAddress] = useState("");
  const [crypto, setCrypto] = useState<Address | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const reload = () => {
    api<{ items: Payment[] }>("/api/payments").then((r) => setPayments(r.items)).catch(() => {});
    api<{ items: Tx[] }>("/api/wallet/transactions?limit=30").then((r) => setTxs(r.items)).catch(() => {});
    balanceChanged();
  };

  useEffect(() => { api<{ methods: Method[] }>("/api/payments/methods").then((r) => setMethods(r.methods)); }, []);
  useEffect(() => {
    if (!me) return;
    reload();
    const p = new URLSearchParams(window.location.search).get("deposit");
    if (p) setMsg(p === "success" ? "Депозит зачислен" : "Оплата не прошла");
  }, [me?.id]);

  const m = methods.find((x) => x.code === method);
  const run = async (fn: () => Promise<void>) => {
    setError(""); setMsg("");
    try { await fn(); } catch (e: any) { setError(e.message); }
  };

  const deposit = () => run(async () => {
    const r = await api("/api/payments/deposit", { method, amount: cents(amount) });
    if (r.type === "redirect") window.location.href = r.url;
    else setCrypto(r);
  });
  const simulate = (risk?: string) => run(async () => {
    const r = await api("/api/dev/crypto/simulate", { method, amount_usd_cents: cents(amount), risk });
    setMsg(r.final_status === "frozen" ? "Транзакция отправлена на AML-проверку" : "Крипто-депозит зачислен");
    reload();
  });
  const withdraw = () => run(async () => {
    await api("/api/payments/withdraw", { method, amount: cents(amount), address });
    setMsg("Заявка на вывод создана и ждёт одобрения");
    reload();
  });

  if (ready && !me) return <div className="panel"><h2>Войдите, чтобы открыть кошелёк</h2><Link className="btn" href="/login">Войти</Link></div>;
  if (!me) return null;
  const b = me.balance;

  return (
    <>
      <h1>Кошелёк</h1>
      <div className="tiles">
        <div className="tile"><div className="muted">Реальный баланс</div><div className="v">{money(b.real)}</div></div>
        <div className="tile"><div className="muted">Бонусный</div><div className="v">{money(b.bonus)}</div></div>
        <div className="tile"><div className="muted">В ожидании вывода</div><div className="v">{money(b.locked)}</div></div>
        <div className="tile"><div className="muted">Верификация</div><div className="v">{me.verification === "verified" ? "пройдена" : "не пройдена"}</div></div>
      </div>

      <div className="cols" style={{ marginTop: 20 }}>
        <div className="panel">
          <div className="tabs">
            <button className={"tab " + (tab === "deposit" ? "active" : "")} onClick={() => { setTab("deposit"); setCrypto(null); }}>Пополнить</button>
            <button className={"tab " + (tab === "withdraw" ? "active" : "")} onClick={() => { setTab("withdraw"); setCrypto(null); }}>Вывести</button>
          </div>
          <div className="form">
            <label>Способ
              <select value={method} onChange={(e) => { setMethod(e.target.value); setCrypto(null); }}>
                {methods.map((x) => <option key={x.code} value={x.code}>{x.title}</option>)}
              </select>
            </label>
            <label>Сумма, $<input type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            {m && <p className="muted">Минимум {money(tab === "deposit" ? m.min_cents : 1000)}</p>}
            {tab === "withdraw" && m?.kind === "crypto" && (
              <label>Адрес кошелька ({m.network})<input value={address} onChange={(e) => setAddress(e.target.value)} /></label>
            )}
            {tab === "deposit"
              ? <button className="btn gold" onClick={deposit}>{m?.kind === "crypto" ? "Показать адрес" : "Перейти к оплате"}</button>
              : <button className="btn gold" onClick={withdraw}>Заказать вывод</button>}
            {tab === "withdraw" && me.verification !== "verified" && <p className="muted">Вывод доступен после верификации (KYC).</p>}
          </div>
          {crypto && (
            <div style={{ marginTop: 16 }}>
              <p className="muted">Адрес для пополнения ({crypto.network}):</p>
              <div className="mono">{crypto.address}</div>
              <p className="muted">{crypto.note}</p>
              <div className="row">
                <button className="btn ghost" onClick={() => simulate()}>Симулировать перевод (тест)</button>
                <button className="btn ghost" onClick={() => simulate("high")}>Рисковый перевод (тест AML)</button>
              </div>
            </div>
          )}
          {msg && <p className="ok">{msg}</p>}
          {error && <p className="error">{error}</p>}
        </div>

        <div className="panel">
          <h2>Платежи</h2>
          {payments.length === 0 ? <p className="muted">Пока пусто</p> : (
            <table>
              <thead><tr><th>Дата</th><th>Тип</th><th>Способ</th><th>Сумма</th><th>Статус</th></tr></thead>
              <tbody>{payments.map((p) => (
                <tr key={p.id}><td>{date(p.created_at)}</td><td>{p.direction === "deposit" ? "Депозит" : "Вывод"}</td><td>{p.method}</td>
                  <td>{money(p.amount)}</td><td><span className={"status " + p.status}>{statusText[p.status] ?? p.status}</span></td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <h2>История операций</h2>
        {txs.length === 0 ? <p className="muted">Пока пусто</p> : (
          <table>
            <thead><tr><th>Дата</th><th>Операция</th><th>Сумма</th></tr></thead>
            <tbody>{txs.map((t) => (
              <tr key={t.id}><td>{date(t.created_at)}</td><td>{txText[t.type] ?? t.type}</td><td>{money(t.amount)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
