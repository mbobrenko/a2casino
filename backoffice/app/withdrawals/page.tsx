"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ActionModal from "@/components/ActionModal";
import { StatusBadge, Tags, VerificationBadge } from "@/components/Badge";
import { api, errMsg } from "@/lib/api";
import { dateOnly, dt, hours, money } from "@/lib/format";
import type { Items, Withdrawal } from "@/lib/types";

const STATUSES = [
  { value: "pending", label: "Ожидают" },
  { value: "completed", label: "Выполненные" },
  { value: "rejected", label: "Отклонённые" },
];

type Pending = { w: Withdrawal; action: "approve" | "reject" } | null;

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
    setRows(null);
    load();
  }, [load]);

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
              <th>Первый деп.</th>
              <th className="num">Деп. кол-во</th>
              <th className="num">Деп. сумма</th>
              <th className="num">Выводов</th>
              <th className="num">Оборот</th>
              <th className="num" title="Время с первого депозита до заявки">Скорость</th>
              <th>Верификация</th>
              <th>Теги</th>
              {status === "pending" && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows?.map((w) => {
              const lowTurnover = w.turnover < w.deposits_sum;
              return (
                <tr key={w.id}>
                  <td className="nowrap">{dt(w.created_at)}</td>
                  <td>
                    <Link href={`/players/${w.player_id}`}>{w.email}</Link>
                  </td>
                  <td>
                    <div>{w.method}</div>
                    {w.address && (
                      <div className="mono muted small ellipsis" title={w.address}>
                        {w.address}
                      </div>
                    )}
                  </td>
                  <td className="num strong">{money(w.amount)}</td>
                  <td>
                    <StatusBadge value={w.status} />
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
                  {status === "pending" && (
                    <td className="nowrap">
                      <button className="btn btn-success btn-sm" onClick={() => setConfirm({ w, action: "approve" })}>
                        Одобрить
                      </button>{" "}
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
                <td colSpan={14} className="empty">
                  Нет заявок
                </td>
              </tr>
            )}
            {!rows && !error && (
              <tr>
                <td colSpan={14} className="empty">
                  Загрузка…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {confirm && (
        <ActionModal
          title={confirm.action === "approve" ? "Одобрить вывод?" : "Отклонить вывод?"}
          description={
            <>
              {confirm.w.email}: <b>{money(confirm.w.amount)}</b> через {confirm.w.method}
            </>
          }
          requireComment={false}
          danger={confirm.action === "reject"}
          confirmLabel={confirm.action === "approve" ? "Одобрить" : "Отклонить"}
          onClose={() => setConfirm(null)}
          onSubmit={async () => {
            await api(`/api/bo/withdrawals/${confirm.w.id}/${confirm.action}`, { method: "POST" });
            setNotice(`Вывод ${money(confirm.w.amount)} (${confirm.w.email}) ${confirm.action === "approve" ? "одобрен" : "отклонён"}`);
            await load();
          }}
        />
      )}
    </>
  );
}
