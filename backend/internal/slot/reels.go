package slot

// Symbol layout for the demo slot's 5×3 reels. The spin outcome is still the multiplier drawn by
// Spin (the paytable above sets the RTP); Layout only builds a reel window whose line wins add up
// to exactly that multiplier, so the game can show it. It never changes the payout.

import (
	"math"
	"math/rand/v2"
)

// Symbols, lowest to highest.
var Symbols = []string{"10", "J", "Q", "K", "A", "ankh", "scarab", "eye", "anubis", "pharaoh", "book"}

// fill weights: low symbols appear more often, like on real reels.
var weights = []int{14, 14, 12, 12, 11, 8, 8, 6, 6, 4, 4}

// LinePays: symbol -> pay for 3, 4 and 5 of a kind, in multiples of the total bet.
var LinePays = map[string][3]float64{
	"10": {0.5, 1.5, 5}, "J": {0.5, 1.5, 5},
	"Q": {0.5, 2, 5}, "K": {0.5, 2, 5}, "A": {0.5, 2, 5},
	"ankh": {1.5, 5, 20}, "scarab": {1.5, 5, 20},
	"eye": {2, 5, 20}, "anubis": {2, 5, 20},
	"pharaoh": {5, 20, 100}, "book": {5, 20, 100},
}

// Lines are the 10 paylines: the row (0 = top) on each of the 5 reels.
var Lines = [][5]int{
	{1, 1, 1, 1, 1}, {0, 0, 0, 0, 0}, {2, 2, 2, 2, 2}, {0, 1, 2, 1, 0}, {2, 1, 0, 1, 2},
	{0, 0, 1, 2, 2}, {2, 2, 1, 0, 0}, {1, 0, 0, 0, 1}, {1, 2, 2, 2, 1}, {0, 1, 1, 1, 0},
}

// Grid is the reel window: Grid[reel][row].
type Grid [5][3]string

// LineWin is a winning payline: Count symbols from the left reel.
type LineWin struct {
	Line   int     `json:"line"` // index into Lines
	Symbol string  `json:"symbol"`
	Count  int     `json:"count"`
	Pay    float64 `json:"pay"` // multiple of the total bet
}

// Evaluate returns the line wins of a window (left to right, 3+ of a kind, no wilds).
func Evaluate(g Grid) []LineWin {
	var wins []LineWin
	for i, l := range Lines {
		s := g[0][l[0]]
		n := 1
		for n < 5 && g[n][l[n]] == s {
			n++
		}
		if n >= 3 {
			wins = append(wins, LineWin{Line: i, Symbol: s, Count: n, Pay: LinePays[s][n-3]})
		}
	}
	return wins
}

// Total adds up the pays of the wins.
func Total(wins []LineWin) float64 {
	t := 0.0
	for _, w := range wins {
		t += w.Pay
	}
	return t
}

type combo struct {
	sym string
	n   int
}

// combos lists every single-line win paying exactly mult.
func combos(mult float64) []combo {
	var out []combo
	for _, s := range Symbols {
		for k, p := range LinePays[s] {
			if math.Abs(p-mult) < 1e-9 {
				out = append(out, combo{s, k + 3})
			}
		}
	}
	return out
}

func randomSymbol(r *rand.Rand) string {
	total := 0
	for _, w := range weights {
		total += w
	}
	x := r.IntN(total)
	for i, w := range weights {
		if x < w {
			return Symbols[i]
		}
		x -= w
	}
	return Symbols[0]
}

// Layout builds a window whose line wins pay exactly mult (one winning line for a win, none for
// mult = 0). Every multiplier in Paytable has a matching line win.
func Layout(mult float64) (Grid, []LineWin) {
	r := rand.New(rand.NewPCG(rand.Uint64(), rand.Uint64()))
	cs := combos(mult)
	for attempt := 0; attempt < 400; attempt++ {
		var g Grid
		for reel := range g {
			for row := range g[reel] {
				g[reel][row] = randomSymbol(r)
			}
		}
		if mult > 0 && len(cs) > 0 {
			c := cs[r.IntN(len(cs))]
			l := Lines[r.IntN(len(Lines))]
			for reel := 0; reel < c.n; reel++ {
				g[reel][l[reel]] = c.sym
			}
			if c.n < 5 && g[c.n][l[c.n]] == c.sym {
				continue
			}
		}
		wins := Evaluate(g)
		if math.Abs(Total(wins)-mult) < 1e-9 && (mult == 0 || len(wins) == 1) {
			return g, wins
		}
	}
	return fallback(mult, cs)
}

// fallback searches deterministic windows (a rotating filler plus the win on one line) for one
// that pays exactly mult; Layout's random search practically always succeeds first.
func fallback(mult float64, cs []combo) (Grid, []LineWin) {
	var last Grid
	for off := 0; off < len(Symbols); off++ {
		var g Grid
		for reel := range g {
			for row := range g[reel] {
				g[reel][row] = Symbols[(reel*3+row+off)%len(Symbols)]
			}
		}
		if mult == 0 || len(cs) == 0 {
			if len(Evaluate(g)) == 0 {
				return g, nil
			}
			continue
		}
		for _, c := range cs {
			for _, l := range Lines {
				w := g
				for reel := 0; reel < c.n; reel++ {
					w[reel][l[reel]] = c.sym
				}
				wins := Evaluate(w)
				if len(wins) == 1 && math.Abs(wins[0].Pay-mult) < 1e-9 {
					return w, wins
				}
				last = w
			}
		}
	}
	return last, Evaluate(last)
}
