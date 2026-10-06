package games

// Plinko payout tables. PlinkoTables are the 99% tables (the base); the tables of the other RTP
// presets are derived from them deterministically so the shape (the risk profile) stays the same:
//
//  1. Work in integers: multipliers in hundredths, slot weights C(rows, k), so the return of a table
//     is S = Σ C(rows, k) × m_k and the target for rtp percent is T = rtp × 2^rows.
//  2. Scale every multiplier by T / S_base and round half up to the hundredth.
//  3. Nudge: while it brings S closer to T, add or take 0.01x on the symmetric slot pair (or the
//     centre slot) that brings it closest, keeping the multipliers non-increasing towards the centre
//     and at least 0.01x. Ties go to the outermost slot.
//
// web/lib/fair.ts implements the same steps so the player can rebuild any table in the browser;
// the published tables (GET /api/originals/plinko/tables) are these.

// PlinkoTables are the 99% payouts in hundredths (560 = 5.6x) for each slot, left to right, by rows
// and risk. Each returns 98.9–99.2% (see TestPlinkoRTP).
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

// PlinkoRows and PlinkoRisks list the boards in the order they are published.
var (
	PlinkoRows  = []int{8, 12, 16}
	PlinkoRisks = []string{"low", "medium", "high"}
)

// plinkoByRTP[rtp][rows][risk], built once at start-up.
var plinkoByRTP = func() map[int]map[int]map[string][]int64 {
	out := map[int]map[int]map[string][]int64{}
	for _, rtp := range RTPPresets {
		out[rtp] = map[int]map[string][]int64{}
		for _, rows := range PlinkoRows {
			out[rtp][rows] = map[string][]int64{}
			for _, risk := range PlinkoRisks {
				out[rtp][rows][risk] = derivePlinko(rows, PlinkoTables[rows][risk], rtp)
			}
		}
	}
	return out
}()

// PlinkoTable is the table (hundredths per slot) for an RTP preset; nil for unknown rows, risk or rtp.
func PlinkoTable(rtp, rows int, risk string) []int64 {
	return plinkoByRTP[rtp][rows][risk]
}

func plinkoSum(rows int, t []int64) int64 {
	var s int64
	for k, m := range t {
		s += binom(rows, k) * m
	}
	return s
}

// derivePlinko reshapes a 99% base table to rtp percent (see the steps above). The 99% tables are
// the base itself.
func derivePlinko(rows int, base []int64, rtp int) []int64 {
	t := append([]int64(nil), base...)
	if rtp == DefaultRTP {
		return t
	}
	target := int64(rtp) << rows
	sBase := plinkoSum(rows, base)
	for k, m := range base {
		t[k] = (2*m*target + sBase) / (2 * sBase) // round half up
		if t[k] < 1 {
			t[k] = 1
		}
	}
	abs := func(x int64) int64 {
		if x < 0 {
			return -x
		}
		return x
	}
	half := rows / 2
	for {
		diff := target - plinkoSum(rows, t)
		bestK, bestD, bestErr := -1, int64(0), abs(diff)
		for k := 0; k <= half; k++ {
			w := 2 * binom(rows, k)
			if k == rows-k {
				w = binom(rows, k)
			}
			for _, d := range []int64{1, -1} {
				m := t[k] + d
				if m < 1 || (k > 0 && m > t[k-1]) || (k < half && m < t[k+1]) {
					continue // keep ≥ 0.01x and the shape: non-increasing towards the centre
				}
				if e := abs(diff - d*w); e < bestErr {
					bestK, bestD, bestErr = k, d, e
				}
			}
		}
		if bestK < 0 {
			return t
		}
		t[bestK] += bestD
		t[rows-bestK] = t[bestK]
	}
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
	return float64(plinkoSum(rows, table)) / 100 / float64(int64(1)<<rows)
}
