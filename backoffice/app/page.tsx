"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Tile from "@/components/Tile";
import { api, errMsg } from "@/lib/api";
import { money } from "@/lib/format";
import type { Dashboard } from "@/lib/types";

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setData(await api<Dashboard>("/api/bo/dashboard"));
    } catch (e) {
      setError(errMsg(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <div className="page-head">
        <h1>Дашборд</h1>
        <button className="btn btn-ghost btn-sm" onClick={load}>
          Обновить
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {!data && !error && <div className="muted">Загрузка…</div>}
      {data && (
        <>
          <div className="tiles">
            <Tile label="Игроков всего" value={data.players.toLocaleString("ru-RU")} />
            <Tile label="Новых сегодня" value={data.new_today.toLocaleString("ru-RU")} />
            <Tile label="Депозиты сегодня" value={money(data.deposits_today)} />
            <Tile label="Выводы сегодня" value={money(data.withdrawals_today)} />
            <Tile label="Оборот ставок сегодня" value={money(data.turnover_today)} />
            <Tile label="GGR сегодня" value={money(data.ggr_today)} tone={data.ggr_today < 0 ? "neg" : "pos"} />
          </div>
          <div className="tiles">
            <Link href="/withdrawals" className="tile tile-link">
              <div className="tile-label">Выводы в ожидании</div>
              <div className={`tile-value${data.pending_withdrawals > 0 ? " warn" : ""}`}>
                {data.pending_withdrawals.toLocaleString("ru-RU")}
              </div>
              <div className="tile-hint">Открыть очередь →</div>
            </Link>
          </div>
        </>
      )}
    </>
  );
}
