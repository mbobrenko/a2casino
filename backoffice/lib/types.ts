export type Json = Record<string, unknown>;

export interface Dashboard {
  players: number;
  new_today: number;
  deposits_today: number;
  withdrawals_today: number;
  pending_withdrawals: number;
  turnover_today: number;
  ggr_today: number;
}

export interface PlayerRow {
  id: string;
  email: string;
  country: string;
  status: string;
  verification: string;
  tags: string[] | null;
  real: number;
  bonus: number;
  created_at: string;
}

export interface Player {
  id: string;
  email: string;
  country: string;
  birth_date?: string | null;
  currency: string;
  status: string;
  verification: string;
  withdrawals_blocked: boolean;
  tags: string[] | null;
  affiliate_ref?: string | null;
  registration_ip?: string | null;
  created_at: string;
}

export interface Balance {
  currency: string;
  real: number;
  bonus: number;
  locked: number;
}

export interface PlayerStats {
  deposits_count: number;
  deposits_sum: number;
  withdrawals_count: number;
  withdrawals_sum: number;
  pending_withdrawals_sum: number;
  inout: number;
  bets_count: number;
  wins_count: number;
  turnover: number;
  total_win: number;
  ggr: number;
  first_deposit_at: string | null;
  last_bet_at: string | null;
}

export interface PlayerCard {
  player: Player;
  balance: Balance;
  stats: PlayerStats;
}

export interface Round {
  id: number;
  round_id: string;
  game: string;
  provider: string;
  bet_real: number;
  bet_bonus: number;
  win_real: number;
  win_bonus: number;
  status: string;
  details: Json | null;
  created_at: string;
}

export interface Payment {
  id: string;
  direction: "deposit" | "withdrawal" | string;
  method: string;
  amount: number;
  status: string;
  address: string | null;
  external_ref: string | null;
  crypto_amount: string | null;
  created_at: string;
}

export interface LedgerTx {
  id: string;
  type: string;
  amount: number;
  meta: Json | null;
  created_at: string;
  real_balance_after: number | null;
}

export interface AuditEntry {
  id: number;
  action: string;
  before: Json | null;
  after: Json | null;
  comment: string;
  created_at: string;
  staff: string | null;
}

export interface Withdrawal {
  id: string;
  player_id: string;
  email: string;
  verification: string;
  tags: string[] | null;
  method: string;
  amount: number;
  status: string;
  address: string | null;
  created_at: string;
  first_deposit_at: string | null;
  deposits_count: number;
  deposits_sum: number;
  withdrawals_count: number;
  turnover: number;
  payment_speed_hours: number | null;
}

export interface Items<T> {
  items: T[] | null;
}
