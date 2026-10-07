package slot

import (
	"math"
	"testing"
)

// Every outcome Spin can return gets a window whose line wins add up to exactly that multiplier.
func TestLayoutMatchesMultiplier(t *testing.T) {
	mults := []float64{0}
	for _, row := range Paytable {
		mults = append(mults, row.Mult)
	}
	for _, m := range mults {
		if m > 0 && len(combos(m)) == 0 {
			t.Fatalf("no line win pays %vx", m)
		}
		for i := 0; i < 500; i++ {
			g, wins := Layout(m)
			if got := Total(Evaluate(g)); math.Abs(got-m) > 1e-9 || math.Abs(Total(wins)-m) > 1e-9 {
				t.Fatalf("mult %v: window pays %v (%v)", m, got, wins)
			}
		}
	}
}

func TestFallbackMatchesMultiplier(t *testing.T) {
	for _, row := range Paytable {
		for _, c := range combos(row.Mult) {
			g, wins := fallback(row.Mult, []combo{c})
			if math.Abs(Total(wins)-row.Mult) > 1e-9 || len(Evaluate(g)) != 1 {
				t.Fatalf("fallback %v %v: %v", row.Mult, c, wins)
			}
		}
	}
	if g, wins := fallback(0, nil); len(wins) != 0 || len(Evaluate(g)) != 0 {
		t.Fatal("fallback for a loss has a win")
	}
}
