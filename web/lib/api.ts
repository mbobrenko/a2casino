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
  country_blocked: "Registration is not available in your country",
  underage: "You must be 18 or older to play",
  email_taken: "This email is already registered",
  bad_credentials: "Incorrect email or password",
  weak_password: "Password must be at least 8 characters",
  insufficient_funds: "Insufficient funds",
  kyc_required: "Please verify your account to withdraw",
  withdrawals_blocked: "Withdrawals are disabled for this account",
  blocked: "Your account is blocked. Please contact support",
  rate_limited: "Too many attempts. Please try again later",
  bonus_active: "Wager or cancel your active bonus first",
  promo_not_found: "This promo code does not exist",
  promo_expired: "This promo code has expired",
  already_used: "You have already used this bonus",
  already_claimed: "This bonus is already awaiting your deposit",
  bad_code: "Enter a promo code",
  bonus_inactive: "This bonus is no longer available",
  bonus_finished: "This bonus has already ended",
  no_freespins: "No free spins left",
  nothing_to_claim: "Minimum $1",
  bad_address: "This address is not valid for the selected coin and network. Check it and try again",
  address_blocked: "Withdrawals to this address are not allowed. Please contact support",
  deposit_only: "This method is for deposits only",
};

function errorText(code?: string, fallback?: string) {
  if (code === "max_bet_exceeded") {
    const limit = fallback?.match(/\$[\d,.]+/)?.[0] ?? "the limit";
    return `Max bet is ${limit} while a bonus is active. Lower your bet, or finish or cancel the bonus on the Promotions page.`;
  }
  if (code === "amount_too_small" && fallback) return fallback.charAt(0).toUpperCase() + fallback.slice(1);
  return (code && messages[code]) || fallback || "Request failed";
}

export const money = (cents: number) =>
  (cents < 0 ? "-$" : "$") + (Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type Balance = { currency: string; real: number; bonus: number; locked: number };
export type Me = { id: string; email: string; country: string; verification: string; status: string; created_at: string; balance: Balance };
export type Game = {
  id: number; slug: string; title: string; provider: string; category: string; rtp: number | null; is_new: boolean;
  studio: string; emoji: string; color: string; tags: string[] | null; description: string;
  /** Percentage of each bet that counts towards bonus wagering. */
  wagering_contribution: number;
};

export const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("en-US") : "—");
export const fmtShort = (s: string) =>
  new Date(s).toLocaleString("en-US", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
