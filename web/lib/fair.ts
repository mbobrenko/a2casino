// In-browser verification of A2 Originals results (WebCrypto), mirroring backend/internal/games/fair.go,
// rtp.go and plinko_tables.go. All games use HMAC-SHA256 with the server seed (as text) as the key.
// Payouts depend on the RTP the round was played at (`rtp` in every result, in percent): the operator
// picks one of RTP_PRESETS per game; it is the same for every player and recorded with each round.

/** The RTP versions an A2 Original can run at, in percent. */
export const RTP_PRESETS = [90, 92, 94, 95, 96, 97, 98, 99];
export const DEFAULT_RTP = 99;

const enc = new TextEncoder();

async function hmac(key: string, message: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
}

export async function sha256Hex(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

const u32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

/** Dice roll 0.00–99.99: first 4 bytes of HMAC(server, "client:nonce") mod 10000 / 100. */
export async function diceRoll(server: string, client: string, nonce: number): Promise<number> {
  return (u32(await hmac(server, `${client}:${nonce}`), 0) % 10000) / 100;
}

/** Dice multiplier: R × 100 / target (R = rtp / 100). */
export const diceMultiplier = (target: number, rtp = DEFAULT_RTP) => rtp / target;

/** Crash point: H = first 52 bits of HMAC(server, "client:nonce"), E = 2^52, max(1, floor(rtp·E/(E−H))/100). */
export async function crashPoint(server: string, client: string, nonce: number, rtp = DEFAULT_RTP): Promise<number> {
  const h = await hmac(server, `${client}:${nonce}`);
  let v = 0n;
  for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(h[i]);
  const H = v >> 12n;
  const E = 1n << 52n;
  let c = (BigInt(rtp) * E) / (E - H);
  if (c < 100n) c = 100n;
  if (c > 100000000n) c = 100000000n;
  return Number(c) / 100;
}

/** Float stream: HMAC(server, "client:nonce:cursor"), 8 floats (4 bytes / 2^32) per block. */
export async function fairFloats(server: string, client: string, nonce: number, n: number): Promise<number[]> {
  const out: number[] = [];
  for (let cursor = 0; out.length < n; cursor++) {
    const h = await hmac(server, `${client}:${nonce}:${cursor}`);
    for (let i = 0; i + 4 <= h.length && out.length < n; i += 4) out.push(u32(h, i) / 2 ** 32);
  }
  return out;
}

/** Mines: Fisher–Yates shuffle of tiles 0..24 (i = 24…1, j = floor(f·(i+1))); the first `mines` are mines. */
export async function minesPositions(server: string, client: string, nonce: number, mines: number): Promise<number[]> {
  const tiles = Array.from({ length: 25 }, (_, i) => i);
  const f = await fairFloats(server, client, nonce, 24);
  for (let k = 0, i = 24; i >= 1; k++, i--) {
    const j = Math.floor(f[k] * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles.slice(0, mines);
}

/** Plinko: one float per row, ≥ 0.5 = right. Slot = number of rights. */
export async function plinkoPath(server: string, client: string, nonce: number, rows: number): Promise<{ path: number[]; slot: number }> {
  const path: number[] = (await fairFloats(server, client, nonce, rows)).map((f) => (f >= 0.5 ? 1 : 0));
  return { path, slot: path.reduce((a, b) => a + b, 0) };
}

function binom(n: number, k: number) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** Mines multiplier after n safe tiles: R × C(25, n) / C(25 − mines, n). */
export const minesMultiplier = (mines: number, n: number, rtp = DEFAULT_RTP) =>
  n === 0 ? 1 : ((rtp / 100) * binom(25, n)) / binom(25 - mines, n);

/** Plinko 99% payout tables in hundredths (560 = 5.6x), left to right: the base of every RTP version. */
const PLINKO_BASE: Record<number, Record<string, number[]>> = {
  8: {
    low: [560, 210, 110, 100, 50, 100, 110, 210, 560],
    medium: [1300, 300, 130, 70, 40, 70, 130, 300, 1300],
    high: [2900, 400, 150, 30, 20, 30, 150, 400, 2900],
  },
  12: {
    low: [1000, 300, 160, 140, 110, 100, 50, 100, 110, 140, 160, 300, 1000],
    medium: [3300, 1100, 400, 200, 110, 60, 30, 60, 110, 200, 400, 1100, 3300],
    high: [17000, 2400, 810, 200, 70, 20, 20, 20, 70, 200, 810, 2400, 17000],
  },
  16: {
    low: [1600, 900, 200, 140, 140, 120, 110, 100, 50, 100, 110, 120, 140, 140, 200, 900, 1600],
    medium: [11000, 4100, 1000, 500, 300, 150, 100, 50, 30, 50, 100, 150, 300, 500, 1000, 4100, 11000],
    high: [100000, 13000, 2600, 900, 400, 200, 20, 20, 20, 20, 20, 200, 400, 900, 2600, 13000, 100000],
  },
};

const plinkoSum = (rows: number, t: number[]) => t.reduce((s, m, k) => s + binom(rows, k) * m, 0);

/**
 * The Plinko table (hundredths) for an RTP version, built exactly like the server does
 * (backend/internal/games/plinko_tables.go), in integers:
 *  1. target T = rtp × 2^rows, base sum S = Σ C(rows, k) × m_k; scale m_k by T / S, round half up;
 *  2. while it gets Σ closer to T, add or take 0.01x on the symmetric slot pair (or the centre slot)
 *     that gets it closest, keeping multipliers ≥ 0.01x and non-increasing towards the centre
 *     (ties: outermost slot). The 99% tables are the base itself.
 */
function derivePlinko(rows: number, base: number[], rtp: number): number[] {
  const t = [...base];
  if (rtp === DEFAULT_RTP) return t;
  const target = rtp * 2 ** rows;
  const sBase = plinkoSum(rows, base);
  for (let k = 0; k < t.length; k++) t[k] = Math.max(1, Math.floor((2 * base[k] * target + sBase) / (2 * sBase)));
  const half = Math.floor(rows / 2);
  for (;;) {
    const diff = target - plinkoSum(rows, t);
    let bestK = -1, bestD = 0, bestErr = Math.abs(diff);
    for (let k = 0; k <= half; k++) {
      const w = k === rows - k ? binom(rows, k) : 2 * binom(rows, k);
      for (const d of [1, -1]) {
        const m = t[k] + d;
        if (m < 1 || (k > 0 && m > t[k - 1]) || (k < half && m < t[k + 1])) continue;
        const e = Math.abs(diff - d * w);
        if (e < bestErr) { bestK = k; bestD = d; bestErr = e; }
      }
    }
    if (bestK < 0) return t;
    t[bestK] += bestD;
    t[rows - bestK] = t[bestK];
  }
}

const plinkoCache = new Map<string, number[]>();

/** Plinko multipliers (x, left to right) for rows / risk at an RTP version. */
export function plinkoTable(rtp: number, rows: number, risk: string): number[] {
  const key = `${rtp}:${rows}:${risk}`;
  let t = plinkoCache.get(key);
  if (!t) {
    t = derivePlinko(rows, PLINKO_BASE[rows][risk], rtp).map((m) => m / 100);
    plinkoCache.set(key, t);
  }
  return t;
}

export const plinkoRTP = (rows: number, table: number[]) =>
  table.reduce((s, m, k) => s + binom(rows, k) * m, 0) / 2 ** rows;
