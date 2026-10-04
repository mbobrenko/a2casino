"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ActionModal from "@/components/ActionModal";
import { api, errMsg } from "@/lib/api";
import { int } from "@/lib/format";
import type { VipLevel } from "@/lib/types";

type Draft = { name: string; min_points: string; cashback_pct: string; rakeback_pct: string; perks: string };

function toDraft(l: VipLevel): Draft {
  return {
    name: l.name,
    min_points: String(l.min_points),
    cashback_pct: String(l.cashback_pct),
    rakeback_pct: String(l.rakeback_pct),
    perks: l.perks,
  };
}

function num(s: string): number {
  return Number(s.trim().replace(",", "."));
}

/** Changed fields of a row, or throws a validation error. */
function diff(l: VipLevel, d: Draft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!d.name.trim()) throw new Error("Название уровня не может быть пустым");
  if (d.name.trim() !== l.name) out.name = d.name.trim();
  const mp = num(d.min_points);
  if (!Number.isInteger(mp) || mp < 0) throw new Error("Мин. очков: целое число ≥ 0");
  if (mp !== l.min_points) out.min_points = mp;
  const cb = num(d.cashback_pct);
  if (Number.isNaN(cb) || cb < 0 || cb > 50) throw new Error("Кэшбэк: от 0 до 50%");
  if (cb !== l.cashback_pct) out.cashback_pct = cb;
  const rb = num(d.rakeback_pct);
  if (Number.isNaN(rb) || rb < 0 || rb > 5) throw new Error("Рейкбэк: от 0 до 5% оборота");
  if (rb !== l.rakeback_pct) out.rakeback_pct = rb;
  if (d.perks !== l.perks) out.perks = d.perks;
  return out;
}

function isDirty(l: VipLevel, d: Draft | undefined): boolean {
  if (!d) return false;
  const a = toDraft(l);
  return (Object.keys(a) as (keyof Draft)[]).some((k) => a[k] !== d[k]);
}

export default function VipPage() {
  const [rows, setRows] = useState<VipLevel[] | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState<{ level: VipLevel; body: Record<string, unknown> } | null>(null);

  const rowsRef = useRef<VipLevel[]>([]);

  /** Reload; with keepEdits, unsaved edits in other rows survive (only `except` is reset). */
  const load = useCallback(async (keepEdits = false, except?: number) => {
    setError(null);
    try {
      const r = await api<{ levels: VipLevel[] | null }>(`/api/bo/vip`);
      const levels = r.levels || [];
      const prevRows = rowsRef.current;
      rowsRef.current = levels;
      setRows(levels);
      setDrafts((prev) =>
        Object.fromEntries(
          levels.map((l) => {
            const old = prevRows.find((x) => x.level === l.level);
            const keep = keepEdits && l.level !== except && old && isDirty(old, prev[l.level]);
            return [l.level, keep ? prev[l.level] : toDraft(l)];
          }),
        ),
      );
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function set(level: number, key: keyof Draft, value: string) {
    setDrafts((d) => ({ ...d, [level]: { ...d[level], [key]: value } }));
  }

  function save(l: VipLevel) {
    setError(null);
    try {
      const body = diff(l, drafts[l.level]);
      if (Object.keys(body).length === 0) throw new Error("Нет изменений");
      setSaving({ level: l, body });
    } catch (e) {
      setError(`Уровень ${l.level}: ${errMsg(e)}`);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>VIP-уровни</h1>
        <button className="btn btn-ghost btn-sm" onClick={() => load()}>
          Обновить
        </button>
      </div>
      <div className="small muted" style={{ marginBottom: 10 }}>
        1 очко = $1 ставок реальными деньгами. Кэшбэк — % от чистого проигрыша, рейкбэк — % от оборота. Измените значения в
        строке и нажмите «Сохранить».
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
              <th className="num">Уровень</th>
              <th>Название</th>
              <th className="num">Мин. очков</th>
              <th className="num">Кэшбэк, %</th>
              <th className="num">Рейкбэк, %</th>
              <th>Привилегии</th>
              <th className="num">Игроков</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((l) => {
              const d = drafts[l.level];
              const dirty = isDirty(l, d);
              if (!d) return null;
              return (
                <tr key={l.level} className={dirty ? "dirty" : ""}>
                  <td className="num strong">{l.level}</td>
                  <td style={{ minWidth: 120 }}>
                    <input className="cell-input" value={d.name} onChange={(e) => set(l.level, "name", e.target.value)} />
                  </td>
                  <td className="num">
                    <input
                      className="cell-input num-input"
                      inputMode="numeric"
                      value={d.min_points}
                      disabled={l.level === 1}
                      title={l.level === 1 ? "Первый уровень всегда начинается с 0" : undefined}
                      onChange={(e) => set(l.level, "min_points", e.target.value)}
                    />
                  </td>
                  <td className="num">
                    <input className="cell-input num-input" inputMode="decimal" value={d.cashback_pct} onChange={(e) => set(l.level, "cashback_pct", e.target.value)} />
                  </td>
                  <td className="num">
                    <input className="cell-input num-input" inputMode="decimal" value={d.rakeback_pct} onChange={(e) => set(l.level, "rakeback_pct", e.target.value)} />
                  </td>
                  <td style={{ minWidth: 260, width: "40%" }}>
                    <input className="cell-input" value={d.perks} onChange={(e) => set(l.level, "perks", e.target.value)} />
                  </td>
                  <td className="num">{int(l.players)}</td>
                  <td className="nowrap">
                    <button className="btn btn-primary btn-xs" disabled={!dirty} onClick={() => save(l)}>
                      Сохранить
                    </button>{" "}
                    {dirty && (
                      <button className="btn btn-ghost btn-xs" onClick={() => setDrafts((x) => ({ ...x, [l.level]: toDraft(l) }))}>
                        Отменить
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="empty">
                  Нет уровней
                </td>
              </tr>
            )}
            {!rows && !error && (
              <tr>
                <td colSpan={8} className="empty">
                  Загрузка…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {saving && (
        <ActionModal
          title={`Сохранить уровень ${saving.level.level} «${saving.level.name}»`}
          description={
            <div className="diff">
              {Object.entries(saving.body).map(([k, v]) => (
                <span key={k} className="diff-item">
                  <span className="diff-key">{k}:</span>{" "}
                  <span className="diff-before">{String((saving.level as unknown as Record<string, unknown>)[k])}</span> →{" "}
                  <span className="diff-after">{String(v)}</span>
                </span>
              ))}
            </div>
          }
          confirmLabel="Сохранить"
          onClose={() => setSaving(null)}
          onSubmit={async (comment) => {
            await api(`/api/bo/vip/${saving.level.level}`, { body: { ...saving.body, comment } });
            setNotice(`Уровень ${saving.level.level} сохранён`);
            await load(true, saving.level.level);
          }}
        />
      )}
    </>
  );
}
