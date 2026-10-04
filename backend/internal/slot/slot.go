// Package slot holds the demo slot maths shared by the mock provider and server-side free spins.
package slot

import (
	"crypto/rand"
	"encoding/binary"
)

// Paytable: multiplier -> probability (per 10_000). Expected return ~96.5%.
var Paytable = []struct {
	Mult float64
	P    int
}{
	{100, 4}, {20, 120}, {5, 600}, {2, 800}, {1.5, 1000}, {0.5, 1500},
}

// Spin returns the win multiplier of one spin (0 = no win).
func Spin() float64 {
	var b [4]byte
	_, _ = rand.Read(b[:])
	x := int(binary.BigEndian.Uint32(b[:]) % 10000)
	acc := 0
	for _, row := range Paytable {
		acc += row.P
		if x < acc {
			return row.Mult
		}
	}
	return 0
}
