"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, StatusBadge, Tags, VerificationBadge } from "@/components/Badge";
import { api, errMsg } from "@/lib/api";
import { dt, money } from "@/lib/format";
import type { Items, PlayerRow } from "@/lib/types";

const PAGE = 50;

const RG_FILTERS = [
  { value: "", label: "Все игроки" },
  { value: "excluded", label: "Тайм-аут или самоисключение" },
  { value: "self_excluded", label: "Самоисключённые" },
  { value: "timeout", label: "На тайм-ауте" },
];

export default function PlayersPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [rg, setRg] = useState("");
  const [rows, setRows] = useState<PlayerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (query) params.set("q", query);
      if (rg) params.set("rg", rg);
      const r = await api<Items<PlayerRow>>(`/api/bo/players?${params}`);
      setRows(r.items || []);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [query, offset, rg]);

  useEffect(() => {
    load();
  }, [load]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    setQuery(q.trim());
  }

  return (
    <>
      <div className="page-head">
        <h1>Игроки</h1>
      </div>
      <form className="toolbar" onSubmit={submit}>
        <input
          className="search"
          placeholder="Поиск: email, ID или тег"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <button className="btn btn-primary">Найти</button>
        <select
          value={rg}
          aria-label="Ответственная игра"
          onChange={(e) => {
            setOffset(0);
            setRg(e.target.value);
          }}
        >
          {RG_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        {query && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setQ("");
              setQuery("");
              setOffset(0);
            }}
          >
            Сбросить
          </button>
        )}
        {loading && <span className="muted">Загрузка…</span>}
      </form>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Страна</th>
              <th>Статус</th>
              <th>Верификация</th>
              <th>Теги</th>
              <th className="num">Реальный</th>
              <th className="num">Бонус</th>
              <th>Регистрация</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((p) => (
              <tr key={p.id} className="clickable" onClick={() => router.push(`/players/${p.id}`)}>
                <td>
                  <div>{p.email}</div>
                  <div className="mono muted small">{p.id}</div>
                </td>
                <td>{p.country}</td>
                <td>
                  <StatusBadge value={p.status} />
                  {p.rg_exclusion && (
                    <>
                      {" "}
                      <Badge tone={p.rg_exclusion === "timeout" ? "warn" : "bad"}>
                        {p.rg_exclusion === "timeout" ? "Тайм-аут" : "Самоисключение"}
                      </Badge>
                    </>
                  )}
                </td>
                <td>
                  <VerificationBadge value={p.verification} />
                </td>
                <td>
                  <Tags tags={p.tags} />
                </td>
                <td className="num">{money(p.real)}</td>
                <td className="num">{money(p.bonus)}</td>
                <td className="nowrap">{dt(p.created_at)}</td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="empty">
                  Ничего не найдено
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button className="btn btn-ghost btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
          ← Назад
        </button>
        <span className="muted small">
          {offset + 1}–{offset + (rows?.length || 0)}
        </span>
        <button className="btn btn-ghost btn-sm" disabled={!rows || rows.length < PAGE} onClick={() => setOffset(offset + PAGE)}>
          Вперёд →
        </button>
      </div>
    </>
  );
}
