export type Json = Record<string, unknown>;

export interface Dashboard {
  players: number;
  new_today: number;
  deposits_today: number;
  withdrawals_today: number;
  pending_withdrawals: number;
  /** Approved manual crypto payouts not marked paid yet. */
  awaiting_payout: number;
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
  rg_exclusion?: string | null;
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
  vip?: VipStatus | null;
  vip_name?: string | null;
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
  network: string | null;
  paid_at: string | null;
  created_at: string;
  tx_url?: string;
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
  risk: string | null;
  risk_reasons: string[] | null;
  created_at: string;
  first_deposit_at: string | null;
  deposits_count: number;
  deposits_sum: number;
  withdrawals_count: number;
  turnover: number;
  payment_speed_hours: number | null;
  player_status: string;
  network: string | null;
  tx_hash: string | null;
  crypto_amount: string | null;
  approved_at: string | null;
  paid_at: string | null;
  approved_by: string | null;
  paid_by: string | null;
  created_by: string | null;
  tx_url?: string;
  /** Paid by hand: approve, then "mark paid" with the tx hash. */
  manual: boolean;
}

export interface PayoutMethod {
  code: string;
  title: string;
  network: string;
  coin: string;
  min_cents: number;
}

export interface Items<T> {
  items: T[] | null;
}

/* ---------- v0.2: catalog & marketing ---------- */

export interface VipStatus {
  level: number;
  points: number;
  cashback_available: number;
  cashback_from: string | null;
  net_loss: number;
  rakeback_available: number;
}

export interface BoGame {
  id: number;
  slug: string;
  title: string;
  provider: string;
  studio: string;
  category: string;
  status: string;
  rtp: number;
  /** A2 Originals: max win per bet in cents (null = none). */
  max_win: number | null;
  /** RTP and max win can be set here (A2 Originals only, admin only). */
  rtp_configurable: boolean;
  sort_order: number;
  is_new: boolean;
  blocked_countries: string[] | null;
  tags: string[] | null;
  emoji: string;
  color: string;
  /** Percent of each bet counted towards bonus wagering, 0–100. */
  wagering_contribution: number;
  rounds_30d: number;
  turnover_30d: number;
  ggr_30d: number;
}

export interface BoProvider {
  code: string;
  title: string;
  status: string;
  blocked_countries: string[] | null;
  sort_order: number;
  games: number;
}

export interface Bonus {
  id: number;
  title: string;
  description: string;
  kind: string;
  trigger: string;
  percent: number;
  max_amount: number;
  fixed_amount: number;
  min_deposit: number;
  wager_multiplier: number;
  freespins_count: number;
  freespin_value: number;
  freespin_game: string;
  valid_days: number;
  active: boolean;
  /** Max bet per spin/round while the bonus is active, cents; 0 = no limit. */
  max_bet: number;
}

export interface BoBonus extends Bonus {
  given: number;
  active_count: number;
  completed: number;
  granted_sum: number;
}

export interface PromoCode {
  code: string;
  bonus_id: number;
  bonus_title: string;
  bonus_kind: string;
  max_uses: number;
  uses: number;
  expires_at: string | null;
  active: boolean;
  created_at: string;
}

export interface VipLevel {
  level: number;
  name: string;
  min_points: number;
  cashback_pct: number;
  rakeback_pct: number;
  perks: string;
  players: number;
}

export interface Banner {
  id: number;
  title: string;
  subtitle: string;
  cta_text: string;
  cta_link: string;
  color: string;
  emoji: string;
  sort_order: number;
  active: boolean;
  countries: string[] | null;
  starts_at: string | null;
  ends_at: string | null;
}

export interface GlobalAuditEntry {
  id: number;
  action: string;
  player_id: string | null;
  player_email: string | null;
  staff_email: string | null;
  before: Json | null;
  after: Json | null;
  comment: string;
  created_at: string;
}

export interface PlayerBonus {
  id: number;
  bonus_id: number;
  title: string;
  description: string;
  kind: string;
  status: string;
  source: string;
  amount: number;
  wager_required: number;
  wager_progress: number;
  freespins_left: number;
  freespins_won: number;
  freespin_game: string;
  min_deposit: number;
  created_at: string;
  expires_at: string | null;
  finished_at: string | null;
}

export interface AmlAddress {
  address: string;
  list: string;
  network: string;
  reason: string;
  added_by: string | null;
  created_at: string;
}

export interface AmlScreening {
  id: number;
  address: string;
  network: string;
  player_id: string | null;
  player_email: string | null;
  payment_id: string | null;
  context: string;
  risk: string;
  reasons: string[] | null;
  providers: string[] | null;
  created_at: string;
}

export interface AmlResult {
  risk: string;
  reasons: string[] | null;
  providers: string[] | null;
}

/* ---------- v0.3: responsible gaming & KYC ---------- */

export interface RgLimit {
  kind: "deposit" | "loss" | "wager" | "session";
  period: "day" | "week" | "month";
  amount: number | null;
  pending: boolean;
  pending_amount: number | null;
  effective_at: string | null;
  updated_at: string;
  used: number;
}

export interface RgExclusion {
  id: number;
  kind: "timeout" | "self_exclusion";
  duration: string;
  starts_at: string;
  ends_at: string | null;
  by_staff: boolean;
  reason?: string;
  reopen_requested_at: string | null;
  period_over: boolean;
  reopen_at: string | null;
}

export interface RgEvent {
  id: number;
  action: string;
  kind: string;
  period: string;
  before: Json | null;
  after: Json | null;
  created_at: string;
  staff: string | null;
}

export interface PlayerRg {
  limits: RgLimit[] | null;
  reality_check_minutes: number;
  exclusion: RgExclusion | null;
  history: RgEvent[] | null;
}

export interface KycDocument {
  id: number;
  kind: string;
  id_type: string;
  file_name: string;
  content_type: string;
  size: number;
  status: "pending" | "approved" | "rejected";
  reject_reason: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
}

export interface KycOverview {
  verification: string;
  profile: { full_name: string; birth_date: string; country: string; address: string; city: string; postal_code: string };
  required: string[];
  missing: string[];
  documents: KycDocument[] | null;
}

export interface KycQueueItem {
  player_id: string;
  email: string;
  full_name: string;
  country: string;
  verification: string;
  pending_docs: number;
  documents: number;
  oldest_pending_at: string | null;
  last_uploaded_at: string | null;
}
