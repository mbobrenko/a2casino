"use client";

import { useCallback, useEffect, useState } from "react";
import ActionModal from "@/components/ActionModal";
import { Badge } from "@/components/Badge";
import Switch from "@/components/Switch";
import { api, errMsg } from "@/lib/api";
import { BONUS_KIND_LABELS, bonusTerms, dateOnly, dt, int } from "@/lib/format";
import type { BoBonus, PromoCode } from "@/lib/types";

type Action = { kind: "toggle"; c: PromoCode } | { kind: "create" };

function isExpired(c: PromoCode): boolean {
  return !!c.expires_at && new Date(c.expires_at).getTime() < Date.now();
}

export default function PromoCodesPage() {
  const [rows, setRows] = useState<PromoCode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api<{ promo_codes: PromoCode[] | null }>(`/api/bo/promocodes`);
      setRows(r.promo_codes || []);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function done(msg: string) {
    setNotice(msg);
    load();
  }

  return (
    <>
      <div className="page-head">
        <h1>Промокоды</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setAction({ kind: "create" })}>
          + Новый промокод
        </button>
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
              <th>Код</th>
              <th>Бонус</th>
              <th className="num">Использований</th>
              <th>Действует до</th>
              <th>Состояние</th>
              <th>Создан</th>
              <th>Активен</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((c) => {
              const exhausted = c.max_uses > 0 && c.uses >= c.max_uses;
              const expired = isExpired(c);
              return (
                <tr key={c.code} className={c.active ? "" : "inactive"}>
                  <td className="mono strong">{c.code}</td>
                  <td>
                    <div>{c.bonus_title}</div>
                    <div className="muted small">
                      #{c.bonus_id} · {BONUS_KIND_LABELS[c.bonus_kind] || c.bonus_kind}
                    </div>
                  </td>
                  <td className="num">
                    {int(c.uses)} / {c.max_uses > 0 ? int(c.max_uses) : "∞"}
                  </td>
                  <td className="nowrap">{c.expires_at ? dt(c.expires_at) : <span className="muted">бессрочно</span>}</td>
                  <td>
                    {!c.active ? (
                      <Badge tone="muted">Отключён</Badge>
                    ) : expired ? (
                      <Badge tone="bad">Истёк</Badge>
                    ) : exhausted ? (
                      <Badge tone="warn">Лимит исчерпан</Badge>
                    ) : (
                      <Badge tone="ok">Работает</Badge>
                    )}
                  </td>
                  <td className="nowrap">{dateOnly(c.created_at)}</td>
                  <td>
                    <Switch on={c.active} title={c.active ? "Деактивировать" : "Активировать"} onClick={() => setAction({ kind: "toggle", c })} />
                  </td>
                </tr>
              );
            })}
            {rows && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  Нет промокодов
                </td>
              </tr>
            )}
            {!rows && !error && (
              <tr>
                <td colSpan={7} className="empty">
                  Загрузка…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {action?.kind === "toggle" && (
        <ActionModal
          title={action.c.active ? "Деактивировать промокод" : "Активировать промокод"}
          description={
            <>
              <b className="mono">{action.c.code}</b> → {action.c.bonus_title}
            </>
          }
          danger={action.c.active}
          confirmLabel={action.c.active ? "Деактивировать" : "Активировать"}
          onClose={() => setAction(null)}
          onSubmit={async (comment) => {
            await api(`/api/bo/promocodes/${encodeURIComponent(action.c.code)}`, { body: { active: !action.c.active, comment } });
            done(`Промокод ${action.c.code} ${action.c.active ? "деактивирован" : "активирован"}`);
          }}
        />
      )}
      {action?.kind === "create" && <CreatePromoModal onClose={() => setAction(null)} onDone={done} />}
    </>
  );
}

function CreatePromoModal({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [code, setCode] = useState("");
  const [bonusId, setBonusId] = useState("");
  const [maxUses, setMaxUses] = useState("0");
  const [expires, setExpires] = useState("");
  const [bonuses, setBonuses] = useState<BoBonus[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ bonuses: BoBonus[] | null }>(`/api/bo/bonuses`)
      .then((r) => setBonuses(r.bonuses || []))
      .catch((e) => setLoadErr(errMsg(e)));
  }, []);

  const selected = bonuses?.find((b) => String(b.id) === bonusId);
  const normalized = code.trim().toUpperCase();

  return (
    <ActionModal
      title="Новый промокод"
      confirmLabel="Создать"
      onClose={onClose}
      onSubmit={async (comment) => {
        if (!/^\S{3,32}$/.test(normalized)) throw new Error("Код: 3–32 символа без пробелов");
        if (!bonusId) throw new Error("Выберите бонус");
        const mu = Number(maxUses);
        if (!Number.isInteger(mu) || mu < 0) throw new Error("Лимит использований: целое число ≥ 0");
        const body: Record<string, unknown> = { code: normalized, bonus_id: Number(bonusId), max_uses: mu, comment };
        if (expires) {
          // valid through the end of the chosen day (local time)
          const d = new Date(`${expires}T23:59:59`);
          if (Number.isNaN(d.getTime())) throw new Error("Некорректная дата");
          if (d.getTime() < Date.now()) throw new Error("Дата окончания уже прошла");
          body.expires_at = d.toISOString();
        }
        await api(`/api/bo/promocodes`, { body });
        onDone(`Промокод ${normalized} создан`);
      }}
    >
      {loadErr && <div className="alert alert-error">{loadErr}</div>}
      <label className="field">
        <span>Код *</span>
        <input className="mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SUMMER25" autoFocus />
      </label>
      <label className="field">
        <span>Бонус *</span>
        <select value={bonusId} onChange={(e) => setBonusId(e.target.value)}>
          <option value="">{bonuses ? "— выберите бонус —" : "Загрузка…"}</option>
          {bonuses?.map((b) => (
            <option key={b.id} value={b.id}>
              #{b.id} {b.title}
              {b.active ? "" : " (отключён)"}
            </option>
          ))}
        </select>
        {selected && (
          <span className="field-hint">
            {BONUS_KIND_LABELS[selected.kind] || selected.kind}: {bonusTerms(selected)}
            {!selected.active && <span className="neg"> — бонус отключён, активация не сработает</span>}
          </span>
        )}
      </label>
      <div className="field-row">
        <label className="field">
          <span>Макс. использований</span>
          <input type="number" min={0} step={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
          <span className="field-hint">0 — без лимита</span>
        </label>
        <label className="field">
          <span>Действует до (необязательно)</span>
          <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          <span className="field-hint">включительно; пусто — бессрочно</span>
        </label>
      </div>
    </ActionModal>
  );
}
