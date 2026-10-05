"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { VerificationBadge } from "@/components/Badge";
import { api, errMsg } from "@/lib/api";
import { dt } from "@/lib/format";
import type { Items, KycQueueItem } from "@/lib/types";

const FILTERS = [
  { value: "pending", label: "Ожидают проверки" },
  { value: "all", label: "Все с документами" },
];

function waiting(iso: string | null): string {
  if (!iso) return "—";
  const h = (Date.now() - new Date(iso).getTime()) / 3.6e6;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} мин`;
  if (h < 48) return `${Math.round(h)} ч`;
  return `${Math.round(h / 24)} дн`;
}

export default function KycQueuePage() {
  const router = useRouter();
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<KycQueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api<Items<KycQueueItem>>(`/api/bo/kyc?status=${status}`);
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
        <h1>Верификация (KYC)</h1>
        <button className="btn btn-ghost btn-sm" onClick={load}>
          Обновить
        </button>
      </div>
      <div className="segmented">
        {FILTERS.map((f) => (
          <button key={f.value} className={status === f.value ? "active" : ""} onClick={() => setStatus(f.value)}>
            {f.label}
          </button>
        ))}
      </div>
      <p className="muted small" style={{ marginTop: -4 }}>
        Игроки с документами на проверке, по времени ожидания. Откройте карточку игрока → вкладка «Верификация (KYC)», чтобы
        просмотреть документы, одобрить или отклонить их и подтвердить личность.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Игрок</th>
              <th>ФИО</th>
              <th>Страна</th>
              <th>Статус</th>
              <th className="num">На проверке</th>
              <th className="num">Всего файлов</th>
              <th>Ждёт</th>
              <th>Последняя загрузка</th>
            </tr>
          </thead>
          <tbody>
            {!rows && !error && (
              <tr>
                <td colSpan={8} className="empty">
                  Загрузка…
                </td>
              </tr>
            )}
            {rows && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="empty">
                  Очередь пуста
                </td>
              </tr>
            )}
            {rows?.map((r) => (
              <tr key={r.player_id} className="clickable" onClick={() => router.push(`/players/${r.player_id}?tab=kyc`)}>
                <td>
                  <div>{r.email}</div>
                  <div className="mono muted small">{r.player_id}</div>
                </td>
                <td>{r.full_name || <span className="muted">—</span>}</td>
                <td>{r.country}</td>
                <td>
                  <VerificationBadge value={r.verification} />
                </td>
                <td className="num strong">{r.pending_docs}</td>
                <td className="num">{r.documents}</td>
                <td className={r.oldest_pending_at && Date.now() - new Date(r.oldest_pending_at).getTime() > 864e5 ? "warn" : ""}>
                  {waiting(r.oldest_pending_at)}
                </td>
                <td className="nowrap">{dt(r.last_uploaded_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
