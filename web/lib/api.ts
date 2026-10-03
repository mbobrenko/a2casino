export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("a2c_token");
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem("a2c_token", token);
  else localStorage.removeItem("a2c_token");
  window.dispatchEvent(new Event("a2c-auth"));
}

export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API_URL + path, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) setToken(null);
  if (!res.ok) throw new ApiError(res.status, data.code || "error", errorText(data.code, data.message));
  return data as T;
}

const messages: Record<string, string> = {
  country_blocked: "Регистрация недоступна в вашей стране",
  underage: "Сервис доступен только с 18 лет",
  email_taken: "Этот email уже зарегистрирован",
  bad_credentials: "Неверный email или пароль",
  weak_password: "Пароль должен быть не короче 8 символов",
  insufficient_funds: "Недостаточно средств",
  kyc_required: "Для вывода нужно пройти верификацию",
  withdrawals_blocked: "Выводы для аккаунта недоступны",
  blocked: "Аккаунт заблокирован, обратитесь в поддержку",
  rate_limited: "Слишком много попыток, попробуйте позже",
};

function errorText(code?: string, fallback?: string) {
  return (code && messages[code]) || fallback || "Ошибка запроса";
}

export const money = (cents: number) =>
  (cents < 0 ? "-$" : "$") + (Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type Balance = { currency: string; real: number; bonus: number; locked: number };
export type Me = { id: string; email: string; country: string; verification: string; status: string; balance: Balance };
export type Game = { id: number; slug: string; title: string; provider: string; category: string; rtp: number | null; is_new: boolean };
