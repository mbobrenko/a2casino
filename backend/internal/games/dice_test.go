package games

import "testing"

// The roll must be reproducible by the player from the revealed seeds.
func TestDiceRollIsDeterministic(t *testing.T) {
	a := DiceRoll("server-seed", "client-seed", 7)
	if b := DiceRoll("server-seed", "client-seed", 7); a != b {
		t.Fatalf("same inputs gave %d and %d", a, b)
	}
	if a < 0 || a > 9999 {
		t.Fatalf("roll %d out of range", a)
	}
	if DiceRoll("server-seed", "client-seed", 8) == a && DiceRoll("server-seed", "client-seed", 9) == a {
		t.Fatal("nonce does not change the roll")
	}
}

func TestDiceRollDistribution(t *testing.T) {
	under := 0
	const n = 20000
	for i := int64(0); i < n; i++ {
		if DiceRoll("s", "c", i) < 5000 {
			under++
		}
	}
	if share := float64(under) / n; share < 0.48 || share > 0.52 {
		t.Fatalf("share of rolls under 50 = %.3f, want about 0.5", share)
	}
}
