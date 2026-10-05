package payments

import "testing"

// Matches NOWPayments' reference Node code: JSON.stringify(sortObject(body)) signed with HMAC-SHA512.
func TestNPSignatureMatchesReference(t *testing.T) {
	body := `{"payment_status":"finished","order_id":"x/y<z>","price_amount":10,"actually_paid":10.0123,"payment_id":5077125051,"pay_currency":"usdttrc20","fee":{"currency":"usdttrc20","depositFee":0.1},"invoice_id":null,"outcome_amount":9.9}`
	want := "fb9764510c32e474d72d77c86fb448fe6072cda247770435e33d2e71971cf648a74b72090344f0dfb61bea45cecc428ed23db81084ec58564c0320d63e8bc12f"
	got, err := NPSignature("secret", []byte(body))
	if err != nil || got != want {
		t.Fatalf("signature %s (%v), want %s", got, err, want)
	}
}
