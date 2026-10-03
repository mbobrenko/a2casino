"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useState } from "react";
import ActionModal from "@/components/ActionModal";
import { Badge, StatusBadge, VerificationBadge } from "@/components/Badge";
import Tile from "@/components/Tile";
import { api, errMsg } from "@/lib/api";
import { VERIFICATIONS, VERIFICATION_LABELS, dollarsToCents, dt, money, shortJson } from "@/lib/format";
import type { AuditEntry, Items, LedgerTx, Payment, PlayerCard, Round } from "@/lib/types";

type Tab = "rounds" | "payments" | "transactions" | "audit";
const TABS: { key: Tab; label: string }[] = [
  { key: "rounds", label: "Ставки" },
  { key: "payments", label: "Платежи" },
  { key: "transactions", label: "Транзакции" },
  { key: "audit", label: "Аудит" },
];

type Action =
  | { kind: "status"; to: "active" | "blocked" }
  | { kind: "verification" }
  | { kind: "withdrawals"; to: boolean }
  | { kind: "add_tag" }
  | { kind: "remove_tag"; tag: string }
  | { kind: "adjust" };

export default function PlayerPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [card, setCard] = useState<PlayerCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("rounds");
  const [reloadKey, setReloadKey] = useState(0);
  const [action, setAction] = useState<Action | null>(null);

  const loadCard = useCallback(async () => {
    try {
      setCard(await api<PlayerCard>(`/api/bo/players/${encodeURIComponent(id)}`));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [id]);

  useEffect(() => {
    loadCard();
  }, [loadCard]);

  function refreshAll(msg: string) {
    setNotice(msg);
    loadCard();
    setReloadKey((k) => k + 1);
  }

  if (error && !card) {
    return (
      <>
        <div className="crumbs">
          <Link href="/players">← Игроки</Link>
        </div>
        <div className="alert alert-error">{error}</div>
      </>
    );
  }
  if (!card) return <div className="muted">Загрузка…</div>;

  const { player: p, balance: b, stats: s } = card;
  const tags = p.tags || [];

  return (
    <>
      <div className="crumbs">
        <Link href="/players">← Игроки</Link>
      </div>

      <div className="card player-head">
        <div className="player-title">
          <h1>{p.email}</h1>
          <div className="mono muted small">{p.id}</div>
        </div>
        <div className="player-meta">
          <span className="meta-item">
            <span className="muted">Страна</span> <b>{p.country}</b>
          </span>
          <span className="meta-item">
            <span className="muted">Статус</span> <StatusBadge value={p.status} />
          </span>
          <span className="meta-item">
            <span className="muted">Верификация</span> <VerificationBadge value={p.verification} />
          </span>
          <span className="meta-item">
            <span className="muted">Выводы</span>{" "}
            {p.withdrawals_blocked ? <Badge tone="bad">Заблокированы</Badge> : <Badge tone="ok">Разрешены</Badge>}
          </span>
          <span className="meta-item">
            <span className="muted">Регистрация</span> {dt(p.created_at)}
          </span>
          {p.registration_ip && (
            <span className="meta-item">
              <span className="muted">IP</span> <span className="mono">{p.registration_ip}</span>
            </span>
          )}
          {p.affiliate_ref && (
            <span className="meta-item">
              <span className="muted">Реф.</span> {p.affiliate_ref}
            </span>
          )}
        </div>
        <div className="player-tags">
          <span className="muted">Теги:</span>
          {tags.length === 0 && <span className="muted">нет</span>}
          {tags.map((t) => (
            <span key={t} className="tag tag-removable">
              {t}
              <button title="Удалить тег" onClick={() => setAction({ kind: "remove_tag", tag: t })}>
                ×
              </button>
            </span>
          ))}
          <button className="btn btn-ghost btn-xs" onClick={() => setAction({ kind: "add_tag" })}>
            + тег
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && (
        <div className="alert alert-ok" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}

      <div className="player-grid">
        <div>
          <div className="section-title">Баланс</div>
          <div className="tiles">
            <Tile label="Реальный" value={money(b.real)} />
            <Tile label="Бонусный" value={money(b.bonus)} />
            <Tile label="Заблокировано" value={money(b.locked)} />
          </div>
          <div className="section-title">Статистика</div>
          <div className="tiles tiles-sm">
            <Tile label="Депозиты" value={`${s.deposits_count} / ${money(s.deposits_sum)}`} />
            <Tile label="Выводы" value={`${s.withdrawals_count} / ${money(s.withdrawals_sum)}`} />
            <Tile label="Выводы в ожидании" value={money(s.pending_withdrawals_sum)} />
            <Tile label="InOut" value={money(s.inout)} tone={s.inout < 0 ? "neg" : undefined} hint="Депозиты − выводы" />
            <Tile label="Ставок" value={s.bets_count.toLocaleString("ru-RU")} />
            <Tile label="Выигрышей" value={s.wins_count.toLocaleString("ru-RU")} />
            <Tile label="Оборот" value={money(s.turnover)} />
            <Tile label="Сумма выигрышей" value={money(s.total_win)} />
            <Tile label="GGR" value={money(s.ggr)} tone={s.ggr < 0 ? "neg" : "pos"} />
            <Tile label="Первый депозит" value={dt(s.first_deposit_at)} />
            <Tile label="Последняя ставка" value={dt(s.last_bet_at)} />
          </div>
        </div>

        <div className="card actions-panel">
          <div className="section-title">Действия</div>
          <div className="action-row">
            <span>Аккаунт</span>
            {p.status === "blocked" ? (
              <button className="btn btn-success btn-sm" onClick={() => setAction({ kind: "status", to: "active" })}>
                Разблокировать
              </button>
            ) : (
              <button className="btn btn-danger btn-sm" onClick={() => setAction({ kind: "status", to: "blocked" })}>
                Заблокировать
              </button>
            )}
          </div>
          <div className="action-row">
            <span>Выводы</span>
            {p.withdrawals_blocked ? (
              <button className="btn btn-success btn-sm" onClick={() => setAction({ kind: "withdrawals", to: false })}>
                Разрешить выводы
              </button>
            ) : (
              <button className="btn btn-danger btn-sm" onClick={() => setAction({ kind: "withdrawals", to: true })}>
                Запретить выводы
              </button>
            )}
          </div>
          <div className="action-row">
            <span>Верификация</span>
            <button className="btn btn-sm" onClick={() => setAction({ kind: "verification" })}>
              Изменить
            </button>
          </div>
          <div className="action-row">
            <span>Тег</span>
            <button className="btn btn-sm" onClick={() => setAction({ kind: "add_tag" })}>
              Добавить тег
            </button>
          </div>
          <div className="action-row">
            <span>Баланс</span>
            <button className="btn btn-sm" onClick={() => setAction({ kind: "adjust" })}>
              Корректировка
            </button>
          </div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="tab-body">
        {tab === "rounds" && <RoundsTab id={id} reloadKey={reloadKey} />}
        {tab === "payments" && <PaymentsTab id={id} reloadKey={reloadKey} />}
        {tab === "transactions" && <TransactionsTab id={id} reloadKey={reloadKey} />}
        {tab === "audit" && <AuditTab id={id} reloadKey={reloadKey} />}
      </div>

      {action && (
        <PlayerActionModal
          action={action}
          card={card}
          onClose={() => setAction(null)}
          onDone={(msg) => refreshAll(msg)}
        />
      )}
    </>
  );
}

/* ---------- action modal ---------- */

function PlayerActionModal({
  action,
  card,
  onClose,
  onDone,
}: {
  action: Action;
  card: PlayerCard;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const id = card.player.id;
  const [verification, setVerification] = useState(card.player.verification);
  const [tag, setTag] = useState("");
  const [kind, setKind] = useState<"real" | "bonus">("real");
  const [amount, setAmount] = useState("");

  const update = (body: Record<string, unknown>) =>
    api(`/api/bo/players/${encodeURIComponent(id)}/update`, { body });

  let title = "";
  let confirmLabel = "Подтвердить";
  let danger = false;
  let fields: React.ReactNode = null;
  let submit: (comment: string) => Promise<void>;

  switch (action.kind) {
    case "status":
      title = action.to === "blocked" ? "Заблокировать игрока" : "Разблокировать игрока";
      confirmLabel = action.to === "blocked" ? "Заблокировать" : "Разблокировать";
      danger = action.to === "blocked";
      submit = async (comment) => {
        await update({ status: action.to, comment });
        onDone(action.to === "blocked" ? "Игрок заблокирован" : "Игрок разблокирован");
      };
      break;
    case "withdrawals":
      title = action.to ? "Запретить выводы" : "Разрешить выводы";
      confirmLabel = action.to ? "Запретить" : "Разрешить";
      danger = action.to;
      submit = async (comment) => {
        await update({ withdrawals_blocked: action.to, comment });
        onDone(action.to ? "Выводы запрещены" : "Выводы разрешены");
      };
      break;
    case "verification":
      title = "Статус верификации";
      fields = (
        <label className="field">
          <span>Новый статус</span>
          <select value={verification} onChange={(e) => setVerification(e.target.value)}>
            {VERIFICATIONS.map((v) => (
              <option key={v} value={v}>
                {VERIFICATION_LABELS[v]} ({v})
              </option>
            ))}
          </select>
        </label>
      );
      submit = async (comment) => {
        if (verification === card.player.verification) throw new Error("Статус не изменён");
        await update({ verification, comment });
        onDone(`Верификация: ${VERIFICATION_LABELS[verification] || verification}`);
      };
      break;
    case "add_tag":
      title = "Добавить тег";
      fields = (
        <label className="field">
          <span>Тег</span>
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="например, vip" autoFocus />
        </label>
      );
      submit = async (comment) => {
        const t = tag.trim();
        if (!t) throw new Error("Введите тег");
        await update({ add_tag: t, comment });
        onDone(`Тег «${t}» добавлен`);
      };
      break;
    case "remove_tag":
      title = `Удалить тег «${action.tag}»`;
      confirmLabel = "Удалить";
      danger = true;
      submit = async (comment) => {
        await update({ remove_tag: action.tag, comment });
        onDone(`Тег «${action.tag}» удалён`);
      };
      break;
    case "adjust": {
      title = "Ручная корректировка баланса";
      const cents = dollarsToCents(amount);
      fields = (
        <>
          <div className="field-row">
            <label className="field">
              <span>Баланс</span>
              <select value={kind} onChange={(e) => setKind(e.target.value as "real" | "bonus")}>
                <option value="real">Реальный</option>
                <option value="bonus">Бонусный</option>
              </select>
            </label>
            <label className="field">
              <span>Сумма, $ (со знаком)</span>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="+10.00 или -5.50" autoFocus />
            </label>
          </div>
          <div className="small muted">
            {cents === null
              ? "Введите сумму, например 10 или -5.25"
              : `${cents > 0 ? "Начисление" : "Списание"}: ${money(Math.abs(cents))} (${cents} центов) на ${
                  kind === "real" ? "реальный" : "бонусный"
                } баланс`}
          </div>
        </>
      );
      submit = async (comment) => {
        if (cents === null || cents === 0) throw new Error("Некорректная сумма");
        await api(`/api/bo/players/${encodeURIComponent(id)}/adjust`, { body: { kind, amount: cents, comment } });
        onDone(`Баланс скорректирован: ${cents > 0 ? "+" : "−"}${money(Math.abs(cents))} (${kind})`);
      };
      break;
    }
  }

  return (
    <ActionModal
      title={title}
      description={<span className="muted">{card.player.email}</span>}
      confirmLabel={confirmLabel}
      danger={danger}
      onClose={onClose}
      onSubmit={submit}
    >
      {fields}
    </ActionModal>
  );
}

/* ---------- tabs ---------- */

function useList<T>(path: string, reloadKey: number) {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setError(null);
    api<Items<T>>(path)
      .then((r) => alive && setItems(r.items || []))
      .catch((e) => alive && setError(errMsg(e)));
    return () => {
      alive = false;
    };
  }, [path, reloadKey]);
  return { items, error };
}

