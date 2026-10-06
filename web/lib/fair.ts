// In-browser verification of A2 Originals results (WebCrypto), mirroring backend/internal/games/fair.go.
// All games use HMAC-SHA256 with the server seed (as text) as the key.

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

/** Crash point: H = first 52 bits of HMAC(server, "client:nonce"), E = 2^52, max(1, floor(99E/(E−H))/100). */
export async function crashPoint(server: string, client: string, nonce: number): Promise<number> {
  const h = await hmac(server, `${client}:${nonce}`);
  let v = 0n;
  for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(h[i]);
  const H = v >> 12n;
  const E = 1n << 52n;
  let c = (99n * E) / (E - H);
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

/** Mines multiplier after n safe tiles: 0.99 × C(25, n) / C(25 − mines, n). */
export const minesMultiplier = (mines: number, n: number) => (n === 0 ? 1 : (0.99 * binom(25, n)) / binom(25 - mines, n));

/** Plinko payout tables (same as the server), left to right. */
export const PLINKO: Record<number, Record<string, number[]>> = {
  8: {
    low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
  },
  12: {
    low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
  },
  16: {
    low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
};

export const plinkoRTP = (rows: number, table: number[]) =>
  table.reduce((s, m, k) => s + binom(rows, k) * m, 0) / 2 ** rows;
