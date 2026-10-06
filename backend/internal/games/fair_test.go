package games

import (
	"fmt"
	"math"
	"slices"
	"testing"
)

func TestCrashPointFormula(t *testing.T) {
	const e = uint64(1) << 52
	cases := []struct {
		h    uint64
		rtp  int
		want int64
	}{
		{0, 99, 100},            // 0.99 → clamped to 1.00x
		{e / 100, 99, 100},      // X ≈ 0.01 → 1.00x
		{e / 2, 99, 198},        // X = 0.5 → 1.98x
		{e - e/100, 99, 9900},   // X ≈ 0.99 → 99.00x
		{e - e/1000, 99, 99000}, // 990x
		{e - 1, 99, crashCap},   // capped
		{e / 2, 96, 192},        // R × 100 × E / (E − H) = 96 × 2
		{e / 2, 90, 180},
		{e - e/100, 95, 9500},
		{e / 10, 90, 100}, // 90 / 0.9 = 100 → 1.00x
	}
	for _, c := range cases {
		if got := crashFromBits(c.h, c.rtp); got != c.want {
			t.Errorf("crash(%d, rtp %d) = %d, want %d", c.h, c.rtp, got, c.want)
		}
	}
	if CrashPoint("s", "c", 1, 99) != CrashPoint("s", "c", 1, 99) {
		t.Fatal("crash point is not deterministic")
	}
}

// P(crash ≥ m) = R/m, so every auto cash-out target returns R, for every preset.
func TestCrashDistributionRTP(t *testing.T) {
	const n = 200000
	for _, rtp := range RTPPresets {
		points := make([]int64, n)
		for i := range points {
			points[i] = CrashPoint("server-seed-crash", "client", int64(i), rtp)
		}
		r := float64(rtp) / 100
		instant := 0
		for _, p := range points {
			if p == 100 {
				instant++
			}
		}
		// Crash points below 1.01x (those under 1.00x plus those in [1.00, 1.01)) show as 1.00x.
		if share, want := float64(instant)/n, 1-r/1.01; math.Abs(share-want) > 0.003 {
			t.Errorf("rtp %d: share of 1.00x crashes = %.4f, want about %.4f", rtp, share, want)
		}
		rtpSum := 0.0
		targets := []int64{101, 150, 200, 500, 1000, 2000}
		for _, target := range targets {
			wins := 0
			for _, p := range points {
				if p >= target {
					wins++
				}
			}
			p := float64(wins) / n
			want := r * 100 / float64(target)
			sd := math.Sqrt(want * (1 - want) / n)
			if math.Abs(p-want) > 5*sd {
				t.Errorf("rtp %d target %.2fx: P(win) = %.5f, want %.5f ± %.5f", rtp, float64(target)/100, p, want, 5*sd)
			}
			rtpSum += p * float64(target) / 100
		}
		emp := rtpSum / float64(len(targets))
		t.Logf("crash rtp %d%%: empirical %.4f", rtp, emp*100)
		if math.Abs(emp-r) > 0.006 {
			t.Errorf("rtp %d: average empirical RTP %.4f, want %.2f", rtp, emp, r)
		}
	}
}

func TestDiceRTP(t *testing.T) {
	if got := DiceMultiplier(50, 99); math.Abs(got-1.98) > 1e-12 {
		t.Errorf("99%% at 50: %v", got)
	}
	if got := DiceMultiplier(50, 96); math.Abs(got-1.92) > 1e-12 {
		t.Errorf("96%% at 50: %v", got)
	}
	if got := DiceMultiplier(2, 90); math.Abs(got-45) > 1e-12 {
		t.Errorf("90%% at 2: %v", got)
	}
	// Exact: P(win) = target/100, so RTP = target/100 × R × 100/target = R. Empirically too:
	const n = 200000
	rolls := make([]int, n)
	for i := range rolls {
		rolls[i] = DiceRoll("dice-rtp", "c", int64(i))
	}
	for _, rtp := range RTPPresets {
		for _, target := range []float64{10, 50, 90} {
			paid := 0.0
			for _, roll := range rolls {
				if float64(roll)/100 < target {
					paid += DiceMultiplier(target, rtp)
				}
			}
			emp := paid / n
			want := float64(rtp) / 100
			p := target / 100
			sd := DiceMultiplier(target, rtp) * math.Sqrt(p*(1-p)/n)
			if math.Abs(emp-want) > 5*sd {
				t.Errorf("dice rtp %d target %.0f: empirical %.4f, want %.2f ± %.4f", rtp, target, emp, want, 5*sd)
			}
		}
	}
}

