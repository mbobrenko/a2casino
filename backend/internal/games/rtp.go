package games

// Configurable RTP of the A2 Originals. B2B buyers (casinos, aggregators) need a specific return,
// so each original can run at one of a fixed list of certified versions (RTPPresets). The RTP is
// set per game in the back office (games.rtp, admin only, audited); it is the same for every player
// and never changes dynamically. A change applies to new bets only: every round records the RTP it
// was played at (details.rtp, mines_rounds.rtp), and the player can verify it with that RTP.
//
// With R = rtp / 100:
//
//	Dice:   multiplier = R × 100 / target
//	Crash:  crash = max(1.00, floor(R × 100 × E / (E − H)) / 100), so P(crash ≥ m) = R / m
//	Mines:  multiplier = R × C(25, n) / C(25 − mines, n)
//	Plinko: the 99% tables reshaped to R (see plinko_tables.go)

import "slices"

// RTPPresets are the RTP versions an original can be offered at, in percent.
var RTPPresets = []int{90, 92, 94, 95, 96, 97, 98, 99}

// DefaultRTP is the RTP of every original unless an operator picks another preset.
const DefaultRTP = 99

// DefaultMaxWin is the default cap on the win of a single originals bet, in cents ($10,000).
const DefaultMaxWin = 1000000

// ValidRTP reports whether rtp (percent) is one of the presets.
func ValidRTP(rtp int) bool { return slices.Contains(RTPPresets, rtp) }

// capWin limits a payout to the game's max win per bet (maxWin ≤ 0 means no cap).
func capWin(win, maxWin int64) (int64, bool) {
	if maxWin > 0 && win > maxWin {
		return maxWin, true
	}
	return win, false
}
