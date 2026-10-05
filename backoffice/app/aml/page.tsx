"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ActionModal from "@/components/ActionModal";
import { Badge, RiskBadge } from "@/components/Badge";
import { api, errMsg } from "@/lib/api";
import { AML_CONTEXT_LABELS, dt } from "@/lib/format";
import type { AmlAddress, AmlResult, AmlScreening } from "@/lib/types";

const TABS = [
  { value: "manual", label: "Чёрный и белый списки" },
  { value: "ofac", label: "Санкции OFAC" },
  { value: "screenings", label: "Журнал проверок" },
];

const LIST_LABELS: Record<string, string> = { blacklist: "Чёрный список", whitelist: "Белый список", ofac: "OFAC" };

type Counts = { ofac: number; blacklist: number; whitelist: number };

export default function AmlPage() {
  const [tab, setTab] = useState("manual");
  const [q, setQ] = useState("");
  const [risk, setRisk] = useState("");
  const [addresses, setAddresses] = useState<AmlAddress[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [screenings, setScreenings] = useState<AmlScreening[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [checkAddr, setCheckAddr] = useState("");
  const [checkResult, setCheckResult] = useState<AmlResult | null>(null);
  const [checking, setChecking] = useState(false);

  const [adding, setAdding] = useState<{ list: string } | null>(null);
  const [newAddr, setNewAddr] = useState("");
  const [newNetwork, setNewNetwork] = useState("");
  const [removing, setRemoving] = useState<AmlAddress | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (tab === "screenings") {
        const r = await api<{ items: AmlScreening[] | null }>(`/api/bo/aml/screenings?limit=200${risk ? "&risk=" + risk : ""}`);
        setScreenings(r.items || []);
      } else {
        const r = await api<{ items: AmlAddress[] | null; counts: Counts }>(`/api/bo/aml/addresses?list=${tab}&q=${encodeURIComponent(q)}`);
        setAddresses(r.items || []);
        setCounts(r.counts);
      }
    } catch (e) {
      setError(errMsg(e));
    }
  }, [tab, q, risk]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function check() {
    setChecking(true);
    setCheckResult(null);
    setError(null);
    try {
      setCheckResult(await api<AmlResult>("/api/bo/aml/check", { method: "POST", body: { address: checkAddr.trim() } }));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>AML: проверка адресов</h1>
        <button className="btn btn-ghost btn-sm" onClick={load}>
          Обновить
        </button>
      </div>
      <p className="muted">
        Каждый адрес для крипто-вывода проверяется автоматически при заявке и ещё раз при одобрении. Адреса из санкционного списка OFAC и
        чёрного списка блокируются, у игрока закрываются выводы и ставится тег aml_review. Адрес, которым уже пользовался другой игрок,
        помечается высоким риском.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ marginBottom: 0, flexWrap: "wrap" }}>
          <input
            className="mono"
            style={{ flex: 1, minWidth: 260 }}
            placeholder="Проверить адрес кошелька"
            value={checkAddr}
            onChange={(e) => setCheckAddr(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && checkAddr.trim() && check()}
          />
          <button className="btn btn-primary btn-sm" disabled={!checkAddr.trim() || checking} onClick={check}>
            {checking ? "Проверяю…" : "Проверить"}
          </button>
        </div>
        {checkResult && (
          <div style={{ marginTop: 10 }}>
            <RiskBadge value={checkResult.risk} reasons={checkResult.reasons} />{" "}
            {checkResult.reasons && checkResult.reasons.length > 0 ? checkResult.reasons.join("; ") : "Совпадений не найдено"}
            <div className="muted small">Источники: {(checkResult.providers || []).join(", ")}</div>
          </div>
        )}
      </div>

      <div className="segmented">
        {TABS.map((t) => (
          <button key={t.value} className={tab === t.value ? "active" : ""} onClick={() => setTab(t.value)}>
            {t.label}
            {counts && t.value === "manual" && ` (${counts.blacklist + counts.whitelist})`}
            {counts && t.value === "ofac" && ` (${counts.ofac})`}
          </button>
        ))}
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && (
        <div className="alert alert-ok" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}

      {tab !== "screenings" && (
        <div className="toolbar">
          <input placeholder="Поиск по адресу" value={q} onChange={(e) => setQ(e.target.value)} />
          {tab === "manual" && (
            <>
              <button className="btn btn-danger btn-sm" onClick={() => setAdding({ list: "blacklist" })}>
                + В чёрный список
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setAdding({ list: "whitelist" })}>
                + В белый список
              </button>
            </>
          )}
        </div>
      )}
      {tab === "screenings" && (
        <div className="toolbar">
          <select value={risk} onChange={(e) => setRisk(e.target.value)}>
            <option value="">Любой риск</option>
            <option value="severe">Запрещён</option>
            <option value="high">Высокий</option>
            <option value="medium">Средний</option>
            <option value="low">Низкий</option>
          </select>
        </div>
      )}

      {tab !== "screenings" ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Адрес</th>
                <th>Список</th>
                <th>Сеть</th>
                <th>Причина</th>
                <th>Добавил</th>
                <th>Дата</th>
                {tab === "manual" && <th></th>}
              </tr>
            </thead>
            <tbody>
              {addresses?.map((a) => (
                <tr key={a.address}>
                  <td className="mono small">{a.address}</td>
                  <td>
                    <Badge tone={a.list === "whitelist" ? "ok" : "bad"}>{LIST_LABELS[a.list] || a.list}</Badge>
                  </td>
                  <td>{a.network || "—"}</td>
                  <td>{a.reason || "—"}</td>
                  <td>{a.added_by || "—"}</td>
                  <td className="nowrap">{dt(a.created_at)}</td>
                  {tab === "manual" && (
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => setRemoving(a)}>
                        Удалить
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {addresses && addresses.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">
                    {tab === "manual" ? "Списки пусты" : "Ничего не найдено"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Адрес</th>
                <th>Игрок</th>
                <th>Когда</th>
                <th>Риск</th>
                <th>Причины</th>
                <th>Источники</th>
              </tr>
            </thead>
            <tbody>
              {screenings?.map((s) => (
                <tr key={s.id}>
                  <td className="nowrap">{dt(s.created_at)}</td>
                  <td className="mono small">{s.address}</td>
                  <td>{s.player_id ? <Link href={`/players/${s.player_id}`}>{s.player_email}</Link> : "—"}</td>
                  <td>{AML_CONTEXT_LABELS[s.context] || s.context}</td>
                  <td>
                    <RiskBadge value={s.risk} />
                  </td>
                  <td>{s.reasons && s.reasons.length ? s.reasons.join("; ") : "—"}</td>
                  <td className="muted small">{(s.providers || []).join(", ")}</td>
                </tr>
              ))}
              {screenings && screenings.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">
                    Проверок пока не было
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <ActionModal
          title={adding.list === "blacklist" ? "Добавить в чёрный список" : "Добавить в белый список"}
          description={
            adding.list === "blacklist"
              ? "Выводы на этот адрес будут запрещены."
              : "Адрес не будет помечаться как общий или подозрительный. Санкционные адреса это не отменяет."
          }
          danger={adding.list === "blacklist"}
          confirmLabel="Добавить"
          onClose={() => {
            setAdding(null);
            setNewAddr("");
            setNewNetwork("");
          }}
          onSubmit={async (comment) => {
            await api("/api/bo/aml/addresses", { method: "POST", body: { address: newAddr.trim(), list: adding.list, network: newNetwork.trim(), comment } });
            setNotice(`Адрес добавлен: ${LIST_LABELS[adding.list]}`);
            setNewAddr("");
            setNewNetwork("");
            await load();
          }}
        >
          <label className="field">
            <span>Адрес кошелька</span>
            <input className="mono" value={newAddr} onChange={(e) => setNewAddr(e.target.value)} />
          </label>
          <label className="field">
            <span>Сеть (необязательно)</span>
            <input placeholder="TRC20, ERC20, BTC…" value={newNetwork} onChange={(e) => setNewNetwork(e.target.value)} />
          </label>
        </ActionModal>
      )}
      {removing && (
        <ActionModal
          title="Удалить адрес из списка?"
          description={<span className="mono small">{removing.address}</span>}
          danger
          confirmLabel="Удалить"
          onClose={() => setRemoving(null)}
          onSubmit={async (comment) => {
            await api("/api/bo/aml/addresses/remove", { method: "POST", body: { address: removing.address, comment } });
            setNotice("Адрес удалён из списка");
            await load();
          }}
        />
      )}
    </>
  );
}
