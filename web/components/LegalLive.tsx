"use client";
// Tables on the legal pages that show live values from the public API, so the published
// figures always match what the platform is configured with.
import { useEffect, useState } from "react";
import { api, money } from "@/lib/api";
import type { Game } from "@/lib/api";
import type { BonusOffer, VipLevel } from "@/lib/labels";
import { RULES } from "@/lib/company";

function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { load().then(setData).catch(() => setError(true)); }, []);
  return { data, error };
}

function State({ error, empty }: { error: boolean; empty?: boolean }) {
  if (error) return <p className="muted">This table could not be loaded right now. Please try again later or contact support.</p>;
  if (empty) return <p className="muted">Nothing to show right now.</p>;
  return <p className="muted">Loading…</p>;
}

const categoryText: Record<string, string> = {
  slots: "Slots", crash: "Crash", table: "Table games", instant: "Instant games", dice: "Dice", live: "Live casino",
};

export function GamesRtpTable() {
  const { data, error } = useLoad(async () => {
    const [g, lobby] = await Promise.all([
      api<{ games: Game[] }>("/api/games"),
      api<{ providers: { code: string; title: string }[] }>("/api/lobby").catch(() => ({ providers: [] })),
    ]);
    const studios = Object.fromEntries(lobby.providers.map((p) => [p.code, p.title]));
    return g.games
      .map((x) => ({ ...x, studioTitle: studios[x.studio] ?? x.studio }))
      .sort((a, b) => a.title.localeCompare(b.title));
  });
  if (!data || data.length === 0) return <State error={error} empty={!!data} />;
  return (
    <div className="table-wrap">
      <table className="legal-table">
        <thead><tr><th>Game</th><th>Studio</th><th>Category</th><th className="num">RTP</th></tr></thead>
        <tbody>
          {data.map((g) => (
            <tr key={g.id}>
              <td>{g.title}</td>
              <td>{g.studioTitle}</td>
              <td>{categoryText[g.category] ?? g.category}</td>
              <td className="num nowrap">{g.rtp != null ? `${Number(g.rtp).toFixed(2)}%` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const originals = () => api<{ games: Game[] }>("/api/games").then((r) => r.games.filter((g) => g.provider === "originals"));

/** RTP version and maximum win of each A2 Original, as configured now. */
export function OriginalsRtpTable() {
  const { data, error } = useLoad(originals);
  if (!data || data.length === 0) return <State error={error} empty={!!data} />;
  return (
    <div className="table-wrap">
      <table className="legal-table">
        <thead><tr><th>Game</th><th className="num">RTP (R)</th><th className="num">House edge</th><th className="num">Maximum win per bet</th></tr></thead>
        <tbody>
          {data.map((g) => (
            <tr key={g.id}>
              <td>{g.title}</td>
              <td className="num nowrap">{g.rtp != null ? `${Number(g.rtp).toFixed(0)}%` : "—"}</td>
              <td className="num nowrap">{g.rtp != null ? `${(100 - Number(g.rtp)).toFixed(0)}%` : "—"}</td>
              <td className="num nowrap">{g.max_win ? money(g.max_win) : "No cap"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The maximum win per bet of the A2 Labs in running text (the common value, or "up to" the highest). */
export function OriginalsMaxWin() {
  const { data } = useLoad(originals);
  const caps = (data ?? []).map((g) => g.max_win).filter((x): x is number => !!x);
  if (caps.length === 0) return <b>{RULES.originalsMaxWin}</b>;
  const max = Math.max(...caps);
  return <b>{caps.every((c) => c === max) ? money(max) : `up to ${money(max)} (per game, see the table in section 3)`}</b>;
}

const kindText: Record<string, string> = { deposit_match: "Deposit bonus", no_deposit: "No-deposit bonus", freespins: "Free spins" };
const triggerText: Record<string, string> = {
  welcome: "Offered on sign-up", deposit: "Claim on the Promotions page", promo_code: "Promo code", manual: "Given by us",
};

function offerValue(o: BonusOffer) {
  if (o.kind === "deposit_match") return `${o.percent}% of the deposit, up to ${money(o.max_amount)}`;
  if (o.kind === "no_deposit") return money(o.fixed_amount);
  if (o.kind === "freespins") return `${o.freespins_count} spins at ${money(o.freespin_value)}${o.freespin_game ? ` (${o.freespin_game})` : ""}`;
  return "—";
}

export function BonusOffersTable() {
  const { data, error } = useLoad(() => api<{ offers: BonusOffer[] }>("/api/promo/offers").then((r) => r.offers));
  if (!data || data.length === 0) return <State error={error} empty={!!data} />;
  return (
    <div className="table-wrap">
      <table className="legal-table">
        <thead><tr><th>Offer</th><th>Type</th><th>Value</th><th>Min. deposit</th><th>Wagering</th><th>Max bet</th><th>Valid</th></tr></thead>
        <tbody>
          {data.map((o) => (
            <tr key={o.id}>
              <td>{o.title}<div className="muted small">{triggerText[o.trigger] ?? ""}</div></td>
              <td>{kindText[o.kind] ?? o.kind}</td>
              <td>{offerValue(o)}</td>
              <td className="nowrap">{o.min_deposit ? money(o.min_deposit) : "—"}</td>
              <td className="nowrap">x{o.wager_multiplier}</td>
              <td className="nowrap">{o.max_bet ? money(o.max_bet) : "No limit"}</td>
              <td className="nowrap">{o.valid_days} {o.valid_days === 1 ? "day" : "days"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function VipLevelsTable() {
  const { data, error } = useLoad(() => api<{ levels: VipLevel[] }>("/api/vip/levels").then((r) => r.levels));
  if (!data || data.length === 0) return <State error={error} empty={!!data} />;
  return (
    <div className="table-wrap">
      <table className="legal-table">
        <thead><tr><th>Level</th><th className="num">Points needed</th><th className="num">Cashback</th><th className="num">Rakeback</th></tr></thead>
        <tbody>
          {data.map((l) => (
            <tr key={l.level}>
              <td>{l.level}. {l.name}</td>
              <td className="num">{l.min_points.toLocaleString("en-US")}</td>
              <td className="num">{l.cashback_pct}%</td>
              <td className="num">{l.rakeback_pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** How much of each bet counts towards bonus wagering, grouped by percentage (lowest first). */
export function WageringContributionTable() {
  const { data, error } = useLoad(async () => {
    const { games } = await api<{ games: Game[] }>("/api/games");
    const groups = new Map<number, string[]>();
    for (const g of games) {
      const pct = g.wagering_contribution ?? 100;
      groups.set(pct, [...(groups.get(pct) ?? []), g.title]);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([pct, titles]) => ({ pct, titles: titles.sort((a, b) => a.localeCompare(b)) }));
  });
  if (!data || data.length === 0) return <State error={error} empty={!!data} />;
  return (
    <div className="table-wrap">
      <table className="legal-table">
        <thead><tr><th className="num">Counts towards wagering</th><th>Games</th><th className="num">A $10.00 bet adds</th></tr></thead>
        <tbody>
          {data.map((g) => (
            <tr key={g.pct}>
              <td className="num nowrap"><b>{g.pct}%</b></td>
              <td>{g.titles.join(", ")}</td>
              <td className="num nowrap">{money(10 * g.pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Method = {
  code: string; title: string; kind: "fiat" | "crypto" | "gateway"; provider: string; network?: string; coin?: string;
  min_cents: number; deposit: boolean; withdraw: boolean;
};

export function PaymentMethodsTable() {
  const { data, error } = useLoad(() => api<{ methods: Method[] }>("/api/payments/methods").then((r) => r.methods));
  if (!data || data.length === 0) return <State error={error} empty={!!data} />;
  // One row per method title: the same coin can be a deposit connector and a manual payout method.
  const rows = new Map<string, { title: string; deposit?: Method; withdraw?: Method }>();
  for (const m of data) {
    const r = rows.get(m.title) ?? { title: m.title };
    if (m.deposit) r.deposit = m;
    if (m.withdraw) r.withdraw = m;
    rows.set(m.title, r);
  }
  return (
    <div className="table-wrap">
      <table className="legal-table">
        <thead><tr><th>Method</th><th>Deposits</th><th>Withdrawals</th></tr></thead>
        <tbody>
          {[...rows.values()].map((r) => (
            <tr key={r.title}>
              <td>{r.title}</td>
              <td className="nowrap">{r.deposit ? `Min. ${money(r.deposit.min_cents)}` : "—"}</td>
              <td>
                {!r.withdraw ? "—" : r.withdraw.provider === "manual"
                  ? `Min. ${money(Math.max(r.withdraw.min_cents, 1000))}, sent by our finance team in ${r.withdraw.coin} on ${r.withdraw.network}`
                  : `Min. ${money(Math.max(r.withdraw.min_cents, 1000))}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type PlinkoTable = { rows: number; risk: string; multipliers: number[]; rtp: number };

/** Plinko payout tables as the server applies them now (current RTP version), with each table's theoretical RTP. */
export function PlinkoTablesLive() {
  const { data: resp, error } = useLoad(() => api<{ rtp: number; tables: PlinkoTable[] }>("/api/originals/plinko/tables"));
  const data = resp?.tables;
  if (!data || data.length === 0) return <State error={error} empty={!!resp} />;
  return (
    <div className="table-wrap">
      <p className="muted small">Plinko currently runs at the <b>{resp!.rtp}%</b> RTP version.</p>
      <table className="legal-table">
        <thead><tr><th>Rows</th><th>Risk</th><th>Multipliers by slot, left to right</th><th className="num">RTP</th></tr></thead>
        <tbody>
          {data.map((t) => (
            <tr key={`${t.rows}-${t.risk}`}>
              <td>{t.rows}</td>
              <td>{t.risk}</td>
              <td className="small">{t.multipliers.map((m) => `${m}x`).join(" · ")}</td>
              <td className="num nowrap">{t.rtp.toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
