export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080").replace(/\/$/, "");

const TOKEN_KEY = "a2bo_token";
const EMAIL_KEY = "a2bo_email";
const ROLE_KEY = "a2bo_role";

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function storageGet(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return storageGet(TOKEN_KEY);
}

export function getStaff(): { email: string | null; role: string | null } {
  return { email: storageGet(EMAIL_KEY), role: storageGet(ROLE_KEY) };
}

export function setSession(token: string, email: string, role: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(EMAIL_KEY, email);
    localStorage.setItem(ROLE_KEY, role);
  } catch {
    /* ignore */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(ROLE_KEY);
  } catch {
    /* ignore */
  }
}

function redirectToLogin() {
  clearSession();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown; auth?: boolean }): Promise<T> {
  const headers: Record<string, string> = {};
  if (init?.body !== undefined) headers["Content-Type"] = "application/json";
  if (init?.auth !== false) {
    const t = getToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: init?.method || (init?.body !== undefined ? "POST" : "GET"),
      headers,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "network", `Нет связи с API (${API_URL})`);
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const d = (data || {}) as { code?: string; message?: string };
    if (res.status === 401 && init?.auth !== false) {
      redirectToLogin();
    }
    throw new ApiError(res.status, d.code || "error", d.message || `HTTP ${res.status}`);
  }
  return data as T;
}

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.code && e.code !== "error" ? `${e.message} (${e.code})` : e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