func TestMinesMultipliers(t *testing.T) {
	cases := []struct {
		mines, n, rtp int
		want          float64
	}{
		{1, 1, 99, 0.99 * 25.0 / 24},
		{3, 1, 99, 0.99 * 25.0 / 22},
		{3, 5, 99, 0.99 * 53130.0 / 26334},
		{24, 1, 99, 24.75},
		{1, 24, 99, 24.75},
		{5, 0, 99, 1},
		{24, 1, 96, 24},
		{3, 2, 90, 0.9 * 300 / 231},
		{5, 0, 90, 1},
	}
	for _, c := range cases {
		if got := MinesMultiplier(c.mines, c.n, c.rtp); math.Abs(got-c.want) > 1e-9 {
			t.Errorf("multiplier(%d mines, %d revealed, rtp %d) = %v, want %v", c.mines, c.n, c.rtp, got, c.want)
		}
	}
	if got := MinesPayout(100, 3, 5, 99); got != 199 { // $1 × 1.99733 rounded down
		t.Errorf("payout = %d, want 199", got)
	}
	if got := MinesPayout(1000, 24, 1, 99); got != 24750 {
		t.Errorf("payout = %d, want 24750", got)
	}
	if got := MinesPayout(1000, 24, 1, 92); got != 23000 {
		t.Errorf("payout at 92%% = %d, want 23000", got)
	}
	// The theoretical maximum (24 mines is 24x, but e.g. 12 mines, 13 gems = R × C(25,13)/C(13,13))
	// does not overflow for large bets.
	if got := MinesPayout(1e9, 12, 13, 99); got != 1e9*99*5200300/100 {
		t.Errorf("big payout = %d", got)
	}
	// Cashing out after n safe tiles returns R whatever the mines and n:
	// P(n safe) × multiplier = C(25−m, n)/C(25, n) × R × C(25, n)/C(25−m, n).
	for _, rtp := range RTPPresets {
		for m := 1; m <= 24; m++ {
			for n := 1; n <= MinesTiles-m; n++ {
				p := float64(binom(MinesTiles-m, n)) / float64(binom(MinesTiles, n))
				if got := p * MinesMultiplier(m, n, rtp); math.Abs(got-float64(rtp)/100) > 1e-9 {
					t.Fatalf("rtp %d, mines %d, %d revealed: RTP %v", rtp, m, n, got)
				}
			}
		}
	}
}

