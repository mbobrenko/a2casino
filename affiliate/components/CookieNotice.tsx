"use client";

import { useEffect, useState } from "react";

const KEY = "cookie-notice-ok";

/** Minimal notice: the site sets no tracking cookies itself, so this only informs and is dismissible. */
export default function CookieNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      setShow(true);
    }
  }, []);

  if (!show) return null;
  return (
    <div className="cookie" role="region" aria-label="Aviso de cookies">
      <p>
        Usamos solo almacenamiento técnico necesario. Los casinos a los que enlazamos pueden usar cookies propias para atribuir tu registro. <a href="/privacidad/">Más información</a>
      </p>
      <button
        type="button"
        className="btn btn-small"
        onClick={() => {
          try { localStorage.setItem(KEY, "1"); } catch { /* storage blocked: just hide */ }
          setShow(false);
        }}
      >
        Entendido
      </button>
    </div>
  );
}
