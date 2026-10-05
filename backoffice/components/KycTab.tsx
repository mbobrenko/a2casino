"use client";

// Player card → "Верификация (KYC)": personal details, uploaded documents with previews,
// approve / reject per document and "Подтвердить личность" (verification = verified).

import { useCallback, useEffect, useState } from "react";
import ActionModal from "@/components/ActionModal";
import { Badge, VerificationBadge } from "@/components/Badge";
import { api, errMsg, fileURL } from "@/lib/api";
import { dateOnly, dt } from "@/lib/format";
import type { KycDocument, KycOverview } from "@/lib/types";

export const KYC_KIND_LABELS: Record<string, string> = {
  id_front: "Документ: лицевая сторона",
  id_back: "Документ: оборот",
  address: "Подтверждение адреса",
  selfie: "Селфи с документом",
};
const ID_TYPE_LABELS: Record<string, string> = { passport: "паспорт", id_card: "ID-карта", driving_licence: "водительское удостоверение" };
const DOC_STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "На проверке", tone: "warn" },
  approved: { label: "Одобрен", tone: "ok" },
  rejected: { label: "Отклонён", tone: "bad" },
};

function size(n: number) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`;
}

function Preview({ doc }: { doc: KycDocument }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isImage = doc.content_type.startsWith("image/");
  useEffect(() => {
    if (!isImage) return;
    let u: string | null = null;
    fileURL(`/api/bo/kyc/documents/${doc.id}/file`)
      .then((x) => setUrl((u = x)))
      .catch((e) => setErr(errMsg(e)));
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [doc.id, isImage]);

  const open = async () => {
    const w = window.open("", "_blank");
    try {
      const u = await fileURL(`/api/bo/kyc/documents/${doc.id}/file`);
      if (w) w.location.href = u;
    } catch (e) {
      w?.close();
      setErr(errMsg(e));
    }
  };

  if (err) return <div className="kyc-preview muted small">{err}</div>;
  if (!isImage)
    return (
      <button type="button" className="kyc-preview kyc-pdf" onClick={open}>
        <span className="kyc-pdf-icon">PDF</span>
        <span>Открыть PDF</span>
      </button>
    );
  return (
    <button type="button" className="kyc-preview" onClick={open} title="Открыть в новой вкладке">
      {url ? <img src={url} alt={KYC_KIND_LABELS[doc.kind]} /> : <span className="muted small">Загрузка…</span>}
    </button>
  );
}

type Modal = { kind: "approve" | "reject"; doc: KycDocument } | { kind: "verify" } | null;

export default function KycTab({ id, reloadKey, onChanged }: { id: string; reloadKey: number; onChanged: (msg: string) => void }) {
  const [data, setData] = useState<KycOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api<KycOverview>(`/api/bo/players/${encodeURIComponent(id)}/kyc`));
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

  const docs = data.documents || [];
  // The newest document of each kind is the current one; older ones are history.
  const current = new Map<string, KycDocument>();
  for (const d of docs) if (!current.has(d.kind)) current.set(d.kind, d);
  const allApproved = data.required.every((k) => current.get(k)?.status === "approved");
  const pr = data.profile;

  const done = (m: string) => {
    onChanged(m);
    load();
  };

  return (
    <>
      <div className="rg-grid">
        <div className="card">
          <div className="section-title">Данные игрока</div>
          <div className="kv-grid">
            <span className="muted">ФИО</span>
            <span className="strong">{pr.full_name || <span className="muted">не указано</span>}</span>
            <span className="muted">Дата рождения</span>
            <span>{dateOnly(pr.birth_date)}</span>
            <span className="muted">Страна</span>
            <span>{pr.country}</span>
            <span className="muted">Адрес</span>
            <span>{[pr.address, pr.city, pr.postal_code].filter(Boolean).join(", ") || <span className="muted">не указан</span>}</span>
          </div>
        </div>
        <div className="card">
          <div className="section-title">Статус верификации</div>
          <div style={{ marginBottom: 8 }}>
            <VerificationBadge value={data.verification} />
          </div>
          <div className="small muted" style={{ marginBottom: 10 }}>
            Обязательные документы: {data.required.map((k) => KYC_KIND_LABELS[k]).join(", ")}.
            {data.missing.length > 0 && <> Нужно загрузить (нет или отклонён): {data.missing.map((k) => KYC_KIND_LABELS[k]).join(", ")}.</>}
          </div>
          <button
            className="btn btn-success btn-sm"
            disabled={data.verification === "verified" || !allApproved}
            title={allApproved ? "" : "Сначала одобрите все обязательные документы"}
            onClick={() => setModal({ kind: "verify" })}
          >
            Подтвердить личность
          </button>
        </div>
      </div>

      <div className="section-title" style={{ marginTop: 14 }}>
        Документы
      </div>
      {docs.length === 0 && <div className="card muted">Игрок ещё не загрузил документы</div>}
      <div className="kyc-docs">
        {docs.map((d) => {
          const st = DOC_STATUS[d.status] || { label: d.status, tone: "muted" };
          const isCurrent = current.get(d.kind)?.id === d.id;
          return (
            <div key={d.id} className={`card kyc-doc${isCurrent ? "" : " old"}`}>
              <Preview doc={d} />
              <div className="kyc-doc-info">
                <div className="strong">
                  {KYC_KIND_LABELS[d.kind] || d.kind}
                  {d.id_type && <span className="muted"> · {ID_TYPE_LABELS[d.id_type] || d.id_type}</span>}
                </div>
                <div>
                  <Badge tone={st.tone}>{st.label}</Badge> {!isCurrent && <Badge tone="muted">заменён</Badge>}
                </div>
                <div className="small muted">
                  {d.file_name} · {size(d.size)} · {dt(d.created_at)}
                </div>
                {d.reviewed_at && (
                  <div className="small muted">
                    Проверил {d.reviewed_by || "—"} · {dt(d.reviewed_at)}
                  </div>
                )}
                {d.status === "rejected" && <div className="small neg">Причина: {d.reject_reason}</div>}
                {d.status === "pending" && (
                  <div className="kyc-doc-actions">
                    <button className="btn btn-success btn-xs" onClick={() => setModal({ kind: "approve", doc: d })}>
                      Одобрить
                    </button>
                    <button
                      className="btn btn-danger btn-xs"
                      onClick={() => {
                        setReason("");
                        setModal({ kind: "reject", doc: d });
                      }}
                    >
                      Отклонить
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {modal?.kind === "approve" && (
        <ActionModal
          title="Одобрить документ"
          description={<span className="muted">{KYC_KIND_LABELS[modal.doc.kind]}</span>}
          confirmLabel="Одобрить"
          requireComment={false}
          onClose={() => setModal(null)}
          onSubmit={async () => {
            await api(`/api/bo/kyc/documents/${modal.doc.id}/review`, { body: { decision: "approve" } });
            done(`Документ «${KYC_KIND_LABELS[modal.doc.kind]}» одобрен`);
          }}
        />
      )}
      {modal?.kind === "reject" && (
        <ActionModal
          title="Отклонить документ"
          description={<span className="muted">{KYC_KIND_LABELS[modal.doc.kind]}. Игрок увидит причину и сможет загрузить новый файл.</span>}
          confirmLabel="Отклонить"
          danger
          requireComment={false}
          onClose={() => setModal(null)}
          onSubmit={async () => {
            if (!reason.trim()) throw new Error("Укажите причину — её увидит игрок");
            await api(`/api/bo/kyc/documents/${modal.doc.id}/review`, { body: { decision: "reject", reason: reason.trim() } });
            done(`Документ «${KYC_KIND_LABELS[modal.doc.kind]}» отклонён`);
          }}
        >
          <label className="field">
            <span>Причина для игрока (на английском) *</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="The document is blurry" autoFocus />
          </label>
          <div className="chips-row">
            {["The document is blurry or cut off", "The document has expired", "The name does not match your profile", "Your face is not clearly visible", "The document must be dated within the last 3 months"].map((r) => (
              <button type="button" key={r} className="btn btn-ghost btn-xs" onClick={() => setReason(r)}>
                {r}
              </button>
            ))}
          </div>
        </ActionModal>
      )}
      {modal?.kind === "verify" && (
        <ActionModal
          title="Подтвердить личность"
          description={<span className="muted">Статус верификации станет «Верифицирован», игроку станут доступны выводы.</span>}
          confirmLabel="Подтвердить"
          onClose={() => setModal(null)}
          onSubmit={async (comment) => {
            await api(`/api/bo/players/${encodeURIComponent(id)}/kyc/verify`, { body: { comment } });
            done("Личность подтверждена");
          }}
        />
      )}
    </>
  );
}
