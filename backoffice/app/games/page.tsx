"use client";

import { useCallback, useEffect, useState } from "react";
import ActionModal from "@/components/ActionModal";
import { Badge, Codes, StatusBadge, Tags } from "@/components/Badge";
import Switch from "@/components/Switch";
import { api, errMsg } from "@/lib/api";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  GAME_STATUSES,
  STATUS_LABELS,
  int,
  invalidCodes,
  money,
  parseCodes,
  parseList,
} from "@/lib/format";
import type { BoGame, BoProvider } from "@/lib/types";

type View = "games" | "providers";

export default function GamesPage() {
  const [view, setView] = useState<View>("games");
  return (
    <>
      <div className="page-head">
        <h1>Игры</h1>
      </div>
      <div className="segmented">
        <button className={view === "games" ? "active" : ""} onClick={() => setView("games")}>
          Игры
        </button>
        <button className={view === "providers" ? "active" : ""} onClick={() => setView("providers")}>
          Провайдеры
        </button>
      </div>
      {view === "games" ? <GamesView /> : <ProvidersView />}
    </>
  );
}

/* ---------- games ---------- */

type GameAction = { kind: "toggle"; game: BoGame } | { kind: "edit"; game: BoGame };

function GamesView() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<BoGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<GameAction | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (category) params.set("category", category);
      if (status) params.set("status", status);
      const r = await api<{ games: BoGame[] | null }>(`/api/bo/games?${params}`);
      setRows(r.games || []);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [query, category, status]);

  useEffect(() => {
    load();
  }, [load]);

  function done(msg: string) {
    setNotice(msg);
    load();
  }

  return (
    <>
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
        }}
      >
        <input className="search" placeholder="Поиск: название или slug" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-primary">Найти</button>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Все категории</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Все статусы</option>
          {GAME_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        {(query || category || status) && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setQ("");
              setQuery("");
              setCategory("");
              setStatus("");
            }}
          >
            Сбросить
          </button>
        )}
        {loading && <span className="muted">Загрузка…</span>}
        <span className="spacer" />
        {rows && <span className="muted small">Игр: {rows.length}</span>}
      </form>
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
              <th></th>
              <th>Игра</th>
              <th>Студия</th>
              <th>Категория</th>
              <th>Статус</th>
              <th title="Быстро показать / скрыть">Live</th>
              <th className="num">RTP</th>
              <th className="num">Порядок</th>
              <th>Новинка</th>
              <th>Блок. страны</th>
              <th>Теги</th>
              <th className="num">Раунды 30д</th>
              <th className="num">Оборот 30д</th>
              <th className="num">GGR 30д</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((g) => (
              <tr key={g.id}>
                <td>
                  <span className="emoji-cell" style={{ background: g.color ? `${g.color}22` : undefined }}>
                    {g.emoji || "🎮"}
                  </span>
                </td>
                <td>
                  <div className="strong">{g.title}</div>
                  <div className="mono muted small">
                    {g.slug} · #{g.id}
                  </div>
                </td>
                <td>
                  <div>{g.studio}</div>
                  {g.provider !== g.studio && <div className="muted small">{g.provider}</div>}
                </td>
                <td>{CATEGORY_LABELS[g.category] || g.category}</td>
                <td>
                  <StatusBadge value={g.status} />
                </td>
                <td>
                  <Switch
                    on={g.status === "live"}
                    title={g.status === "live" ? "Скрыть игру" : "Опубликовать (live)"}
                    onClick={() => setAction({ kind: "toggle", game: g })}
                  />
                </td>
                <td className="num">{g.rtp}%</td>
                <td className="num">{g.sort_order}</td>
                <td>{g.is_new ? <Badge tone="info">Новинка</Badge> : <span className="muted">—</span>}</td>
                <td>
                  <Codes codes={g.blocked_countries} />
                </td>
                <td>
                  <Tags tags={g.tags} />
                </td>
                <td className="num">{int(g.rounds_30d)}</td>
                <td className="num">{money(g.turnover_30d)}</td>
                <td className={`num ${g.ggr_30d < 0 ? "neg" : g.ggr_30d > 0 ? "pos" : ""}`}>{money(g.ggr_30d)}</td>
                <td>
                  <button className="btn btn-sm" onClick={() => setAction({ kind: "edit", game: g })}>
                    Изменить
                  </button>
                </td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr>
                <td colSpan={15} className="empty">
                  Ничего не найдено
                </td>
              </tr>
            )}
            {!rows && !error && (
              <tr>
                <td colSpan={15} className="empty">
                  Загрузка…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {action?.kind === "toggle" && (
        <ActionModal
          title={action.game.status === "live" ? "Скрыть игру" : "Опубликовать игру"}
          description={
            <>
              {action.game.emoji} <b>{action.game.title}</b>: {STATUS_LABELS[action.game.status] || action.game.status} →{" "}
              {action.game.status === "live" ? "Скрыта" : "Live"}
            </>
          }
          danger={action.game.status === "live"}
          confirmLabel={action.game.status === "live" ? "Скрыть" : "Опубликовать"}
          onClose={() => setAction(null)}
          onSubmit={async (comment) => {
            const to = action.game.status === "live" ? "hidden" : "live";
            await api(`/api/bo/games/${action.game.id}`, { body: { status: to, comment } });
            done(`«${action.game.title}»: ${to === "live" ? "опубликована" : "скрыта"}`);
          }}
        />
      )}
      {action?.kind === "edit" && <GameEditModal game={action.game} onClose={() => setAction(null)} onDone={done} />}
    </>
  );
}

