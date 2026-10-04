"use client";

import { useCallback, useEffect, useState } from "react";
import ActionModal from "@/components/ActionModal";
import { Badge } from "@/components/Badge";
import Switch from "@/components/Switch";
import { api, errMsg } from "@/lib/api";
import { BONUS_KIND_LABELS, BONUS_TRIGGER_LABELS, bonusTerms, centsToInput, dollarsToCentsNonNeg, int, money } from "@/lib/format";
import type { BoBonus, BoGame, Bonus } from "@/lib/types";

type Action = { kind: "toggle"; b: BoBonus } | { kind: "edit"; b: BoBonus } | { kind: "create" };

const KIND_TONE: Record<string, string> = { deposit_match: "ok", no_deposit: "info", freespins: "warn" };

export default function BonusesPage() {
  const [rows, setRows] = useState<BoBonus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api<{ bonuses: BoBonus[] | null }>(`/api/bo/bonuses`);
      setRows(r.bonuses || []);
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
        <h1>Бонусы</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setAction({ kind: "create" })}>
          + Новый бонус
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
              <th className="num">ID</th>
              <th>Бонус</th>
              <th>Тип</th>
              <th>Триггер</th>
              <th>Условия</th>
              <th className="num">Выдано</th>
              <th className="num">Активных</th>
              <th className="num">Отыграно</th>
              <th className="num" title="Сумма начисленных бонусов (без ожидающих)">Начислено</th>
              <th>Активен</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((b) => (
              <tr key={b.id} className={b.active ? "" : "inactive"}>
                <td className="num muted">{b.id}</td>
                <td>
                  <div className="strong">{b.title}</div>
                  {b.description && <div className="muted small ellipsis" style={{ maxWidth: 320 }} title={b.description}>{b.description}</div>}
                </td>
                <td>
                  <Badge tone={KIND_TONE[b.kind] || "muted"} title={b.kind}>
                    {BONUS_KIND_LABELS[b.kind] || b.kind}
                  </Badge>
                </td>
                <td title={b.trigger}>{BONUS_TRIGGER_LABELS[b.trigger] || b.trigger}</td>
                <td className="small">{bonusTerms(b)}</td>
                <td className="num">{int(b.given)}</td>
                <td className="num">{int(b.active_count)}</td>
                <td className="num">{int(b.completed)}</td>
                <td className="num">{money(b.granted_sum)}</td>
                <td>
                  <Switch on={b.active} title={b.active ? "Отключить" : "Включить"} onClick={() => setAction({ kind: "toggle", b })} />
                </td>
                <td>
                  <button className="btn btn-sm" onClick={() => setAction({ kind: "edit", b })}>
                    Изменить
                  </button>
                </td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr>
                <td colSpan={11} className="empty">
                  Нет бонусов
                </td>
              </tr>
            )}
            {!rows && !error && (
              <tr>
                <td colSpan={11} className="empty">
                  Загрузка…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {action?.kind === "toggle" && (
        <ActionModal
          title={action.b.active ? "Отключить бонус" : "Включить бонус"}
          description={
            <>
              <b>{action.b.title}</b>
              {action.b.active && <div className="small muted">Уже выданные бонусы продолжат действовать.</div>}
            </>
          }
          danger={action.b.active}
          confirmLabel={action.b.active ? "Отключить" : "Включить"}
          onClose={() => setAction(null)}
          onSubmit={async (comment) => {
            await api(`/api/bo/bonuses/${action.b.id}`, { body: { active: !action.b.active, comment } });
            done(`«${action.b.title}» ${action.b.active ? "отключён" : "включён"}`);
          }}
        />
      )}
      {(action?.kind === "edit" || action?.kind === "create") && (
        <BonusForm bonus={action.kind === "edit" ? action.b : null} onClose={() => setAction(null)} onDone={done} />
      )}
    </>
  );
}

