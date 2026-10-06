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
//	        crash = max(1.00, floor(rtp·E / (E − H)) / 100)   (rtp in percent, e.g. 99)
//	Mines, Plinko: a stream of floats from HMAC(server, "client:nonce:cursor") for cursor = 0, 1, …;
//	        each 32-byte block gives 8 floats, 4 bytes each: uint32 big-endian / 2^32.
//
// The RTP (see rtp.go) is a parameter of the payout maths only; the random values do not depend on it.

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"math/big"
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

// CrashPoint returns the crash multiplier in hundredths (100 = 1.00x) for a game running at rtp
// percent. With X = H/2^52 uniform, P(crash ≥ m) = R / m for any m ≥ 1.00 (rounded to cents,
// R = rtp/100), so every auto-cashout target returns exactly R. A share 1 − R/1.01 of rounds
// shows 1.00x.
func CrashPoint(serverSeed, clientSeed string, nonce int64, rtp int) int64 {
	m := hmac.New(sha256.New, []byte(serverSeed))
	fmt.Fprintf(m, "%s:%d", clientSeed, nonce)
	sum := m.Sum(nil)
	return crashFromBits(binary.BigEndian.Uint64(sum[:8])>>12, rtp) // first 52 bits
}

func crashFromBits(h uint64, rtp int) int64 {
	const e = uint64(1) << 52
	c := int64(uint64(rtp) * e / (e - h)) // rtp ≤ 100, so rtp·2^52 fits in 59 bits
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

// MinesPayout is what a bet pays after `revealed` safe tiles with `mines` mines at rtp percent:
// floor(bet × R × C(25, n) / C(25 − mines, n)), before the max-win cap. With no tile revealed it
// is the bet itself.
func MinesPayout(bet int64, mines, revealed, rtp int) int64 {
	if revealed == 0 {
		return bet
	}
	num, den := binom(MinesTiles, revealed), binom(MinesTiles-mines, revealed)
	if den == 0 {
		return 0
	}
	// bet × rtp × C(25, n) can exceed int64 for large bets and many mines.
	v := new(big.Int).Mul(big.NewInt(bet), big.NewInt(int64(rtp)*num))
	v.Quo(v, big.NewInt(100*den))
	if !v.IsInt64() {
		return 1<<63 - 1
	}
	return v.Int64()
}

// MinesMultiplier is R × C(25, n) / C(25 − mines, n) (1.0 with nothing revealed).
func MinesMultiplier(mines, revealed, rtp int) float64 {
	if revealed == 0 {
		return 1
	}
	return float64(rtp) / 100 * float64(binom(MinesTiles, revealed)) / float64(binom(MinesTiles-mines, revealed))
}
