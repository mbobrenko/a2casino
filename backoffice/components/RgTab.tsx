"use client";

// Player card → "Ответственная игра": limits, current time-out / self-exclusion and the change history.
// Staff can only set a stricter limit or apply a (longer) exclusion; the API refuses anything else.

import { useCallback, useEffect, useState } from "react";
import ActionModal from "@/components/ActionModal";
import AuditDiff from "@/components/AuditDiff";
import { Badge } from "@/components/Badge";
import { api, errMsg } from "@/lib/api";
import { dollarsToCentsNonNeg, dt, money } from "@/lib/format";
import type { PlayerRg, RgEvent, RgLimit } from "@/lib/types";

export const RG_KIND_LABELS: Record<string, string> = {
  deposit: "Депозиты",
  loss: "Проигрыш (нетто)",
  wager: "Ставки (оборот)",
  session: "Время игры",
};
const PERIOD_LABELS: Record<string, string> = { day: "24 часа", week: "7 дней", month: "30 дней" };
export const DURATION_LABELS: Record<string, string> = {
  "24h": "24 часа",
  "7d": "7 дней",
  "30d": "30 дней",
  "6w": "6 недель",
  "6m": "6 месяцев",
  "1y": "1 год",
  "5y": "5 лет",
  permanent: "Навсегда",
};
export const EXCLUSION_LABELS: Record<string, string> = { timeout: "Тайм-аут", self_exclusion: "Самоисключение" };
const EVENT_LABELS: Record<string, string> = {
  limit_set: "Лимит установлен",
  limit_pending: "Повышение/снятие (через 24 ч)",
  limit_applied: "Отложенное изменение вступило в силу",
  reality_check: "Напоминание (reality check)",
  exclusion: "Ограничение применено",
  reopen_requested: "Запрос на открытие аккаунта",
  exclusion_ended: "Ограничение закончилось",
};

function amountText(kind: string, v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (kind === "session") return v % 60 === 0 ? `${v / 60} ч` : `${Math.floor(v / 60)} ч ${v % 60} мин`;
  return money(v);
}

/** Human-readable before → after of a history row (limits in $ or hours, exclusions as end dates). */
function EventDiff({ e }: { e: RgEvent }) {
  const b = (e.before || {}) as Record<string, unknown>;
  const a = (e.after || {}) as Record<string, unknown>;
  const lim = (v: unknown) => (v === null || v === undefined ? "нет" : amountText(e.kind, Number(v)));
  if (e.action.startsWith("limit")) {
    return (
      <span className="diff">
        {e.action !== "limit_applied" && <span className="diff-before">{lim(b.amount)}</span>}
        {e.action !== "limit_applied" && " → "}
        <span className="diff-after strong">{lim(a.amount)}</span>
        {typeof a.effective_at === "string" && <span className="muted"> с {dt(a.effective_at)}</span>}
      </span>
    );
  }
  if (e.action === "reality_check") return <span className="diff">{`${b.minutes || "выкл."} → ${a.minutes ? a.minutes + " мин" : "выкл."}`}</span>;
  if (e.action === "exclusion") {
    return (
      <span className="diff">
        {b.kind ? <span className="diff-before">{EXCLUSION_LABELS[String(b.kind)]} до {b.ends_at ? dt(String(b.ends_at)) : "бессрочно"}</span> : null}
        {b.kind ? " → " : null}
        <span className="diff-after strong">до {a.ends_at ? dt(String(a.ends_at)) : "бессрочно"}</span>
      </span>
    );
  }
  if (e.action === "reopen_requested" && typeof a.reopen_at === "string") return <span>откроется {dt(a.reopen_at)}</span>;
  return <AuditDiff before={e.before} after={e.after} />;
}

type Modal = { kind: "limit"; preset?: RgLimit } | { kind: "exclude" } | null;

