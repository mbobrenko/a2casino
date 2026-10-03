const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Integer cents → "$1,234.56" (negative → "-$1,234.56"). */
export function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return "—";
  return moneyFmt.format(cents / 100);
}

export function dt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function dateOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function hours(h: number | null | undefined): string {
  if (h === null || h === undefined) return "—";
  if (h < 1) return `${(h * 60).toFixed(1)} мин`;
  return `${h.toFixed(1)} ч`;
}

/** "-12.5" dollars → -1250 cents; returns null if invalid. */
export function dollarsToCents(input: string): number | null {
  const s = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

export function shortJson(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object" && Object.keys(v as object).length === 0) return "—";
  return JSON.stringify(v);
}

export const STATUS_LABELS: Record<string, string> = {
  active: "Активен",
  blocked: "Заблокирован",
  pending: "Ожидает",
  completed: "Выполнен",
  rejected: "Отклонён",
  failed: "Ошибка",
  settled: "Рассчитан",
  open: "Открыт",
  rolled_back: "Откат",
  frozen: "Заморожен",
};

export const VERIFICATION_LABELS: Record<string, string> = {
  new: "Новый",
  not_verified: "Не верифицирован",
  manual_review: "Ручная проверка",
  duplicate: "Дубликат",
  verified: "Верифицирован",
};

export const VERIFICATIONS = ["new", "not_verified", "manual_review", "duplicate", "verified"] as const;

export function statusTone(s: string): "ok" | "bad" | "warn" | "muted" | "info" {
  switch (s) {
    case "active":
    case "completed":
    case "settled":
    case "verified":
      return "ok";
    case "blocked":
    case "rejected":
    case "failed":
    case "duplicate":
    case "frozen":
      return "bad";
    case "pending":
    case "manual_review":
    case "open":
      return "warn";
    case "new":
      return "info";
    default:
      return "muted";
  }
}
