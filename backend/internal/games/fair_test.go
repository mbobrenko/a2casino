package games

import (
	"fmt"
	"math"
	"testing"
)

func TestCrashPointFormula(t *testing.T) {
	const e = uint64(1) << 52
	cases := []struct {
		h    uint64
		want int64
	}{
		{0, 100},            // 0.99 → clamped to 1.00x
		{e / 100, 100},      // X ≈ 0.01 → 1.00x
		{e / 2, 198},        // X = 0.5 → 1.98x
		{e - e/100, 9900},   // X ≈ 0.99 → 99.00x
		{e - e/1000, 99000}, // 990x
		{e - 1, crashCap},   // capped
	}
	for _, c := range cases {
		if got := crashFromBits(c.h); got != c.want {
			t.Errorf("crash(%d) = %d, want %d", c.h, got, c.want)
		}
	}
	if CrashPoint("s", "c", 1) != CrashPoint("s", "c", 1) {
		t.Fatal("crash point is not deterministic")
	}
}

// P(crash ≥ m) = 0.99/m, so every auto cash-out target keeps a 1% edge.
func TestCrashDistributionEdge(t *testing.T) {
	const n = 300000
	points := make([]int64, n)
	for i := range points {
		points[i] = CrashPoint("server-seed-crash", "client", int64(i))
	}
	instant := 0
	for _, p := range points {
		if p == 100 {
			instant++
		}
	}
	// Crash points below 1.01x (1% that would be under 1.00x plus those in [1.00, 1.01)) show as 1.00x.
	if share, want := float64(instant)/n, 1-0.99/1.01; math.Abs(share-want) > 0.002 {
		t.Errorf("share of 1.00x crashes = %.4f, want about %.4f", share, want)
	}
	edgeSum := 0.0
	targets := []int64{101, 150, 200, 500, 1000, 2000}
	for _, target := range targets {
		wins := 0
		for _, p := range points {
			if p >= target {
				wins++
			}
		}
		p := float64(wins) / n
		want := 99.0 / float64(target)
		sd := math.Sqrt(want * (1 - want) / n)
		if math.Abs(p-want) > 5*sd {
			t.Errorf("target %.2fx: P(win) = %.5f, want %.5f ± %.5f", float64(target)/100, p, want, 5*sd)
		}
		rtp := p * float64(target) / 100
		edgeSum += 1 - rtp
		t.Logf("crash target %.2fx: P(win) %.4f (theory %.4f), RTP %.4f", float64(target)/100, p, want, rtp)
	}
	if edge := edgeSum / float64(len(targets)); edge < 0.005 || edge > 0.015 {
		t.Errorf("average house edge %.4f, want about 0.01", edge)
	}
}

func TestMinesMultipliers(t *testing.T) {
	cases := []struct {
		mines, n int
		want     float64
	}{
		{1, 1, 0.99 * 25.0 / 24},
		{3, 1, 0.99 * 25.0 / 22},
		{3, 5, 0.99 * 53130.0 / 26334},
		{24, 1, 24.75},
		{1, 24, 24.75},
		{5, 0, 1},
	}
	for _, c := range cases {
		if got := MinesMultiplier(c.mines, c.n); math.Abs(got-c.want) > 1e-9 {
			t.Errorf("multiplier(%d mines, %d revealed) = %v, want %v", c.mines, c.n, got, c.want)
		}
	}
	if got := MinesPayout(100, 3, 5); got != 199 { // $1 × 1.99733 rounded down
		t.Errorf("payout = %d, want 199", got)
	}
	if got := MinesPayout(1000, 24, 1); got != 24750 {
		t.Errorf("payout = %d, want 24750", got)
	}
	// Cashing out after n safe tiles returns 99% whatever the mines and n:
	// P(n safe) × multiplier = C(25−m, n)/C(25, n) × 0.99 × C(25, n)/C(25−m, n).
	for m := 1; m <= 24; m++ {
		for n := 1; n <= MinesTiles-m; n++ {
			p := float64(binom(MinesTiles-m, n)) / float64(binom(MinesTiles, n))
			if rtp := p * MinesMultiplier(m, n); math.Abs(rtp-0.99) > 1e-9 {
				t.Fatalf("mines %d, %d revealed: RTP %v", m, n, rtp)
			}
		}
	}
}

