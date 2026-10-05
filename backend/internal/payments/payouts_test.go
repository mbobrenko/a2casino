package payments

import (
	"strings"
	"testing"
)

func TestNormalizeAddress(t *testing.T) {
	ltcLegacy := Base58Check(0x30, []byte("01234567890123456789"))
	ltcP2SH := Base58Check(0x32, []byte("01234567890123456789"))
	valid := map[string][]string{
		"TRC20": {"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", "TA3rH2A7iHnm6pKH8gr9cK1EZnShnmZdFg", " TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t "},
		"ERC20": {"0xdAC17F958D2ee523a2206206994597C13D831ec7", "0x0000000000000000000000000000000000000000"},
		"ETH":   {"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"},
		"BTC": {"1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
			"BC1QAR0SRRR7XFKVY5L643LYDNW9RE59GTZZWF5MDQ", "bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7kt5nd6y"},
		"LTC": {ltcLegacy, ltcP2SH, "ltc1qqqqsyqcyq5rqwzqfpg9scrgwpugpzysn3s44dy"},
	}
	for network, list := range valid {
		for _, a := range list {
			if _, ok := NormalizeAddress(network, a); !ok {
				t.Errorf("%s %q rejected", network, a)
			}
		}
	}
	if !strings.HasPrefix(ltcLegacy, "L") || !strings.HasPrefix(ltcP2SH, "M") {
		t.Errorf("ltc prefixes: %s %s", ltcLegacy, ltcP2SH)
	}
	invalid := map[string][]string{
		"TRC20": {"TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "T" + strings.Repeat("0", 33), "0xdAC17F958D2ee523a2206206994597C13D831ec7"},
		"ERC20": {"dAC17F958D2ee523a2206206994597C13D831ec7", "0xdAC17F958D2ee523a2206206994597C13D831ec", "0xZZC17F958D2ee523a2206206994597C13D831ec7"},
		"BTC": {"1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdr", "bc1qAr0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
			"tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", "ltc1qqqqsyqcyq5rqwzqfpg9scrgwpugpzysn3s44dy"},
		"LTC": {"1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "ltc1qqqqsyqcyq5rqwzqfpg9scrgwpugpzysn3s44dz", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"},
		"XRP": {"rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh"},
	}
	for network, list := range invalid {
		for _, a := range list {
			if _, ok := NormalizeAddress(network, a); ok {
				t.Errorf("%s %q accepted", network, a)
			}
		}
	}
}

func TestNormalizeTxHash(t *testing.T) {
	h := strings.Repeat("ab", 32)
	cases := []struct {
		network, in, want string
		ok                bool
	}{
		{"ERC20", "0x" + strings.ToUpper(h), "0x" + h, true},
		{"ETH", h, "0x" + h, true},
		{"TRC20", h, h, true},
		{"BTC", " 0x" + h + " ", h, true},
		{"LTC", h, h, true},
		{"BTC", h[:63], "", false},
		{"TRC20", h[:62] + "zz", "", false},
		{"XRP", h, "", false},
	}
	for _, c := range cases {
		got, ok := NormalizeTxHash(c.network, c.in)
		if ok != c.ok || (ok && got != c.want) {
			t.Errorf("%s %q = %q %v, want %q %v", c.network, c.in, got, ok, c.want, c.ok)
		}
	}
	if u := ExplorerURL("LTC", h); u != "https://blockchair.com/litecoin/transaction/"+h {
		t.Errorf("ltc explorer: %s", u)
	}
}