function ListState({ error, loading, empty, cols }: { error: string | null; loading: boolean; empty: boolean; cols: number }) {
  if (error)
    return (
      <tr>
        <td colSpan={cols}>
          <div className="alert alert-error">{error}</div>
        </td>
      </tr>
    );
  if (loading)
    return (
      <tr>
        <td colSpan={cols} className="empty">
          Загрузка…
        </td>
      </tr>
    );
  if (empty)
    return (
      <tr>
        <td colSpan={cols} className="empty">
          Нет записей
        </td>
      </tr>
    );
  return null;
}

function hasDetails(d: Round["details"]): boolean {
  return !!d && typeof d === "object" && Object.keys(d).length > 0;
}

function RoundsTab({ id, reloadKey }: { id: string; reloadKey: number }) {
  const [limit, setLimit] = useState(100);
  const { items, error } = useList<Round>(`/api/bo/players/${encodeURIComponent(id)}/rounds?limit=${limit}`, reloadKey);
  const [open, setOpen] = useState<Record<number, boolean>>({});

  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th></th>
              <th>Время</th>
              <th>Игра</th>
              <th>Провайдер</th>
              <th>Раунд</th>
              <th className="num">Ставка real</th>
              <th className="num">Ставка bonus</th>
              <th className="num">Выигрыш real</th>
              <th className="num">Выигрыш bonus</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            <ListState error={error} loading={!items && !error} empty={!!items && items.length === 0} cols={10} />
            {items?.map((r) => {
              const expandable = hasDetails(r.details);
              const isOpen = !!open[r.id];
              const d = (r.details || {}) as Record<string, unknown>;
              const won = r.win_real + r.win_bonus > 0;
              return (
                <Fragment key={r.id}>
                  <tr
                    className={expandable ? "clickable" : ""}
                    onClick={() => expandable && setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))}
                  >
                    <td className="caret">{expandable ? (isOpen ? "▾" : "▸") : ""}</td>
                    <td className="nowrap">{dt(r.created_at)}</td>
                    <td>{r.game}</td>
                    <td>{r.provider}</td>
                    <td className="mono small ellipsis" title={r.round_id}>
                      {r.round_id}
                    </td>
                    <td className="num">{money(r.bet_real)}</td>
                    <td className="num">{money(r.bet_bonus)}</td>
                    <td className={`num${won ? " pos" : ""}`}>{money(r.win_real)}</td>
                    <td className={`num${r.win_bonus > 0 ? " pos" : ""}`}>{money(r.win_bonus)}</td>
                    <td>
                      <span className="badge badge-muted">{r.status}</span>
                    </td>
                  </tr>
                  {expandable && isOpen && (
                    <tr className="details-row">
                      <td></td>
                      <td colSpan={9}>
                        {"roll" in d && (
                          <div className="dice-summary">
                            <span>
                              Выпало <b>{String(d.roll)}</b>
                            </span>
                            <span>
                              Цель &lt; <b>{String(d.target)}</b>
                            </span>
                            {"multiplier" in d && (
                              <span>
                                Множитель <b>×{String(d.multiplier)}</b>
                              </span>
                            )}
                            {"nonce" in d && (
                              <span>
                                Nonce <b>{String(d.nonce)}</b>
                              </span>
                            )}
                            {"client_seed" in d && (
                              <span>
                                Client seed <span className="mono">{String(d.client_seed)}</span>
                              </span>
                            )}
                            {"server_seed_hash" in d && (
                              <span>
                                Server seed hash <span className="mono">{String(d.server_seed_hash)}</span>
                              </span>
                            )}
                          </div>
                        )}
                        <pre className="json">{JSON.stringify(r.details, null, 2)}</pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {items && items.length >= limit && (
        <div className="pager">
          <button className="btn btn-ghost btn-sm" onClick={() => setLimit(limit + 100)}>
            Показать ещё
          </button>
        </div>
      )}
    </>
  );
}

function PaymentsTab({ id, reloadKey }: { id: string; reloadKey: number }) {
  const { items, error } = useList<Payment>(`/api/bo/players/${encodeURIComponent(id)}/payments`, reloadKey);
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Время</th>
            <th>Тип</th>
            <th>Метод</th>
            <th className="num">Сумма</th>
            <th>Статус</th>
            <th>Адрес</th>
            <th>Внешний ID</th>
            <th className="num">Крипто</th>
            <th>ID платежа</th>
          </tr>
        </thead>
        <tbody>
          <ListState error={error} loading={!items && !error} empty={!!items && items.length === 0} cols={9} />
          {items?.map((p) => (
            <tr key={p.id}>
              <td className="nowrap">{dt(p.created_at)}</td>
              <td>
                {p.direction === "deposit" ? (
                  <span className="badge badge-ok">Депозит</span>
                ) : p.direction === "withdrawal" ? (
                  <span className="badge badge-info">Вывод</span>
                ) : (
                  p.direction
                )}
              </td>
              <td>{p.method}</td>
              <td className={`num strong ${p.direction === "deposit" ? "pos" : "neg"}`}>
                {p.direction === "deposit" ? "+" : "−"}
                {money(p.amount)}
              </td>
              <td>
                <StatusBadge value={p.status} />
              </td>
              <td className="mono small ellipsis" title={p.address || ""}>
                {p.address || "—"}
              </td>
              <td className="mono small ellipsis" title={p.external_ref || ""}>
                {p.external_ref || "—"}
              </td>
              <td className="num">{p.crypto_amount || "—"}</td>
              <td className="mono small ellipsis" title={p.id}>
                {p.id}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TX_LABELS: Record<string, string> = {
  deposit: "Депозит",
  bet: "Ставка",
  win: "Выигрыш",
  rollback: "Откат",
  withdraw_hold: "Вывод: холд",
  withdraw_complete: "Вывод: выполнен",
  withdraw_reject: "Вывод: отклонён",
  adjustment: "Корректировка",
};

function TransactionsTab({ id, reloadKey }: { id: string; reloadKey: number }) {
  const { items, error } = useList<LedgerTx>(`/api/bo/players/${encodeURIComponent(id)}/transactions`, reloadKey);
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Время</th>
            <th>Тип</th>
            <th className="num">Сумма</th>
            <th className="num">Реальный баланс после</th>
            <th>Meta</th>
          </tr>
        </thead>
        <tbody>
          <ListState error={error} loading={!items && !error} empty={!!items && items.length === 0} cols={5} />
          {items?.map((t) => (
            <tr key={t.id}>
              <td className="nowrap">{dt(t.created_at)}</td>
              <td>
                <span title={t.type}>{TX_LABELS[t.type] || t.type}</span>
              </td>
              <td className={`num ${t.amount < 0 ? "neg" : ""}`}>{money(t.amount)}</td>
              <td className="num strong">{money(t.real_balance_after)}</td>
              <td className="mono small meta-cell" title={shortJson(t.meta)}>
                {shortJson(t.meta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditTab({ id, reloadKey }: { id: string; reloadKey: number }) {
  const { items, error } = useList<AuditEntry>(`/api/bo/players/${encodeURIComponent(id)}/audit`, reloadKey);
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Время</th>
            <th>Сотрудник</th>
            <th>Действие</th>
            <th>До → После</th>
            <th>Комментарий</th>
          </tr>
        </thead>
        <tbody>
          <ListState error={error} loading={!items && !error} empty={!!items && items.length === 0} cols={5} />
          {items?.map((a) => (
            <tr key={a.id}>
              <td className="nowrap">{dt(a.created_at)}</td>
              <td>{a.staff || "—"}</td>
              <td>
                <span className="badge badge-muted">{a.action}</span>
              </td>
              <td className="mono small">
                <span className="muted">{shortJson(a.before)}</span> → <span>{shortJson(a.after)}</span>
              </td>
              <td>{a.comment || <span className="muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
