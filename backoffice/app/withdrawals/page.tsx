"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ActionModal from "@/components/ActionModal";
import { Badge, RiskBadge, StatusBadge, Tags, VerificationBadge } from "@/components/Badge";
import { api, errMsg } from "@/lib/api";
import { NETWORK_LABELS, dateOnly, dt, explorerAddressUrl, hours, money, shortHash, validTxHash } from "@/lib/format";
import type { Items, Withdrawal } from "@/lib/types";

const STATUSES = [
  { value: "pending", label: "Ожидают" },
  { value: "approved", label: "Ожидают выплаты" },
  { value: "completed", label: "Выплаченные" },
  { value: "rejected", label: "Отклонённые" },
];

type Pending = { w: Withdrawal; action: "approve" | "reject" | "paid" } | null;

export default function WithdrawalsPage() {
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<Withdrawal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Pending>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api<Items<Withdrawal>>(`/api/bo/withdrawals?status=${encodeURIComponent(status)}`);
      setRows(r.items || []);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [status]);

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("status");
    if (s && STATUSES.some((x) => x.value === s)) setStatus(s);
  }, []);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  const actions = status === "pending" || status === "approved";

  return (
    <>
      <div className="page-head">
        <h1>Выводы</h1>
        <button className="btn btn-ghost btn-sm" onClick={load}>
          Обновить
        </button>
      </div>
      <div className="segmented">
        {STATUSES.map((s) => (
          <button key={s.value} className={status === s.value ? "active" : ""} onClick={() => setStatus(s.value)}>
            {s.label}
          </button>
        ))}
      </div>
      {status === "approved" && (
        <div className="alert alert-info">
          Отправьте криптовалюту с биржи или кошелька казино на адрес игрока в указанной сети, затем нажмите «Отметить выплаченным» и
          вставьте хеш транзакции. До этого сумма остаётся заблокированной у игрока; вывод ещё можно отклонить.
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}
      {notice && (
        <div className="alert alert-ok" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Создан</th>
              <th>Игрок</th>
              <th>Метод / адрес</th>
              <th className="num">Сумма</th>
              <th>Статус</th>
              {status !== "pending" && <th>Выплата</th>}
              <th title="Проверка адреса кошелька (санкции, чёрный список, общий адрес)">Риск адреса</th>
              <th>Первый деп.</th>
              <th className="num">Деп. кол-во</th>
              <th className="num">Деп. сумма</th>
              <th className="num">Выводов</th>
              <th className="num">Оборот</th>
              <th className="num" title="Время с первого депозита до заявки">Скорость</th>
              <th>Верификация</th>
              <th>Теги</th>
              {actions && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows?.map((w) => {
              const lowTurnover = w.turnover < w.deposits_sum;
              const addrUrl = w.address ? explorerAddressUrl(w.network, w.address) : null;
              return (
                <tr key={w.id}>
                  <td className="nowrap">{dt(w.created_at)}</td>
                  <td>
                    <Link href={`/players/${w.player_id}`}>{w.email}</Link>
                    {w.player_status !== "active" && (
                      <div>
                        <StatusBadge value={w.player_status} />
                      </div>
                    )}
                    {w.created_by && <div className="muted small">Создан сотрудником {w.created_by}</div>}
                  </td>
                  <td>
                    <div>
                      {w.method}
                      {w.network && <span className="muted small"> · {NETWORK_LABELS[w.network] || w.network}</span>}
                      {w.manual && (
                        <>
                          {" "}
                          <Badge tone="info" title="Выплачивается вручную: одобрить, отправить, отметить выплаченным">
                            вручную
                          </Badge>
                        </>
                      )}
                    </div>
                    {w.address && (
                      <div className="mono muted small ellipsis" title={w.address}>
                        {addrUrl ? (
                          <a href={addrUrl} target="_blank" rel="noopener noreferrer">
                            {w.address}
                          </a>
                        ) : (
                          w.address
                        )}
                      </div>
                    )}
                  </td>
                  <td className="num strong">{money(w.amount)}</td>
                  <td>
                    <StatusBadge value={w.status} />
                  </td>
                  {status !== "pending" && (
                    <td className="small">
                      {w.approved_by && (
                        <div className="muted nowrap">
                          {status === "rejected" ? "Решение" : "Одобрил"}: {w.approved_by}
                          {w.approved_at && <> · {dt(w.approved_at)}</>}
                        </div>
                      )}
                      {w.tx_hash && (
                        <div className="mono nowrap">
                          {w.tx_url ? (
                            <a href={w.tx_url} target="_blank" rel="noopener noreferrer" title={w.tx_hash}>
                              {shortHash(w.tx_hash)} ↗
                            </a>
                          ) : (
                            <span title={w.tx_hash}>{shortHash(w.tx_hash)}</span>
                          )}
                        </div>
                      )}
                      {w.crypto_amount && <div className="nowrap">{w.crypto_amount}</div>}
                      {w.paid_by && (
                        <div className="muted nowrap">
                          Выплатил: {w.paid_by}
                          {w.paid_at && <> · {dt(w.paid_at)}</>}
                        </div>
                      )}
                    </td>
                  )}
                  <td>
                    <RiskBadge value={w.risk} reasons={w.risk_reasons} />
                    {w.risk_reasons && w.risk_reasons.length > 0 && <div className="muted small">{w.risk_reasons.join("; ")}</div>}
                  </td>
                  <td className="nowrap">{dateOnly(w.first_deposit_at)}</td>
                  <td className="num">{w.deposits_count}</td>
                  <td className="num">{money(w.deposits_sum)}</td>
                  <td className="num">{w.withdrawals_count}</td>
                  <td className={`num${lowTurnover ? " warn" : ""}`} title={lowTurnover ? "Оборот меньше суммы депозитов" : undefined}>
                    {money(w.turnover)}
                  </td>
                  <td className={`num${w.payment_speed_hours !== null && w.payment_speed_hours < 1 ? " warn" : ""}`}>
                    {hours(w.payment_speed_hours)}
                  </td>
                  <td>
                    <VerificationBadge value={w.verification} />
                  </td>
                  <td>
                    <Tags tags={w.tags} />
                  </td>
                  {actions && (
                    <td className="nowrap">
                      {w.status === "pending" && (
                        <button className="btn btn-success btn-sm" onClick={() => setConfirm({ w, action: "approve" })}>
                          Одобрить
                        </button>
                      )}
                      {w.status === "approved" && w.manual && (
                        <button className="btn btn-success btn-sm" onClick={() => setConfirm({ w, action: "paid" })}>
                          Отметить выплаченным
                        </button>
                      )}{" "}
                      <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ w, action: "reject" })}>
                        Отклонить
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {rows && rows.length === 0 && (
              <tr>
                <td colSpan={17} className="empty">
                  Нет заявок
                </td>
              </tr>
            )}
            {!rows && !error && (
              <tr>
                <td colSpan={17} className="empty">
                  Загрузка…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {confirm && confirm.action !== "paid" && (
        <ActionModal
          title={confirm.action === "approve" ? "Одобрить вывод?" : "Отклонить вывод?"}
          description={
            <>
              {confirm.w.email}: <b>{money(confirm.w.amount)}</b> через {confirm.w.method}
              {confirm.action === "approve" && confirm.w.manual && (
                <div className="small muted" style={{ marginTop: 6 }}>
                  Адрес будет проверен ещё раз (AML). После одобрения отправьте криптовалюту вручную и отметьте вывод выплаченным.
                </div>
              )}
              {confirm.action === "reject" && <div className="small muted" style={{ marginTop: 6 }}>Сумма вернётся на реальный баланс игрока.</div>}
            </>
          }
          requireComment={false}
          danger={confirm.action === "reject"}
          confirmLabel={confirm.action === "approve" ? "Одобрить" : "Отклонить"}
          onClose={() => setConfirm(null)}
          onSubmit={async () => {
            await api(`/api/bo/withdrawals/${confirm.w.id}/${confirm.action}`, { method: "POST" });
            const what = confirm.action === "approve" ? (confirm.w.manual ? "одобрен, ждёт выплаты" : "одобрен") : "отклонён";
            setNotice(`Вывод ${money(confirm.w.amount)} (${confirm.w.email}) ${what}`);
            await load();
          }}
        />
      )}
      {confirm?.action === "paid" && (
        <MarkPaidModal
          w={confirm.w}
          onClose={() => setConfirm(null)}
          onDone={async (msg) => {
            setNotice(msg);
            await load();
          }}
        />
      )}
    </>
  );
}

function MarkPaidModal({ w, onClose, onDone }: { w: Withdrawal; onClose: () => void; onDone: (msg: string) => Promise<void> }) {
  const [hash, setHash] = useState("");
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const net = w.network ? NETWORK_LABELS[w.network] || w.network : "—";
  const hashOk = !hash.trim() || validTxHash(w.network, hash);

  return (
    <ActionModal
      wide
      title="Отметить вывод выплаченным"
      description={
        <>
          {w.email}: <b>{money(w.amount)}</b> · {w.method} · сеть <b>{net}</b>
        </>
      }
      requireComment={false}
      confirmLabel="Выплачено"
      onClose={onClose}
      onSubmit={async () => {
        if (!validTxHash(w.network, hash)) throw new Error("Хеш транзакции: 64 шестнадцатеричных символа (для Ethereum — с 0x)");
        const r = await api<{ tx_hash: string }>(`/api/bo/withdrawals/${w.id}/paid`, {
          body: { tx_hash: hash.trim(), crypto_amount: amount.trim() },
        });
        await onDone(`Вывод ${money(w.amount)} (${w.email}) выплачен, транзакция ${shortHash(r.tx_hash)}`);
      }}
    >
      <label className="field">
        <span>Адрес получателя</span>
        <div className="color-row">
          <input readOnly className="mono" value={w.address || ""} onFocus={(e) => e.target.select()} />
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              navigator.clipboard?.writeText(w.address || "").then(() => setCopied(true));
            }}
          >
            {copied ? "Скопировано" : "Копировать"}
          </button>
        </div>
      </label>
      <label className="field">
        <span>Хеш транзакции *</span>
        <input
          className="mono"
          value={hash}
          onChange={(e) => setHash(e.target.value)}
          placeholder={w.network === "ERC20" || w.network === "ETH" ? "0x… (66 символов)" : "64 шестнадцатеричных символа"}
          autoFocus
          spellCheck={false}
        />
        {!hashOk && <span className="field-hint neg">Не похоже на хеш транзакции {net}</span>}
      </label>
      <label className="field">
        <span>Отправлено в криптовалюте (необязательно)</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="например, 99.5" inputMode="decimal" />
        <span className="field-hint">Точная сумма монет, которую получил игрок; видна игроку в истории платежей.</span>
      </label>
    </ActionModal>
  );
}