export default function RgTab({ id, reloadKey, onChanged }: { id: string; reloadKey: number; onChanged: (msg: string) => void }) {
  const [data, setData] = useState<PlayerRg | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<PlayerRg>(`/api/bo/players/${encodeURIComponent(id)}/rg`));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load, reloadKey]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="muted">Загрузка…</div>;
  const ex = data.exclusion;
  const limits = data.limits || [];

  return (
    <>
      <div className="rg-grid">
        <div className="card">
          <div className="section-title">Тайм-аут / самоисключение</div>
          {ex ? (
            <div className="rg-excl">
              <div>
                <Badge tone={ex.kind === "timeout" ? "warn" : "bad"}>{EXCLUSION_LABELS[ex.kind]}</Badge>{" "}
                <b>{DURATION_LABELS[ex.duration] || ex.duration}</b>
                {ex.by_staff && <span className="muted"> · применено сотрудником</span>}
              </div>
              <div className="kv-grid">
                <span className="muted">С</span>
                <span>{dt(ex.starts_at)}</span>
                <span className="muted">До</span>
                <span>{ex.ends_at ? dt(ex.ends_at) : "бессрочно"}</span>
                {ex.period_over && (
                  <>
                    <span className="muted">Статус</span>
                    <span>
                      {ex.reopen_at ? `Срок истёк, аккаунт откроется ${dt(ex.reopen_at)}` : "Срок истёк, игрок ещё не запросил открытие"}
                    </span>
                  </>
                )}
                {ex.reason && (
                  <>
                    <span className="muted">Причина</span>
                    <span>{ex.reason}</span>
                  </>
                )}
              </div>
              <div className="small muted">Вход, просмотр баланса и вывод доступны; депозиты, ставки, бонусы и промокоды — нет. Сократить нельзя.</div>
            </div>
          ) : (
            <div className="muted">Нет действующих ограничений</div>
          )}
          <div className="toolbar" style={{ marginTop: 10, marginBottom: 0 }}>
            <button className="btn btn-danger btn-sm" onClick={() => setModal({ kind: "exclude" })}>
              Применить тайм-аут / самоисключение
            </button>
          </div>
        </div>
        <div className="card">
          <div className="section-title">Напоминание о времени игры</div>
          <div>
            {data.reality_check_minutes ? (
              <>
                каждые <b>{data.reality_check_minutes} мин</b>
              </>
            ) : (
              <span className="muted">выключено</span>
            )}
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            Окна лимитов скользящие: 24 часа, 7 дней, 30 дней. Повышение и снятие лимита игроком вступают в силу через 24 часа.
          </div>
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: 12 }}>
        <div className="section-title" style={{ margin: 0 }}>
          Лимиты
        </div>
        <span className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: "limit" })}>
          + Установить лимит строже
        </button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Тип</th>
              <th>Окно</th>
              <th className="num">Лимит</th>
              <th>Использовано</th>
              <th>Ожидает изменения</th>
              <th>Изменён</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {limits.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  Игрок не установил лимиты
                </td>
              </tr>
            )}
            {limits.map((l) => {
              const ratio = l.amount ? Math.min(1, Math.max(l.used, 0) / l.amount) : 0;
              return (
                <tr key={l.kind + l.period}>
                  <td className="strong">{RG_KIND_LABELS[l.kind] || l.kind}</td>
                  <td>{PERIOD_LABELS[l.period] || l.period}</td>
                  <td className="num strong">{amountText(l.kind, l.amount)}</td>
                  <td>
                    {l.amount !== null && (
                      <div style={{ minWidth: 150 }}>
                        <div className={`progress${ratio >= 1 ? " over" : ""}`}>
                          <div style={{ width: `${(ratio * 100).toFixed(1)}%` }} />
                        </div>
                        <div className="progress-label">
                          {amountText(l.kind, Math.max(l.used, 0))} · {(ratio * 100).toFixed(0)}%
                        </div>
                      </div>
                    )}
                  </td>
                  <td>
                    {l.pending ? (
                      <span className="warn">
                        {l.pending_amount === null ? "снятие" : amountText(l.kind, l.pending_amount)} с {dt(l.effective_at)}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="nowrap">{dt(l.updated_at)}</td>
                  <td>
                    <button className="btn btn-xs" onClick={() => setModal({ kind: "limit", preset: l })}>
                      Строже
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="section-title" style={{ marginTop: 14 }}>
        История изменений
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Время</th>
              <th>Кто</th>
              <th>Событие</th>
              <th>Что</th>
              <th>До → После</th>
            </tr>
          </thead>
          <tbody>
            {(data.history || []).length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  Нет записей
                </td>
              </tr>
            )}
            {(data.history || []).map((e) => (
              <tr key={e.id}>
                <td className="nowrap">{dt(e.created_at)}</td>
                <td>{e.staff || (e.action === "limit_applied" || e.action === "exclusion_ended" ? <span className="muted">система</span> : "игрок")}</td>
                <td>
                  <span className="badge badge-muted" title={e.action}>
                    {EVENT_LABELS[e.action] || e.action}
                  </span>
                </td>
                <td>
                  {e.action.startsWith("limit")
                    ? `${RG_KIND_LABELS[e.kind] || e.kind}, ${PERIOD_LABELS[e.period] || e.period}`
                    : e.kind
                      ? `${EXCLUSION_LABELS[e.kind] || e.kind}${e.period ? ", " + (DURATION_LABELS[e.period] || e.period) : ""}`
                      : "—"}
                </td>
                <td>
                  <EventDiff e={e} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal?.kind === "limit" && (
        <LimitModal
          id={id}
          preset={modal.preset}
          onClose={() => setModal(null)}
          onDone={(m) => {
            onChanged(m);
            load();
          }}
        />
      )}
      {modal?.kind === "exclude" && (
        <ExcludeModal
          id={id}
          onClose={() => setModal(null)}
          onDone={(m) => {
            onChanged(m);
            load();
          }}
        />
      )}
    </>
  );
}

function LimitModal({ id, preset, onClose, onDone }: { id: string; preset?: RgLimit; onClose: () => void; onDone: (m: string) => void }) {
  const [kind, setKind] = useState<string>(preset?.kind || "deposit");
  const [period, setPeriod] = useState<string>(preset?.period || "day");
  const [value, setValue] = useState("");
  const isSession = kind === "session";
  return (
    <ActionModal
      title="Установить лимит строже"
      description={<span className="muted">Новый лимит или ниже действующего. Применяется сразу; отменить его может только игрок (через 24 часа).</span>}
      confirmLabel="Установить"
      onClose={onClose}
      onSubmit={async (comment) => {
        const amount = isSession ? Number(value) : dollarsToCentsNonNeg(value);
        if (!amount || amount <= 0) throw new Error(isSession ? "Укажите минуты" : "Укажите сумму");
        await api(`/api/bo/players/${encodeURIComponent(id)}/rg/limits`, { body: { kind, period: isSession ? "day" : period, amount, comment } });
        onDone(`Лимит «${RG_KIND_LABELS[kind]}» установлен`);
      }}
    >
      <div className="field-row">
        <label className="field">
          <span>Тип</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(RG_KIND_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Окно</span>
          <select value={isSession ? "day" : period} disabled={isSession} onChange={(e) => setPeriod(e.target.value)}>
            {Object.entries(PERIOD_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{isSession ? "Минут" : "Сумма, $"}</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={isSession ? "120" : "100"} autoFocus />
        </label>
      </div>
      {preset && preset.amount !== null && (
        <div className="small muted" style={{ marginBottom: 8 }}>
          Сейчас: {amountText(preset.kind, preset.amount)}
        </div>
      )}
    </ActionModal>
  );
}

function ExcludeModal({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: (m: string) => void }) {
  const [duration, setDuration] = useState("24h");
  const selfEx = !["24h", "7d", "30d", "6w"].includes(duration);
  return (
    <ActionModal
      title="Тайм-аут / самоисключение"
      danger
      confirmLabel="Применить"
      description={
        <span className="muted">
          Начинается сразу. Заменить можно только более длинным ограничением; сократить или отменить нельзя. Ожидающие бонусы
          отменяются, маркетинговые предложения не отправляются.
        </span>
      }
      onClose={onClose}
      onSubmit={async (comment) => {
        await api(`/api/bo/players/${encodeURIComponent(id)}/rg/exclude`, { body: { duration, comment } });
        onDone(`${selfEx ? "Самоисключение" : "Тайм-аут"}: ${DURATION_LABELS[duration]}`);
      }}
    >
      <label className="field">
        <span>Срок</span>
        <select value={duration} onChange={(e) => setDuration(e.target.value)} autoFocus>
          <optgroup label="Тайм-аут">
            {["24h", "7d", "30d", "6w"].map((d) => (
              <option key={d} value={d}>
                {DURATION_LABELS[d]}
              </option>
            ))}
          </optgroup>
          <optgroup label="Самоисключение">
            {["6m", "1y", "5y", "permanent"].map((d) => (
              <option key={d} value={d}>
                {DURATION_LABELS[d]}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      {selfEx && <div className="alert alert-error">Самоисключение нельзя отменить: по окончании аккаунт откроется только по запросу игрока + 24 часа.</div>}
    </ActionModal>
  );
}
