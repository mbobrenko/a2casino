// Responsible gaming: API types and texts shared by the RG page, the reality check and the header notice.
import type { Exclusion } from "./api";

export type Limit = {
  kind: "deposit" | "loss" | "wager" | "session"; period: "day" | "week" | "month";
  amount: number | null; pending: boolean; pending_amount: number | null; effective_at: string | null; updated_at: string; used: number;
};
export type RGState = { limits: Limit[]; reality_check_minutes: number; exclusion: Exclusion | null };
export type Session = {
  started_at: string; elapsed_seconds: number; bets: number; wagered: number; won: number; net: number;
  reality_check_minutes: number; played_today_minutes: number; session_limit_minutes: number | null;
};

export const durationText: Record<string, string> = {
  "24h": "24 hours", "7d": "7 days", "30d": "30 days", "6w": "6 weeks",
  "6m": "6 months", "1y": "1 year", "5y": "5 years", permanent: "Permanent",
};

export const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString("en-US", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const fmtMinutes = (m: number) => {
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
};

/** One-line description of a time-out or self-exclusion in force. */
export function exclusionText(e: Exclusion): string {
  if (e.kind === "timeout") return `You are taking a time-out until ${fmtDateTime(e.ends_at!)}.`;
  if (e.reopen_at) return `Your self-exclusion has ended. Your account reopens on ${fmtDateTime(e.reopen_at)}.`;
  if (e.period_over) return "Your self-exclusion period has ended. Ask to reopen your account on the Responsible Gaming page.";
  return e.ends_at ? `You are self-excluded until ${fmtDateTime(e.ends_at)}.` : "You are permanently self-excluded.";
}
