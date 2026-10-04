"use client";

import { useCallback, useEffect, useState } from "react";
import ActionModal from "@/components/ActionModal";
import { Badge, Codes } from "@/components/Badge";
import BannerPreview from "@/components/BannerPreview";
import Switch from "@/components/Switch";
import { api, errMsg } from "@/lib/api";
import { dt, invalidCodes, parseCodes } from "@/lib/format";
import type { Banner } from "@/lib/types";

type Action = { kind: "toggle"; b: Banner } | { kind: "edit"; b: Banner } | { kind: "create" };

export default function BannersPage() {
  const [rows, setRows] = useState<Banner[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api<{ banners: Banner[] | null }>(`/api/bo/banners`);
      setRows(r.banners || []);
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
        <h1>Баннеры</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setAction({ kind: "create" })}>
          + Новый баннер
        </button>
      </div>
      <div className="small muted" style={{ marginBottom: 10 }}>
        Активные баннеры показываются в карусели лобби по порядку сортировки.
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && (
        <div className="alert alert-ok" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}
      {!rows && !error && <div className="muted">Загрузка…</div>}
      {rows && rows.length === 0 && <div className="card muted">Баннеров пока нет</div>}
      <div className="banner-grid">
        {rows?.map((b) => (
          <div key={b.id} className={`banner-card${b.active ? "" : " inactive"}`}>
            <BannerPreview title={b.title} subtitle={b.subtitle} ctaText={b.cta_text} color={b.color} emoji={b.emoji} />
            <div className="banner-card-foot">
              <div className="banner-card-row">
                <span className="meta-item">
                  <Switch on={b.active} title={b.active ? "Выключить" : "Включить"} onClick={() => setAction({ kind: "toggle", b })} />
                  {b.active ? <Badge tone="ok">Активен</Badge> : <Badge tone="muted">Выключен</Badge>}
                </span>
                <button className="btn btn-sm" onClick={() => setAction({ kind: "edit", b })}>
                  Изменить
                </button>
              </div>
              <div className="banner-card-row small">
                <span>
                  <span className="muted">#{b.id} · порядок</span> {b.sort_order}
                </span>
                <span>
                  <span className="muted">ссылка</span> <span className="mono">{b.cta_link || "—"}</span>
                </span>
                <span>
                  <span className="muted">страны</span> {b.countries && b.countries.length ? <Codes codes={b.countries} /> : "все"}
                </span>
              </div>
              {(b.starts_at || b.ends_at) && (
                <div className="small muted">
                  Показ: {b.starts_at ? `с ${dt(b.starts_at)}` : ""} {b.ends_at ? `до ${dt(b.ends_at)}` : ""}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {action?.kind === "toggle" && (
        <ActionModal
          title={action.b.active ? "Выключить баннер" : "Включить баннер"}
          description={<b>{action.b.title}</b>}
          danger={action.b.active}
          confirmLabel={action.b.active ? "Выключить" : "Включить"}
          onClose={() => setAction(null)}
          onSubmit={async (comment) => {
            await api(`/api/bo/banners/${action.b.id}`, { body: { active: !action.b.active, comment } });
            done(`Баннер «${action.b.title}» ${action.b.active ? "выключен" : "включён"}`);
          }}
        />
      )}
      {(action?.kind === "edit" || action?.kind === "create") && (
        <BannerForm banner={action.kind === "edit" ? action.b : null} onClose={() => setAction(null)} onDone={done} />
      )}
    </>
  );
}

const DEFAULT_COLOR = "#7c5cff";

function BannerForm({ banner, onClose, onDone }: { banner: Banner | null; onClose: () => void; onDone: (msg: string) => void }) {
  const b = banner;
  const [title, setTitle] = useState(b?.title || "");
  const [subtitle, setSubtitle] = useState(b?.subtitle || "");
  const [ctaText, setCtaText] = useState(b?.cta_text || "");
  const [ctaLink, setCtaLink] = useState(b?.cta_link || "");
  const [color, setColor] = useState(b?.color || DEFAULT_COLOR);
  const [emoji, setEmoji] = useState(b?.emoji || "");
  const [sortOrder, setSortOrder] = useState(String(b?.sort_order ?? 10));
  const [active, setActive] = useState(b ? b.active : true);
  const [countries, setCountries] = useState((b?.countries || []).join(", "));
  const badCodes = invalidCodes(parseCodes(countries));

  return (
    <ActionModal
      wide
      title={b ? `Баннер #${b.id}` : "Новый баннер"}
      confirmLabel={b ? "Сохранить" : "Создать"}
      onClose={onClose}
      onSubmit={async (comment) => {
        if (!title.trim()) throw new Error("Укажите заголовок");
        const so = Number(sortOrder);
        if (!Number.isInteger(so)) throw new Error("Порядок сортировки — целое число");
        if (badCodes.length) throw new Error(`Неверные коды стран: ${badCodes.join(", ")}`);
        const next = {
          title: title.trim(),
          subtitle,
          cta_text: ctaText,
          cta_link: ctaLink.trim(),
          color,
          emoji,
          sort_order: so,
          active,
          countries: parseCodes(countries),
        };
        if (!b) {
          const r = await api<{ id: number }>(`/api/bo/banners`, { body: { ...next, comment } });
          onDone(`Баннер «${next.title}» создан (#${r.id})`);
          return;
        }
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(next)) {
          const old = (b as unknown as Record<string, unknown>)[k];
          const same = Array.isArray(v) ? v.join(",") === ((old as string[] | null) || []).join(",") : old === v;
          if (!same) body[k] = v;
        }
        if (Object.keys(body).length === 0) throw new Error("Нет изменений");
        await api(`/api/bo/banners/${b.id}`, { body: { ...body, comment } });
        onDone(`Баннер «${next.title}» сохранён`);
      }}
    >
      <BannerPreview title={title} subtitle={subtitle} ctaText={ctaText} color={color} emoji={emoji} />
      <div className="modal-scroll">
        <label className="field">
          <span>Заголовок *</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>Подзаголовок</span>
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Текст кнопки</span>
            <input value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder="Получить" />
          </label>
          <label className="field">
            <span>Ссылка кнопки</span>
            <input value={ctaLink} onChange={(e) => setCtaLink(e.target.value)} placeholder="/promo" />
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            <span>Цвет</span>
            <div className="color-row">
              <input type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_COLOR} onChange={(e) => setColor(e.target.value)} />
              <input type="text" value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
          </label>
          <label className="field">
            <span>Эмодзи</span>
            <input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="🎁" />
          </label>
          <label className="field">
            <span>Порядок</span>
            <input type="number" step={1} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Страны показа (ISO-коды через запятую; пусто — все)</span>
          <input value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="CL, PE" />
          {badCodes.length > 0 && <span className="field-hint neg">Неверные коды: {badCodes.join(", ")}</span>}
        </label>
        <label className="check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Активен
        </label>
      </div>
    </ActionModal>
  );
}
