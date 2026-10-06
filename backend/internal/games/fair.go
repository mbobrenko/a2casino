package games

// Provably fair maths shared by the A2 Originals (Dice, Crash, Mines, Plinko).
//
// Every player has ONE seed pair (fair_seeds) shared by all originals: a secret server seed
// (its SHA-256 hash is shown before betting), a client seed and a nonce that goes up by one with
// every bet in any original. Rotating the pair reveals the old server seed. All results are
// derived from HMAC-SHA256(key = server seed, message = ...) and can be recomputed by the player:
//
//	Dice:   HMAC(server, "client:nonce"), first 4 bytes as uint32 mod 10000 / 100
//	Crash:  HMAC(server, "client:nonce"), first 52 bits (13 hex chars) = H, E = 2^52,
//	        crash = max(1.00, floor(99·E / (E − H)) / 100)
//	Mines, Plinko: a stream of floats from HMAC(server, "client:nonce:cursor") for cursor = 0, 1, …;
//	        each 32-byte block gives 8 floats, 4 bytes each: uint32 big-endian / 2^32.

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"fmt"
)

// FairFloats returns n floats in [0, 1) from the HMAC stream of (serverSeed, clientSeed, nonce).
func FairFloats(serverSeed, clientSeed string, nonce int64, n int) []float64 {
	out := make([]float64, 0, n)
	for cursor := 0; len(out) < n; cursor++ {
		m := hmac.New(sha256.New, []byte(serverSeed))
		fmt.Fprintf(m, "%s:%d:%d", clientSeed, nonce, cursor)
		sum := m.Sum(nil)
		for i := 0; i+4 <= len(sum) && len(out) < n; i += 4 {
			out = append(out, float64(binary.BigEndian.Uint32(sum[i:i+4]))/(1<<32))
		}
	}
	return out
}

// ---- Crash ----

const (
	CrashMinTarget = 101    // hundredths: 1.01x
	CrashMaxTarget = 100000 // 1000.00x
	crashCap       = 100000000
)

// CrashPoint returns the crash multiplier in hundredths (100 = 1.00x). With X = H/2^52 uniform,
// P(crash ≥ m) = 0.99 / m for any m ≥ 1.00 (rounded to cents), so every auto-cashout target
// returns 99% (1% house edge). About 1% of rounds crash at 1.00x.
func CrashPoint(serverSeed, clientSeed string, nonce int64) int64 {
	m := hmac.New(sha256.New, []byte(serverSeed))
	fmt.Fprintf(m, "%s:%d", clientSeed, nonce)
	sum := m.Sum(nil)
	return crashFromBits(binary.BigEndian.Uint64(sum[:8]) >> 12) // first 52 bits
}

func crashFromBits(h uint64) int64 {
	const e = uint64(1) << 52
	c := int64(99 * e / (e - h))
	if c < 100 {
		c = 100
	}
	if c > crashCap {
		c = crashCap
	}
	return c
}

// ---- Mines ----

const MinesTiles = 25

// MinesPositions places `mines` mines on the 5×5 board (tiles 0..24, row by row): a Fisher–Yates
// shuffle of 0..24 driven by the float stream (for i = 24 … 1: j = floor(f·(i+1)), swap), the first
// `mines` tiles of the shuffled list are mines.
func MinesPositions(serverSeed, clientSeed string, nonce int64, mines int) []int {
	tiles := make([]int, MinesTiles)
	for i := range tiles {
		tiles[i] = i
	}
	fl := FairFloats(serverSeed, clientSeed, nonce, MinesTiles-1)
	for k, i := 0, MinesTiles-1; i >= 1; k, i = k+1, i-1 {
		j := int(fl[k] * float64(i+1))
		tiles[i], tiles[j] = tiles[j], tiles[i]
	}
	out := append([]int(nil), tiles[:mines]...)
	return out
}

func binom(n, k int) int64 {
	if k < 0 || k > n {
		return 0
	}
	r := int64(1)
	for i := 1; i <= k; i++ {
		r = r * int64(n-k+i) / int64(i)
	}
	return r
}

// MinesPayout is what a bet pays after `revealed` safe tiles with `mines` mines:
// floor(bet × 0.99 × C(25, n) / C(25 − mines, n)). With no tile revealed it is the bet itself.
func MinesPayout(bet int64, mines, revealed int) int64 {
	if revealed == 0 {
		return bet
	}
	num, den := binom(MinesTiles, revealed), binom(MinesTiles-mines, revealed)
	if den == 0 {
		return 0
	}
	return bet * 99 * num / (100 * den)
}

// MinesMultiplier is 0.99 × C(25, n) / C(25 − mines, n) (1.0 with nothing revealed).
func MinesMultiplier(mines, revealed int) float64 {
	if revealed == 0 {
		return 1
	}
	return 0.99 * float64(binom(MinesTiles, revealed)) / float64(binom(MinesTiles-mines, revealed))
}

// ---- Plinko ----

// PlinkoTables are the payouts in hundredths (560 = 5.6x) for each slot, left to right, by rows
// and risk. Each table returns 98.9–99.1% (see TestPlinkoRTP).
var PlinkoTables = map[int]map[string][]int64{
	8: {
		"low":    {560, 210, 110, 100, 50, 100, 110, 210, 560},
		"medium": {1300, 300, 130, 70, 40, 70, 130, 300, 1300},
		"high":   {2900, 400, 150, 30, 20, 30, 150, 400, 2900},
	},
	12: {
		"low":    {1000, 300, 160, 140, 110, 100, 50, 100, 110, 140, 160, 300, 1000},
		"medium": {3300, 1100, 400, 200, 110, 60, 30, 60, 110, 200, 400, 1100, 3300},
		"high":   {17000, 2400, 810, 200, 70, 20, 20, 20, 70, 200, 810, 2400, 17000},
	},
	16: {
		"low":    {1600, 900, 200, 140, 140, 120, 110, 100, 50, 100, 110, 120, 140, 140, 200, 900, 1600},
		"medium": {11000, 4100, 1000, 500, 300, 150, 100, 50, 30, 50, 100, 150, 300, 500, 1000, 4100, 11000},
		"high":   {100000, 13000, 2600, 900, 400, 200, 20, 20, 20, 20, 20, 200, 400, 900, 2600, 13000, 100000},
	},
}

// PlinkoPath drops the ball through `rows` rows: one float per row, f ≥ 0.5 = right (1), else left (0).
// The slot is the number of right bounces (0 = far left).
func PlinkoPath(serverSeed, clientSeed string, nonce int64, rows int) (path []int, slot int) {
	path = make([]int, rows)
	for i, f := range FairFloats(serverSeed, clientSeed, nonce, rows) {
		if f >= 0.5 {
			path[i] = 1
			slot++
		}
	}
	return path, slot
}

// PlinkoRTP is the theoretical return of a table: Σ C(rows, k) / 2^rows × multiplier(k).
func PlinkoRTP(rows int, table []int64) float64 {
	sum := 0.0
	for k, m := range table {
		sum += float64(binom(rows, k)) * float64(m) / 100
	}
	return sum / float64(int64(1)<<rows)
}
