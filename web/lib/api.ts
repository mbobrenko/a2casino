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

/** POSTs a multipart form (file uploads). */
export async function upload<T = any>(path: string, form: FormData): Promise<T> {
  const token = getToken();
  const res = await fetch(API_URL + path, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) setToken(null);
  if (!res.ok) throw new ApiError(res.status, data.code || "error", errorText(data.code, data.message));
  return data as T;
}

/** GETs a private file (it needs the auth header, so it cannot be a plain link) as an object URL. */
export async function fileURL(path: string): Promise<string> {
  const token = getToken();
  const res = await fetch(API_URL + path, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
  if (!res.ok) throw new ApiError(res.status, "error", "Could not load the file");
  return URL.createObjectURL(await res.blob());
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
  bad_file_type: "Only JPG, PNG and PDF files are accepted",
  file_too_large: "Files can be up to 5 MB",
  no_file: "Choose a file to upload",
  bad_id_type: "Choose the type of your identity document",
  already_approved: "This document is already approved",
  already_verified: "Your account is already verified",
  profile_locked: "Your account is verified. Contact support to change your details",
  bad_full_name: "Enter your first and last name as shown on your ID",
  bad_home_address: "Enter your street address and city",
  invalid_birth_date: "Check your date of birth",
};

function errorText(code?: string, fallback?: string) {
  if (code === "max_bet_exceeded") {
    const limit = fallback?.match(/\$[\d,.]+/)?.[0] ?? "the limit";
    return `Max bet is ${limit} while a bonus is active. Lower your bet, or finish or cancel the bonus on the Promotions page.`;
  }
  if (code && messages[code]) return messages[code];
  return fallback ? fallback.charAt(0).toUpperCase() + fallback.slice(1) : "Request failed";
}

export const money = (cents: number) =>
  (cents < 0 ? "-$" : "$") + (Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type Balance = { currency: string; real: number; bonus: number; locked: number };
export type Exclusion = {
  id: number; kind: "timeout" | "self_exclusion"; duration: string; starts_at: string; ends_at: string | null; by_staff: boolean;
  reopen_requested_at: string | null; period_over: boolean; reopen_at: string | null;
};
export type Me = {
  id: string; email: string; country: string; verification: string; status: string; created_at: string; balance: Balance;
  exclusion: Exclusion | null;
};
export type Game = {
  id: number; slug: string; title: string; provider: string; category: string; rtp: number | null; is_new: boolean;
  studio: string; emoji: string; color: string; tags: string[] | null; description: string;
  /** Percentage of each bet that counts towards bonus wagering. */
  wagering_contribution: number;
  /** A2 Labs: maximum win per bet in cents (wins above are capped); null = none. */
  max_win: number | null;
};

export const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("en-US") : "—");
export const fmtShort = (s: string) =>
  new Date(s).toLocaleString("en-US", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