function GameEditModal({ game, onClose, onDone }: { game: BoGame; onClose: () => void; onDone: (msg: string) => void }) {
  const [title, setTitle] = useState(game.title);
  const [category, setCategory] = useState(game.category);
  const [status, setStatus] = useState(game.status);
  const [sortOrder, setSortOrder] = useState(String(game.sort_order));
  const [isNew, setIsNew] = useState(game.is_new);
  const [blocked, setBlocked] = useState((game.blocked_countries || []).join(", "));
  const [tags, setTags] = useState((game.tags || []).join(", "));
  const [emoji, setEmoji] = useState(game.emoji);
  const [color, setColor] = useState(game.color || "#3d5afe");

  const badCodes = invalidCodes(parseCodes(blocked));

  return (
    <ActionModal
      wide
      title={`Игра: ${game.title}`}
      description={
        <span className="muted mono small">
          {game.slug} · {game.studio} · RTP {game.rtp}%
        </span>
      }
      confirmLabel="Сохранить"
      onClose={onClose}
      onSubmit={async (comment) => {
        const body: Record<string, unknown> = {};
        if (!title.trim()) throw new Error("Название не может быть пустым");
        if (title.trim() !== game.title) body.title = title.trim();
        if (category !== game.category) body.category = category;
        if (status !== game.status) body.status = status;
        const so = Number(sortOrder);
        if (!Number.isInteger(so)) throw new Error("Порядок сортировки — целое число");
        if (so !== game.sort_order) body.sort_order = so;
        if (isNew !== game.is_new) body.is_new = isNew;
        const codes = parseCodes(blocked);
        if (badCodes.length) throw new Error(`Неверные коды стран: ${badCodes.join(", ")}`);
        if (codes.join(",") !== (game.blocked_countries || []).join(",")) body.blocked_countries = codes;
        const t = parseList(tags).map((x) => x.toLowerCase());
        if (t.join(",") !== (game.tags || []).join(",")) body.tags = t;
        if (emoji !== game.emoji) body.emoji = emoji;
        if (color !== game.color) body.color = color;
        if (Object.keys(body).length === 0) throw new Error("Нет изменений");
        await api(`/api/bo/games/${game.id}`, { body: { ...body, comment } });
        onDone(`Игра «${title.trim()}» сохранена`);
      }}
    >
      <div className="field-row">
        <label className="field" style={{ flex: 2 }}>
          <span>Название</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>Категория</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Статус</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {GAME_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]} ({s})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Порядок сортировки</span>
          <input type="number" step={1} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={isNew} onChange={(e) => setIsNew(e.target.checked)} /> Новинка
      </label>
      <label className="field">
        <span>Заблокированные страны (ISO-коды через запятую)</span>
        <input value={blocked} onChange={(e) => setBlocked(e.target.value)} placeholder="например, US, GB, FR" />
        {badCodes.length > 0 && <span className="field-hint neg">Неверные коды: {badCodes.join(", ")}</span>}
      </label>
      <label className="field">
        <span>Теги (через запятую)</span>
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="popular, megaways" />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Эмодзи</span>
          <input value={emoji} onChange={(e) => setEmoji(e.target.value)} />
        </label>
        <label className="field">
          <span>Цвет</span>
          <div className="color-row">
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#3d5afe"} onChange={(e) => setColor(e.target.value)} />
            <input type="text" value={color} onChange={(e) => setColor(e.target.value)} />
            <span className="emoji-cell" style={{ background: color }}>
              {emoji}
            </span>
          </div>
        </label>
      </div>
    </ActionModal>
  );
}