// Simulated Mines play (fixed strategy: cash out after k gems) returns R for every preset.
func TestMinesEmpiricalRTP(t *testing.T) {
	const n = 60000
	boards := make([][]int, n)
	for i := range boards {
		boards[i] = MinesPositions("mines-rtp", "c", int64(i), 3)
	}
	order := []int{0, 1, 2, 3, 4} // reveal tiles 0..4, cash out after 2 gems
	const gems = 2
	mult := func(rtp int) float64 { return MinesMultiplier(3, gems, rtp) }
	for _, rtp := range RTPPresets {
		paid := 0.0
		for _, b := range boards {
			found := 0
			for _, tile := range order {
				if slices.Contains(b, tile) {
					break
				}
				if found++; found == gems {
					paid += mult(rtp)
					break
				}
			}
		}
		emp := paid / n
		p := float64(binom(22, gems)) / float64(binom(25, gems))
		sd := mult(rtp) * math.Sqrt(p*(1-p)/n)
		t.Logf("mines rtp %d%%: empirical %.4f", rtp, emp*100)
		if want := float64(rtp) / 100; math.Abs(emp-want) > 5*sd {
			t.Errorf("mines rtp %d: empirical %.4f, want %.2f ± %.4f", rtp, emp, want, 5*sd)
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
	for _, rtp := range RTPPresets {
		for _, rows := range PlinkoRows {
			for _, risk := range PlinkoRisks {
				table := PlinkoTable(rtp, rows, risk)
				base := PlinkoTables[rows][risk]
				if len(table) != rows+1 {
					t.Fatalf("%d/%d/%s: %d slots", rtp, rows, risk, len(table))
				}
				for i := range table {
					if table[i] != table[rows-i] {
						t.Fatalf("%d/%d/%s is not symmetric", rtp, rows, risk)
					}
					if table[i] < 1 {
						t.Fatalf("%d/%d/%s: slot %d pays %d", rtp, rows, risk, i, table[i])
					}
					// Same shape as the base: non-increasing towards the centre.
					if i > 0 && i <= rows/2 && table[i] > table[i-1] {
						t.Fatalf("%d/%d/%s: not non-increasing towards the centre: %v", rtp, rows, risk, table)
					}
				}
				got := PlinkoRTP(rows, table) * 100
				t.Logf("plinko rtp %d%% %2d rows %-6s RTP %.4f%%", rtp, rows, risk, got)
				if math.Abs(got-float64(rtp)) > 0.15 {
					t.Errorf("plinko rtp %d %d rows %s: RTP %.4f%% not within 0.15 pp", rtp, rows, risk, got)
				}
				if rtp == DefaultRTP && fmt.Sprint(table) != fmt.Sprint(base) {
					t.Errorf("99%% table %d/%s differs from the base", rows, risk)
				}
				// The outermost slot keeps its rough size (the shape is scaled, not rebuilt).
				if ratio := float64(table[0]) / float64(base[0]); math.Abs(ratio-float64(rtp)/99) > 0.02 {
					t.Errorf("%d/%d/%s: edge slot scaled by %.3f", rtp, rows, risk, ratio)
				}
			}
		}
	}
	if PlinkoTable(93, 8, "low") != nil || PlinkoTable(99, 10, "low") != nil {
		t.Fatal("unknown preset or rows gave a table")
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
	slots := make([]int, n)
	for i := range slots {
		_, slots[i] = PlinkoPath("srv", "cli", int64(i), 12)
	}
	for _, rtp := range RTPPresets {
		table := PlinkoTable(rtp, 12, "medium")
		var paid int64
		for _, slot := range slots {
			paid += table[slot]
		}
		emp := float64(paid) / 100 / n
		t.Logf("plinko rtp %d%% 12/medium: empirical %.4f", rtp, emp*100)
		if math.Abs(emp-PlinkoRTP(12, table)) > 0.02 || math.Abs(emp-float64(rtp)/100) > 0.025 {
			t.Errorf("rtp %d: empirical RTP %.4f, theory %.4f", rtp, emp, PlinkoRTP(12, table))
		}
	}
}

func TestCapWin(t *testing.T) {
	if w, c := capWin(5000, 1000); w != 1000 || !c {
		t.Fatal(w, c)
	}
	if w, c := capWin(500, 1000); w != 500 || c {
		t.Fatal(w, c)
	}
	if w, c := capWin(5000, 0); w != 5000 || c {
		t.Fatal(w, c)
	}
	if !ValidRTP(96) || ValidRTP(93) || ValidRTP(100) {
		t.Fatal("ValidRTP")
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
	t.Logf("vectors server=abc client=xyz nonce=7: dice %d crash(99) %d crash(96) %d mines(3) %v plinko(16) %v",
		DiceRoll("abc", "xyz", 7), CrashPoint("abc", "xyz", 7, 99), CrashPoint("abc", "xyz", 7, 96), MinesPositions("abc", "xyz", 7, 3), func() []int { p, _ := PlinkoPath("abc", "xyz", 7, 16); return p }())
}
