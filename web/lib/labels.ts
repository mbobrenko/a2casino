// Shared player-facing labels and API types for the v0.2 player sections.

export const txText: Record<string, string> = {
  deposit: "Deposit", bet: "Bet", win: "Win", rollback: "Bet voided", adjustment: "Adjustment",
  withdraw_hold: "Withdrawal (on hold)", withdraw_release: "Withdrawal cancelled", withdraw_complete: "Withdrawal paid",
  bonus_grant: "Bonus credited", bonus_release: "Bonus wagered", bonus_forfeit: "Bonus forfeited",
  cashback: "Cashback", rakeback: "Rakeback",
};

export const paymentStatusText: Record<string, string> = {
  pending: "Processing", confirming: "Confirming", partially_paid: "Partially paid", completed: "Credited", failed: "Failed",
  approved: "Paid out", rejected: "Rejected", frozen: "Under review",
};

export const roundStatusText: Record<string, string> = {
  open: "In play", settled: "Settled", rolled_back: "Voided",
};

export const bonusStatusText: Record<string, string> = {
  pending: "Awaiting deposit", active: "Active", completed: "Wagered", forfeited: "Forfeited",
  expired: "Expired", cancelled: "Cancelled",
};

export const tagText: Record<string, string> = {
  popular: "Hot", jackpot: "Jackpot", "provably-fair": "Provably fair", hot: "Trending", exclusive: "Exclusive",
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
