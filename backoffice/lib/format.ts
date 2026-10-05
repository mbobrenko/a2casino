import type { Bonus } from "./types";

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
  live: "Live",
  hidden: "Скрыта",
  draft: "Черновик",
  announced: "Анонс",
  closed: "Закрыта",
  forfeited: "Аннулирован",
  expired: "Истёк",
  cancelled: "Отменён",
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
    case "live":
      return "ok";
    case "blocked":
    case "rejected":
    case "failed":
    case "duplicate":
    case "frozen":
    case "closed":
    case "forfeited":
    case "cancelled":
      return "bad";
    case "pending":
    case "manual_review":
    case "open":
      return "warn";
    case "new":
    case "announced":
      return "info";
    default:
      return "muted";
  }
}

/** Cents → "12.50" for prefilled dollar inputs. */
export function centsToInput(cents: number | null | undefined): string {
  if (!cents) return "0";
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

/** Non-negative dollars → cents, empty = 0; null if invalid. */
export function dollarsToCentsNonNeg(input: string): number | null {
  if (!input.trim()) return 0;
  const c = dollarsToCents(input);
  return c === null || c < 0 ? null : c;
}

/** "de, at ,CL" → ["DE","AT","CL"]. */
export function parseCodes(input: string): string[] {
  return input
    .split(/[,\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

/** "a, b" → ["a","b"]. */
export function parseList(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function invalidCodes(codes: string[]): string[] {
  return codes.filter((c) => !/^[A-Z]{2}$/.test(c));
}

export function int(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("ru-RU");
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${Number(n.toFixed(2))}%`;
}

export const GAME_STATUSES = ["live", "hidden", "draft", "announced", "closed"] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  slots: "Слоты",
  crash: "Краш",
  table: "Настольные",
  instant: "Моментальные",
  dice: "Кости",
};
export const CATEGORIES = Object.keys(CATEGORY_LABELS);

export const BONUS_KIND_LABELS: Record<string, string> = {
  deposit_match: "Бонус на депозит",
  no_deposit: "Бездепозитный",
  freespins: "Фриспины",
};

export const BONUS_TRIGGER_LABELS: Record<string, string> = {
  welcome: "Приветственный",
  deposit: "На депозит",
  promo_code: "По промокоду",
  manual: "Вручную",
};

export const BONUS_SOURCE_LABELS: Record<string, string> = {
  welcome: "Приветственный",
  offer: "Оффер (игрок)",
  staff: "Выдан сотрудником",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  status: "Статус игрока",
  verification: "Верификация",
  withdrawals_blocked: "Блокировка выводов",
  tag_added: "Тег добавлен",
  tag_removed: "Тег удалён",
  balance_adjustment: "Корректировка баланса",
  withdrawal_approved: "Вывод одобрен",
  withdrawal_rejected: "Вывод отклонён",
  bonus_grant: "Выдача бонуса",
  bonus_cancel: "Отмена бонуса",
  game_update: "Игра изменена",
  provider_update: "Провайдер изменён",
  bonus_create: "Бонус создан",
  bonus_update: "Бонус изменён",
  promo_create: "Промокод создан",
  promo_update: "Промокод изменён",
  vip_update: "VIP-уровень изменён",
  banner_create: "Баннер создан",
  banner_update: "Баннер изменён",
  aml_blacklist_add: "Адрес в чёрный список",
  aml_whitelist_add: "Адрес в белый список",
  aml_address_remove: "Адрес удалён из списков",
};

/** Short human description of what the bonus gives. */
export function bonusTerms(b: Bonus): string {
  const parts: string[] = [];
  if (b.kind === "deposit_match") {
    parts.push(`${b.percent}%${b.max_amount ? ` до ${money(b.max_amount)}` : ""}`);
  } else if (b.kind === "no_deposit") {
    parts.push(money(b.fixed_amount));
  } else if (b.kind === "freespins") {
    parts.push(`${b.freespins_count} FS × ${money(b.freespin_value)}${b.freespin_game ? ` · ${b.freespin_game}` : ""}`);
  }
  if (b.min_deposit) parts.push(`мин. деп. ${money(b.min_deposit)}`);
  if (b.wager_multiplier) parts.push(`вейджер x${b.wager_multiplier}`);
  parts.push(`${b.valid_days} дн.`);
  return parts.join(" · ");
}


export const RISK_LABELS: Record<string, string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
  severe: "Запрещён",
};

export const RISK_TONES: Record<string, string> = { low: "ok", medium: "warn", high: "bad", severe: "bad" };

export const AML_CONTEXT_LABELS: Record<string, string> = {
  withdrawal: "Заявка на вывод",
  approval: "Одобрение вывода",
  deposit: "Депозит",
  manual: "Ручная проверка",
};
