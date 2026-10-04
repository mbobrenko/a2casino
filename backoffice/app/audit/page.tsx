"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AuditDiff from "@/components/AuditDiff";
import { api, errMsg } from "@/lib/api";
import { AUDIT_ACTION_LABELS, dt } from "@/lib/format";
import type { GlobalAuditEntry, Json } from "@/lib/types";

const LIMITS = [100, 200, 500];

/** Object keys written by catalog changes → where to look at the object. */
const OBJECT_KEYS: { key: string; label: string; href?: string }[] = [
  { key: "game_id", label: "Игра", href: "/games" },
  { key: "provider", label: "Провайдер", href: "/games" },
  { key: "code", label: "Промокод", href: "/promocodes" }, // before bonus_id: promo changes carry both
  { key: "bonus_id", label: "Бонус", href: "/bonuses" },
  { key: "level", label: "VIP", href: "/vip" },
  { key: "banner_id", label: "Баннер", href: "/banners" },
];

function objectOf(a: GlobalAuditEntry): { label: string; value: string; href?: string; key: string } | null {
  const src: Json = { ...(a.before || {}), ...(a.after || {}) };
  for (const o of OBJECT_KEYS) {
    if (o.key in src && src[o.key] !== null && src[o.key] !== undefined) {
      return { label: o.label, value: String(src[o.key]), href: o.href, key: o.key };
    }
  }
  // creates write the new row's id as "id"
  if ("id" in src && a.action.endsWith("_create")) {
    const kind = a.action.replace(/_create$/, "");
    const href = kind === "bonus" ? "/bonuses" : kind === "banner" ? "/banners" : undefined;
    return { label: kind === "bonus" ? "Бонус" : kind === "banner" ? "Баннер" : kind, value: String(src.id), href, key: "id" };
  }
  return null;
}

export default function AuditPage() {
  const [action, setAction] = useState("");
  const [limit, setLimit] = useState(100);
  const [rows, setRows] = useState<GlobalAuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (action) params.set("action", action);
      const r = await api<{ items: GlobalAuditEntry[] | null }>(`/api/bo/audit?${params}`);
      setRows(r.items || []);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [action, limit]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className="page-head">
        <h1>Журнал действий</h1>
        <button className="btn btn-ghost btn-sm" onClick={load}>
          Обновить
        </button>
      </div>
      <div className="toolbar">
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">Все действия</option>
          {Object.entries(AUDIT_ACTION_LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              {l} ({k})
            </option>
          ))}
        </select>
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ minWidth: 0 }}>
          {LIMITS.map((l) => (
            <option key={l} value={l}>
              последние {l}
            </option>
          ))}
        </select>
        {loading && <span className="muted">Загрузка…</span>}
        <span className="spacer" />
        {rows && <span className="muted small">Записей: {rows.length}</span>}
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Время</th>
              <th>Сотрудник</th>
              <th>Действие</th>
              <th>Объект</th>
              <th>Изменения (до → после)</th>
              <th>Комментарий</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((a) => {
              const obj = a.player_id ? null : objectOf(a);
              return (
                <tr key={a.id}>
                  <td className="nowrap">{dt(a.created_at)}</td>
                  <td>{a.staff_email || <span className="muted">—</span>}</td>
                  <td>
                    <span className="badge badge-muted" title={a.action}>
                      {AUDIT_ACTION_LABELS[a.action] || a.action}
                    </span>
                  </td>
                  <td className="nowrap">
                    {a.player_id ? (
                      <Link href={`/players/${a.player_id}`}>{a.player_email || a.player_id}</Link>
                    ) : obj ? (
                      <>
                        <span className="muted">{obj.label}</span>{" "}
                        {obj.href ? <Link href={obj.href}>{obj.value}</Link> : <span>{obj.value}</span>}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td style={{ maxWidth: 520 }}>
                    <AuditDiff before={a.before} after={a.after} hide={obj ? [obj.key] : []} />
                  </td>
                  <td>{a.comment || <span className="muted">—</span>}</td>
                </tr>
              );
            })}
            {rows && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  Нет записей
                </td>
              </tr>
            )}
            {!rows && !error && (
              <tr>
                <td colSpan={6} className="empty">
                  Загрузка…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
