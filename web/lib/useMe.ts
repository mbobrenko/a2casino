"use client";
import { useCallback, useEffect, useState } from "react";
import { api, getToken, Me } from "./api";

// useMe keeps the current player (and balance) in sync across components.
export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setMe(null);
      setReady(true);
      return;
    }
    try {
      setMe(await api<Me>("/api/me"));
    } catch {
      setMe(null);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener("a2c-auth", onChange);
    window.addEventListener("a2c-balance", onChange);
    return () => {
      window.removeEventListener("a2c-auth", onChange);
      window.removeEventListener("a2c-balance", onChange);
    };
  }, [refresh]);

  return { me, ready, refresh };
}

export const balanceChanged = () => window.dispatchEvent(new Event("a2c-balance"));
