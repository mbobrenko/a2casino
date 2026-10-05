"use client";
// Tables on the legal pages that show live values from the public API, so the published
// figures always match what the platform is configured with.
import { useEffect, useState } from "react";
import { api, money } from "@/lib/api";
import type { Game } from "@/lib/api";
import type { BonusOffer, VipLevel } from "@/lib/labels";

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
        <thead><tr><th>Offer</th><th>Type</th><th>Value</th><th>Min. deposit</th><th>Wagering</th><th>Valid</th></tr></thead>
        <tbody>
          {data.map((o) => (
            <tr key={o.id}>
              <td>{o.title}<div className="muted small">{triggerText[o.trigger] ?? ""}</div></td>
              <td>{kindText[o.kind] ?? o.kind}</td>
              <td>{offerValue(o)}</td>
              <td className="nowrap">{o.min_deposit ? money(o.min_deposit) : "—"}</td>
              <td className="nowrap">x{o.wager_multiplier}</td>
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

type Method = { code: string; title: string; kind: "fiat" | "crypto" | "gateway"; network?: string; min_cents: number };

export function PaymentMethodsTable() {
  const { data, error } = useLoad(() => api<{ methods: Method[] }>("/api/payments/methods").then((r) => r.methods));
  if (!data || data.length === 0) return <State error={error} empty={!!data} />;
  return (
    <div className="table-wrap">
      <table className="legal-table">
        <thead><tr><th>Method</th><th className="num">Min. deposit</th><th>Withdrawals</th></tr></thead>
        <tbody>
          {data.map((m) => (
            <tr key={m.code}>
              <td>{m.title}</td>
              <td className="num nowrap">{money(m.min_cents)}</td>
              <td>{m.kind === "gateway" ? "Deposits only" : "Yes, min. $10.00"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
