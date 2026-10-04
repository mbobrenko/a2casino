// Shared Russian labels and API types for the v0.2 player sections.

export const txText: Record<string, string> = {
  deposit: "Депозит", bet: "Ставка", win: "Выигрыш", rollback: "Отмена ставки", adjustment: "Корректировка",
  withdraw_hold: "Вывод (резерв)", withdraw_release: "Вывод отменён", withdraw_complete: "Вывод выплачен",
  bonus_grant: "Начисление бонуса", bonus_release: "Бонус отыгран", bonus_forfeit: "Бонус аннулирован",
  cashback: "Кэшбэк", rakeback: "Рейкбэк",
};

export const paymentStatusText: Record<string, string> = {
  pending: "в обработке", confirming: "подтверждается", completed: "зачислен", failed: "ошибка",
  approved: "выплачен", rejected: "отклонён", frozen: "на проверке",
};

export const roundStatusText: Record<string, string> = {
  open: "в игре", settled: "завершён", rolled_back: "отменён",
};

export const bonusStatusText: Record<string, string> = {
  pending: "Ждёт депозита", active: "Активен", completed: "Отыгран", forfeited: "Сгорел",
  expired: "Истёк", cancelled: "Отменён",
};

export const tagText: Record<string, string> = {
  popular: "Хит", jackpot: "Джекпот", "provably-fair": "Честная игра", hot: "Горячая", exclusive: "Эксклюзив",
};

export type BonusOffer = {
  id: number; title: string; description: string; kind: "deposit_match" | "no_deposit" | "freespins"; trigger: string;
  percent: number; max_amount: number; fixed_amount: number; min_deposit: number; wager_multiplier: number;
  freespins_count: number; freespin_value: number; freespin_game: string; valid_days: number; active: boolean;
};

export type PlayerBonus = {
  id: number; bonus_id: number; title: string; description: string; kind: BonusOffer["kind"];
  status: "pending" | "active" | "completed" | "forfeited" | "expired" | "cancelled"; source: string;
  amount: number; wager_required: number; wager_progress: number; freespins_left: number; freespins_won: number;
  freespin_game: string; min_deposit: number; created_at: string; expires_at: string | null; finished_at: string | null;
};

export type VipLevel = { level: number; name: string; min_points: number; cashback_pct: number; rakeback_pct: number; perks: string };
export type VipStatus = {
  level: number; points: number; cashback_available: number; cashback_from: string; net_loss: number; rakeback_available: number;
};

export const levelIcon = ["🥉", "🥈", "🥇", "💠", "💎"];