/* ---------- providers ---------- */

type ProviderAction = { kind: "toggle"; p: BoProvider } | { kind: "edit"; p: BoProvider };

function ProvidersView() {
  const [rows, setRows] = useState<BoProvider[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [action, setAction] = useState<ProviderAction | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api<{ providers: BoProvider[] | null }>(`/api/bo/providers`);
      setRows(r.providers || []);
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
      <div className="small muted" style={{ marginBottom: 10 }}>
        Скрытый провайдер скрывает все свои игры в лобби.
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
              <th>Провайдер</th>
              <th>Код</th>
              <th className="num">Игр</th>
              <th>Статус</th>
              <th>Live</th>
              <th>Блок. страны</th>
              <th className="num">Порядок</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((p) => (
              <tr key={p.code}>
                <td className="strong">{p.title}</td>
                <td className="mono small">{p.code}</td>
                <td className="num">{p.games}</td>
                <td>
                  <StatusBadge value={p.status} />
                </td>
                <td>
                  <Switch
                    on={p.status === "live"}
                    title={p.status === "live" ? "Скрыть провайдера" : "Показать провайдера"}
                    onClick={() => setAction({ kind: "toggle", p })}
                  />
                </td>
                <td>
                  <Codes codes={p.blocked_countries} />
                </td>
                <td className="num">{p.sort_order}</td>
                <td>
                  <button className="btn btn-sm" onClick={() => setAction({ kind: "edit", p })}>
                    Изменить
                  </button>
                </td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="empty">
                  Нет провайдеров
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
      {action?.kind === "toggle" && (
        <ActionModal
          title={action.p.status === "live" ? "Скрыть провайдера" : "Показать провайдера"}
          description={
            <>
              <b>{action.p.title}</b>
              {action.p.status === "live" && <> — все его игры ({action.p.games}) пропадут из лобби.</>}
            </>
          }
          danger={action.p.status === "live"}
          confirmLabel={action.p.status === "live" ? "Скрыть" : "Показать"}
          onClose={() => setAction(null)}
          onSubmit={async (comment) => {
            const to = action.p.status === "live" ? "hidden" : "live";
            await api(`/api/bo/providers/${encodeURIComponent(action.p.code)}`, { body: { status: to, comment } });
            done(`${action.p.title}: ${to === "live" ? "показан" : "скрыт"}`);
          }}
        />
      )}
      {action?.kind === "edit" && <ProviderEditModal p={action.p} onClose={() => setAction(null)} onDone={done} />}
    </>
  );
}

function ProviderEditModal({ p, onClose, onDone }: { p: BoProvider; onClose: () => void; onDone: (msg: string) => void }) {
  const [status, setStatus] = useState(p.status);
  const [blocked, setBlocked] = useState((p.blocked_countries || []).join(", "));
  const [sortOrder, setSortOrder] = useState(String(p.sort_order));
  const badCodes = invalidCodes(parseCodes(blocked));
  return (
    <ActionModal
      title={`Провайдер: ${p.title}`}
      description={<span className="muted mono small">{p.code}</span>}
      confirmLabel="Сохранить"
      onClose={onClose}
      onSubmit={async (comment) => {
        const body: Record<string, unknown> = {};
        if (status !== p.status) body.status = status;
        const so = Number(sortOrder);
        if (!Number.isInteger(so)) throw new Error("Порядок сортировки — целое число");
        if (so !== p.sort_order) body.sort_order = so;
        if (badCodes.length) throw new Error(`Неверные коды стран: ${badCodes.join(", ")}`);
        const codes = parseCodes(blocked);
        if (codes.join(",") !== (p.blocked_countries || []).join(",")) body.blocked_countries = codes;
        if (Object.keys(body).length === 0) throw new Error("Нет изменений");
        await api(`/api/bo/providers/${encodeURIComponent(p.code)}`, { body: { ...body, comment } });
        onDone(`Провайдер «${p.title}» сохранён`);
      }}
    >
      <div className="field-row">
        <label className="field">
          <span>Статус</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} autoFocus>
            <option value="live">Live</option>
            <option value="hidden">Скрыт</option>
          </select>
        </label>
        <label className="field">
          <span>Порядок сортировки</span>
          <input type="number" step={1} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Заблокированные страны (ISO-коды через запятую)</span>
        <input value={blocked} onChange={(e) => setBlocked(e.target.value)} placeholder="например, US, GB" />
        {badCodes.length > 0 && <span className="field-hint neg">Неверные коды: {badCodes.join(", ")}</span>}
      </label>
    </ActionModal>
  );
}
