package kyc

import "testing"

func TestSniff(t *testing.T) {
	cases := map[string]string{
		"\xFF\xD8\xFF\xE0rest":   "image/jpeg",
		"\x89PNG\r\n\x1A\nrest":  "image/png",
		"%PDF-1.7\n":             "application/pdf",
		"GIF89a":                 "",
		"<svg xmlns=...>":        "",
		"\x89PNG but not really": "",
		"":                       "",
	}
	for in, want := range cases {
		if got, _ := sniff([]byte(in)); got != want {
			t.Errorf("sniff(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestRequired(t *testing.T) {
	if r := required([]Document{{Kind: "id_front", IDType: "passport"}}); len(r) != 3 {
		t.Errorf("passport: %v", r)
	}
	if r := required([]Document{{Kind: "id_front", IDType: "id_card"}}); len(r) != 4 {
		t.Errorf("id card: %v", r)
	}
	cur := []Document{{Kind: "id_front", Status: "approved"}, {Kind: "address", Status: "rejected"}, {Kind: "selfie", Status: "pending"}}
	if m := missing([]string{"id_front", "id_back", "address", "selfie"}, cur, "pending", "approved"); len(m) != 2 || m[0] != "id_back" || m[1] != "address" {
		t.Errorf("missing: %v", m)
	}
}
