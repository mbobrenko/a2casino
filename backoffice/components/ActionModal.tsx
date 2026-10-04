"use client";

import { useEffect, useRef, useState } from "react";
import { errMsg } from "@/lib/api";

export interface ActionModalProps {
  title: string;
  description?: React.ReactNode;
  /** Extra fields rendered above the comment. */
  children?: React.ReactNode;
  requireComment?: boolean;
  confirmLabel?: string;
  danger?: boolean;
  /** Wider dialog for forms. */
  wide?: boolean;
  /** Throw to show an error inside the modal. */
  onSubmit: (comment: string) => Promise<void>;
  onClose: () => void;
}

export default function ActionModal({
  title,
  description,
  children,
  requireComment = true,
  confirmLabel = "Подтвердить",
  danger,
  wide,
  onSubmit,
  onClose,
}: ActionModalProps) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  const hasFields = !!children;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Mount only: forms with their own fields focus their first input; plain confirmations focus the comment.
  // (Re-running this on every parent render would steal focus from the field being typed in.)
  useEffect(() => {
    if (!hasFields) ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (requireComment && !comment.trim()) {
      setError("Комментарий обязателен");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(comment.trim());
      onClose();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className={`modal${wide ? " modal-wide" : ""}`} onSubmit={submit}>
        <h3>{title}</h3>
        {description && <div className="modal-desc">{description}</div>}
        {children}
        {requireComment && (
          <label className="field">
            <span>Комментарий *</span>
            <textarea
              ref={ref}
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Причина действия"
            />
          </label>
        )}
        {error && <div className="alert alert-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button type="submit" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} disabled={busy}>
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
