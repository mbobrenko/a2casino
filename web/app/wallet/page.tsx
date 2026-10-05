"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError, money } from "@/lib/api";
import { Payment, paymentStatus, shortHash, txText } from "@/lib/labels";
import { balanceChanged, useMe } from "@/lib/useMe";

type Method = {
  code: string; title: string; kind: "fiat" | "crypto" | "gateway"; provider: string; network?: string; coin?: string;
  min_cents: number; deposit: boolean; withdraw: boolean;
};
type Tx = { id: string; type: string; amount: number; created_at: string };
type Address = { network: string; address: string; min_cents: number; note: string };

const cents = (s: string) => Math.round(parseFloat(s || "0") * 100);
const date = (s: string) => new Date(s).toLocaleString("en-US");

/** What a valid payout address looks like on each network. */
const addressHint: Record<string, string> = {
  TRC20: "TRON address starting with T (34 characters)",
  ERC20: "Ethereum address starting with 0x (42 characters)",
  ETH: "Ethereum address starting with 0x (42 characters)",
  BTC: "Bitcoin address starting with bc1, 1 or 3",
  LTC: "Litecoin address starting with ltc1, L or M",
};

export default function Wallet() {
  const { me, ready } = useMe();
  const [methods, setMethods] = useState<Method[]>([]);
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [method, setMethod] = useState("");
  const [amount, setAmount] = useState("50");
  const [address, setAddress] = useState("");
  const [crypto, setCrypto] = useState<Address | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [bonusBlock, setBonusBlock] = useState(false);

  const reload = () => {
    api<{ items: Payment[] }>("/api/payments").then((r) => setPayments(r.items)).catch(() => {});
    api<{ items: Tx[] }>("/api/wallet/transactions?limit=30").then((r) => setTxs(r.items)).catch(() => {});
    balanceChanged();
  };

  useEffect(() => {
    api<{ methods: Method[] }>("/api/payments/methods").then((r) => {
      setMethods(r.methods);
      setMethod((cur) => cur || r.methods.find((x) => x.deposit)?.code || "");
    });
  }, []);
  useEffect(() => {
    if (!me) return;
    reload();
    const p = new URLSearchParams(window.location.search).get("deposit");
    if (p) setMsg({ success: "Deposit credited", processing: "Payment received. Your balance is credited once the network confirms it, usually within a few minutes.", cancelled: "Payment cancelled" }[p] ?? "Payment failed");
  }, [me?.id]);

  const available = methods.filter((x) => (tab === "deposit" ? x.deposit : x.withdraw));
  const m = available.find((x) => x.code === method);
  const switchTab = (t: "deposit" | "withdraw") => {
    setTab(t); setCrypto(null);
    const list = methods.filter((x) => (t === "deposit" ? x.deposit : x.withdraw));
    if (!list.some((x) => x.code === method)) setMethod(list[0]?.code ?? "");
  };
  const run = async (fn: () => Promise<void>) => {
    setError(""); setMsg(""); setBonusBlock(false);
    try { await fn(); } catch (e: any) {
      if (e instanceof ApiError && e.code === "bonus_active") setBonusBlock(true);
      else setError(e.message);
    }
  };

  const deposit = () => run(async () => {
    const r = await api("/api/payments/deposit", { method, amount: cents(amount) });
    if (r.type === "redirect") window.location.href = r.url;
    else setCrypto(r);
  });
  const simulate = (risk?: string) => run(async () => {
    const r = await api("/api/dev/crypto/simulate", { method, amount_usd_cents: cents(amount), risk });
    setMsg(r.final_status === "frozen" ? "Transaction sent for AML review" : "Crypto deposit credited");
    reload();
  });
  const withdraw = () => run(async () => {
    await api("/api/payments/withdraw", { method, amount: cents(amount), address });
    setMsg(m?.kind === "crypto"
      ? "Withdrawal requested. Once our finance team approves and sends it, the transaction hash appears in Payments."
      : "Withdrawal requested and awaiting approval");
    reload();
  });

  const methodTitle = (code: string, direction: string) =>
    methods.find((x) => x.code === code && (direction === "deposit" ? x.deposit : x.withdraw))?.title ?? code;

  if (ready && !me) return <div className="panel"><h2>Log in to open your wallet</h2><Link className="btn" href="/login">Log in</Link></div>;
  if (!me) return null;
  const b = me.balance;

  return (
    <>
      <h1>Wallet</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Limits, processing and checks are explained in <Link href="/legal/payments" className="terms-link">Payments & Withdrawals</Link>.
        Set a deposit limit on the <Link href="/responsible-gaming" className="terms-link">Responsible gaming</Link> page.
      </p>
      <div className="tiles">
        <div className="tile"><div className="muted">Real balance</div><div className="v">{money(b.real)}</div></div>
        <div className="tile"><div className="muted">Bonus balance</div><div className="v">{money(b.bonus)}</div></div>
        <div className="tile"><div className="muted">Pending withdrawal</div><div className="v">{money(b.locked)}</div></div>
        <div className="tile"><div className="muted">Verification</div><div className="v">{me.verification === "verified" ? "Verified" : me.verification === "pending" ? "Under review" : "Not verified"}</div></div>
      </div>

      <div className="cols" style={{ marginTop: 20 }}>
        <div className="panel">
          <div className="tabs">
            <button className={"tab " + (tab === "deposit" ? "active" : "")} onClick={() => switchTab("deposit")}>Deposit</button>
            <button className={"tab " + (tab === "withdraw" ? "active" : "")} onClick={() => switchTab("withdraw")}>Withdraw</button>
          </div>
          <div className="form">
            <label>Method
              <select value={method} onChange={(e) => { setMethod(e.target.value); setCrypto(null); }}>
                {available.map((x) => <option key={x.code} value={x.code}>{x.title}</option>)}
              </select>
            </label>
            <label>Amount, $<input type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            {m && <p className="muted">Minimum {money(tab === "deposit" ? m.min_cents : 1000)}</p>}
            {tab === "withdraw" && m?.kind === "crypto" && (
              <>
                <label>Your {m.coin ?? ""} wallet address ({m.network})
                  <input value={address} onChange={(e) => setAddress(e.target.value.trim())} placeholder={addressHint[m.network ?? ""] ?? "Wallet address"} spellCheck={false} autoComplete="off" />
                </label>
                <p className="muted small" style={{ margin: 0 }}>
                  We send {m.coin} on the {m.network} network only. Check the address carefully: crypto transfers cannot be reversed.
                  Withdrawals are reviewed and sent by our finance team; the transaction hash appears in Payments once it is paid.
                </p>
              </>
            )}
            {tab === "deposit"
              ? <button className="btn gold" onClick={deposit}>{m?.kind === "crypto" ? "Show address" : "Proceed to payment"}</button>
              : <button className="btn gold" onClick={withdraw}>Request withdrawal</button>}
            {tab === "withdraw" && me.verification !== "verified" && <p className="muted">Withdrawals are available after verification (KYC). <Link href="/profile#verification" className="terms-link">Verify your account</Link></p>}
          </div>
          {crypto && (
            <div style={{ marginTop: 16 }}>
              <p className="muted">Deposit address ({crypto.network}):</p>
              <div className="mono">{crypto.address}</div>
              <p className="muted">{crypto.note}</p>
              <div className="row">
                <button className="btn ghost" onClick={() => simulate()}>Simulate transfer (test)</button>
                <button className="btn ghost" onClick={() => simulate("high")}>Risky transfer (AML test)</button>
              </div>
            </div>
          )}
          {msg && <p className="ok">{msg}</p>}
          {error && <p className="error">{error}</p>}
          {bonusBlock && (
            <p className="error">Wager or cancel your active bonus first. <Link href="/promo" style={{ color: "var(--accent-2)", textDecoration: "underline" }}>Go to Promotions</Link></p>
          )}
        </div>

        <div className="panel">
          <h2>Payments</h2>
          {payments.length === 0 ? <p className="muted">Nothing here yet</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Date</th><th>Type</th><th>Method</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>{payments.map((p) => (
                <tr key={p.id}><td>{date(p.created_at)}</td><td>{p.direction === "deposit" ? "Deposit" : "Withdrawal"}</td>
                  <td>{methodTitle(p.method, p.direction)}{p.direction === "withdrawal" && p.address && <div className="mono muted" title={p.address}>{shortHash(p.address)}</div>}</td>
                  <td>{money(p.amount)}{p.crypto_amount && p.direction === "withdrawal" && <div className="muted small">{p.crypto_amount}</div>}</td>
                  <td>
                    <span className={"status " + p.status}>{paymentStatus(p)}</span>
                    {p.tx_url && p.external_ref && (
                      <div className="small" style={{ marginTop: 4 }}>
                        <a className="tx-link mono" href={p.tx_url} target="_blank" rel="noopener noreferrer" title={p.external_ref}>Tx {shortHash(p.external_ref)} ↗</a>
                      </div>
                    )}
                  </td></tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <h2>Transaction history</h2>
        {txs.length === 0 ? <p className="muted">Nothing here yet</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Date</th><th>Transaction</th><th>Amount</th></tr></thead>
            <tbody>{txs.map((t) => (
              <tr key={t.id}><td>{date(t.created_at)}</td><td>{txText[t.type] ?? t.type}</td><td>{money(t.amount)}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
