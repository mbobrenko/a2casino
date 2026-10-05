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

/** Russian texts for API error codes where the English message is not good enough for staff. */
export const ERROR_RU: Record<string, string> = {
  bonus_active: "У игрока уже есть активный бонус",
  bonus_inactive: "Этот бонус отключён",
  bonus_finished: "Бонус уже завершён",
  already_used: "Игрок уже получал этот бонус",
  already_claimed: "Этот бонус уже ожидает депозита игрока",
  comment_required: "Комментарий обязателен",
  nothing_to_change: "Нет изменений",
  not_found: "Не найдено",
  code_taken: "Такой промокод уже существует",
  bad_code: "Код должен быть длиной 3–32 символа без пробелов",
  bad_bonus: "Неизвестный бонус",
  bad_max_uses: "Лимит использований должен быть 0 (без лимита) или больше",
  bad_title: "Укажите название",
  bad_kind: "Неизвестный тип бонуса",
  bad_trigger: "Неизвестный триггер",
  bad_category: "Неизвестная категория",
  bad_status: "Недопустимый статус",
  bad_min_points: "Уровень 1 должен начинаться с 0 очков",
  bad_cashback: "Кэшбэк должен быть от 0 до 50%",
  bad_rakeback: "Рейкбэк должен быть от 0 до 5% оборота",
  bad_valid_days: "Срок действия — минимум 1 день",
  forbidden: "Недостаточно прав для этого действия",
  address_blocked: "Адрес в санкционном или чёрном списке: вывод нужно отклонить",
  sanctioned: "Адрес в санкционном списке OFAC, изменить нельзя",
  bad_address: "Введите адрес кошелька",
  bad_list: "Неизвестный список",
};

export function errMsg(e: unknown): string {
  if (e instanceof ApiError && ERROR_RU[e.code]) return `${ERROR_RU[e.code]} (${e.code})`;
  if (e instanceof ApiError) return e.code && e.code !== "error" ? `${e.message} (${e.code})` : e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