function BonusForm({ bonus, onClose, onDone }: { bonus: BoBonus | null; onClose: () => void; onDone: (msg: string) => void }) {
  const b = bonus;
  const [title, setTitle] = useState(b?.title || "");
  const [description, setDescription] = useState(b?.description || "");
  const [kind, setKind] = useState(b?.kind || "deposit_match");
  const [trigger, setTrigger] = useState(b?.trigger || "deposit");
  const [active, setActive] = useState(b ? b.active : true);
  const [percent, setPercent] = useState(String(b?.percent ?? 100));
  const [maxAmount, setMaxAmount] = useState(centsToInput(b?.max_amount));
  const [fixedAmount, setFixedAmount] = useState(centsToInput(b?.fixed_amount));
  const [minDeposit, setMinDeposit] = useState(centsToInput(b?.min_deposit));
  const [wager, setWager] = useState(String(b?.wager_multiplier ?? 35));
  const [fsCount, setFsCount] = useState(String(b?.freespins_count ?? 0));
  const [fsValue, setFsValue] = useState(centsToInput(b?.freespin_value));
  const [fsGame, setFsGame] = useState(b?.freespin_game || "");
  const [validDays, setValidDays] = useState(String(b?.valid_days ?? 7));
  const [games, setGames] = useState<BoGame[]>([]);

  useEffect(() => {
    api<{ games: BoGame[] | null }>(`/api/bo/games?category=slots`)
      .then((r) => setGames(r.games || []))
      .catch(() => setGames([]));
  }, []);

  // min deposit matters for deposit-based bonuses and deposit-triggered offers
  const showMinDeposit = kind === "deposit_match" || trigger === "deposit" || trigger === "welcome";

  function intField(label: string, v: string, min = 0): number {
    const n = Number(v);
    if (v.trim() === "" || !Number.isInteger(n) || n < min) throw new Error(`${label}: целое число ≥ ${min}`);
    return n;
  }
  function moneyField(label: string, v: string): number {
    const c = dollarsToCentsNonNeg(v);
    if (c === null) throw new Error(`${label}: некорректная сумма`);
    return c;
  }

  async function submit(comment: string) {
    if (!title.trim()) throw new Error("Укажите название");
    const next: Partial<Bonus> = {
      title: title.trim(),
      description,
      kind,
      trigger,
      active,
      wager_multiplier: intField("Вейджер", wager),
      valid_days: intField("Срок действия", validDays, 1),
    };
    if (kind === "deposit_match") {
      next.percent = intField("Процент", percent);
      if (!next.percent) throw new Error("Процент должен быть больше 0");
      next.max_amount = moneyField("Максимум", maxAmount);
    }
    if (kind === "no_deposit") {
      next.fixed_amount = moneyField("Сумма", fixedAmount);
      if (!next.fixed_amount) throw new Error("Сумма бонуса должна быть больше 0");
    }
    if (kind === "freespins") {
      next.freespins_count = intField("Количество фриспинов", fsCount, 1);
      next.freespin_value = moneyField("Ставка фриспина", fsValue);
      if (!next.freespin_value) throw new Error("Ставка фриспина должна быть больше 0");
      if (!fsGame) throw new Error("Выберите игру для фриспинов");
      next.freespin_game = fsGame;
    }
    if (showMinDeposit) next.min_deposit = moneyField("Мин. депозит", minDeposit);

    if (!b) {
      const r = await api<{ id: number }>(`/api/bo/bonuses`, { body: { ...next, comment } });
      onDone(`Бонус «${next.title}» создан (#${r.id})`);
      return;
    }
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(next)) {
      if ((b as unknown as Record<string, unknown>)[k] !== v) body[k] = v;
    }
    if (Object.keys(body).length === 0) throw new Error("Нет изменений");
    await api(`/api/bo/bonuses/${b.id}`, { body: { ...body, comment } });
    onDone(`Бонус «${next.title}» сохранён`);
  }

  return (
    <ActionModal
      wide
      title={b ? `Бонус #${b.id}` : "Новый бонус"}
      confirmLabel={b ? "Сохранить" : "Создать"}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="modal-scroll">
        <label className="field">
          <span>Название *</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>Описание (видно игроку)</span>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Тип</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(BONUS_KIND_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Триггер</span>
            <select value={trigger} onChange={(e) => setTrigger(e.target.value)}>
              {Object.entries(BONUS_TRIGGER_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>

        {kind === "deposit_match" && (
          <div className="field-row">
            <label className="field">
              <span>Процент от депозита, %</span>
              <input type="number" min={1} step={1} value={percent} onChange={(e) => setPercent(e.target.value)} />
            </label>
            <label className="field">
              <span>Максимум бонуса, $ (0 — без лимита)</span>
              <input value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="500" />
            </label>
          </div>
        )}
        {kind === "no_deposit" && (
          <label className="field">
            <span>Сумма бонуса, $</span>
            <input value={fixedAmount} onChange={(e) => setFixedAmount(e.target.value)} placeholder="5" />
          </label>
        )}
        {kind === "freespins" && (
          <>
            <div className="field-row">
              <label className="field">
                <span>Количество фриспинов</span>
                <input type="number" min={1} step={1} value={fsCount} onChange={(e) => setFsCount(e.target.value)} />
              </label>
              <label className="field">
                <span>Ставка одного спина, $</span>
                <input value={fsValue} onChange={(e) => setFsValue(e.target.value)} placeholder="0.20" />
              </label>
            </div>
            <label className="field">
              <span>Игра</span>
              <select value={fsGame} onChange={(e) => setFsGame(e.target.value)}>
                <option value="">— выберите слот —</option>
                {fsGame && !games.some((g) => g.slug === fsGame) && <option value={fsGame}>{fsGame}</option>}
                {games.map((g) => (
                  <option key={g.slug} value={g.slug}>
                    {g.emoji} {g.title} ({g.slug})
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <div className="field-row">
          {showMinDeposit && (
            <label className="field">
              <span>Мин. депозит, $</span>
              <input value={minDeposit} onChange={(e) => setMinDeposit(e.target.value)} placeholder="10" />
            </label>
          )}
          <label className="field">
            <span>Вейджер, x</span>
            <input type="number" min={0} step={1} value={wager} onChange={(e) => setWager(e.target.value)} />
          </label>
          <label className="field">
            <span>Срок действия, дней</span>
            <input type="number" min={1} step={1} value={validDays} onChange={(e) => setValidDays(e.target.value)} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Активен (доступен для выдачи)
        </label>
      </div>
    </ActionModal>
  );
}