func TestMinesPositions(t *testing.T) {
	a := MinesPositions("srv", "cli", 3, 5)
	b := MinesPositions("srv", "cli", 3, 5)
	if fmt.Sprint(a) != fmt.Sprint(b) {
		t.Fatalf("not deterministic: %v vs %v", a, b)
	}
	if fmt.Sprint(a) == fmt.Sprint(MinesPositions("srv", "cli", 4, 5)) {
		t.Fatal("nonce does not change the board")
	}
	counts := make([]int, MinesTiles)
	const rounds = 20000
	for i := int64(0); i < rounds; i++ {
		pos := MinesPositions("srv", "cli", i, 3)
		seen := map[int]bool{}
		for _, p := range pos {
			if p < 0 || p >= MinesTiles || seen[p] {
				t.Fatalf("bad board %v", pos)
			}
			seen[p] = true
			counts[p]++
		}
		if len(pos) != 3 {
			t.Fatalf("board has %d mines", len(pos))
		}
	}
	want := float64(rounds) * 3 / MinesTiles // 2400 per tile
	for tile, c := range counts {
		if math.Abs(float64(c)-want) > 5*math.Sqrt(want) {
			t.Errorf("tile %d mined %d times, want about %.0f", tile, c, want)
		}
	}
	if all := MinesPositions("srv", "cli", 1, 24); len(all) != 24 {
		t.Fatalf("24 mines: %v", all)
	}
}

func TestPlinkoRTP(t *testing.T) {
	for _, rows := range []int{8, 12, 16} {
		for _, risk := range []string{"low", "medium", "high"} {
			table := PlinkoTables[rows][risk]
			if len(table) != rows+1 {
				t.Fatalf("%d/%s: %d slots", rows, risk, len(table))
			}
			for i := range table {
				if table[i] != table[rows-i] {
					t.Fatalf("%d/%s is not symmetric", rows, risk)
				}
			}
			rtp := PlinkoRTP(rows, table) * 100
			t.Logf("plinko %2d rows %-6s RTP %.4f%%", rows, risk, rtp)
			if rtp < 98.5 || rtp > 99.2 {
				t.Errorf("plinko %d rows %s: RTP %.4f%% outside 98.5–99.2%%", rows, risk, rtp)
			}
		}
	}
}

func TestPlinkoPath(t *testing.T) {
	p1, s1 := PlinkoPath("srv", "cli", 9, 16)
	p2, s2 := PlinkoPath("srv", "cli", 9, 16)
	if fmt.Sprint(p1) != fmt.Sprint(p2) || s1 != s2 {
		t.Fatal("plinko path is not deterministic")
	}
	sum := 0
	for _, b := range p1 {
		sum += b
	}
	if sum != s1 || len(p1) != 16 {
		t.Fatalf("slot %d does not match path %v", s1, p1)
	}
	// Slots follow the binomial distribution: the empirical return is close to the table's RTP.
	const n = 200000
	table := PlinkoTables[12]["medium"]
	var paid int64
	for i := int64(0); i < n; i++ {
		_, slot := PlinkoPath("srv", "cli", i, 12)
		paid += table[slot]
	}
	if rtp := float64(paid) / 100 / n; math.Abs(rtp-PlinkoRTP(12, table)) > 0.02 {
		t.Errorf("empirical RTP %.4f, theory %.4f", rtp, PlinkoRTP(12, table))
	}
}

// Known vectors, also used to check the in-browser verifier (web/lib/fair.ts).
func TestFairVectors(t *testing.T) {
	f := FairFloats("s", "c", 0, 20)
	if len(f) != 20 {
		t.Fatalf("%d floats", len(f))
	}
	for _, x := range f {
		if x < 0 || x >= 1 {
			t.Fatalf("float %v out of range", x)
		}
	}
	if fmt.Sprint(FairFloats("s", "c", 0, 9)[8]) != fmt.Sprint(f[8]) {
		t.Fatal("stream is not stable")
	}
	t.Logf("vectors server=abc client=xyz nonce=7: dice %d crash %d mines(3) %v plinko(16) %v",
		DiceRoll("abc", "xyz", 7), CrashPoint("abc", "xyz", 7), MinesPositions("abc", "xyz", 7, 3), func() []int { p, _ := PlinkoPath("abc", "xyz", 7, 16); return p }())
}
