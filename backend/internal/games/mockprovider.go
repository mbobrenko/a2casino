package games

// The mock provider stands in for an external game provider or aggregator.
// It serves a tiny game page and, on each spin, calls the casino's seamless-wallet
// callbacks over HTTP with an HMAC signature, exactly as a real provider would.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"net/http"

	"github.com/mbobrenko/a2casino/backend/internal/httpx"
	"github.com/mbobrenko/a2casino/backend/internal/slot"
)

var gamePage = template.Must(template.New("g").Parse(`<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Mock game</title>
<style>body{font-family:system-ui;background:#14121f;color:#f3f0ff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0}
.reel{font-size:64px;letter-spacing:12px;margin:16px}button{font-size:18px;padding:10px 28px;border-radius:8px;border:0;background:#7c5cff;color:#fff;cursor:pointer}
input{font-size:16px;width:90px;padding:6px;border-radius:6px;border:1px solid #555;background:#221f33;color:#fff}.muted{color:#a9a3c7}</style></head>
<body><div class="muted">Mock provider · seamless wallet demo</div><div class="reel" id="reel">🍒🍋🍉</div>
<div>Bet, $ <input id="bet" type="number" min="0.1" step="0.1" value="1"> <button id="spin">Spin</button></div>
<p id="msg" class="muted">Balance: …</p>
<script>
const token={{.}};
const icons=["🍒","🍋","🍉","⭐","💎","7️⃣"];
async function call(path,body){const r=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});return r.json();}
call("/mockprovider/balance",{token}).then(d=>msg.textContent=d.error?d.error:"Balance: $"+(d.balance/100).toFixed(2));
spin.onclick=async()=>{spin.disabled=true;reel.textContent=[0,0,0].map(()=>icons[Math.floor(Math.random()*icons.length)]).join("");
const d=await call("/mockprovider/spin",{token,bet:Math.round(parseFloat(bet.value)*100)});
msg.textContent=d.error?d.error:(d.win>0?"Win $"+(d.win/100).toFixed(2)+" (x"+d.multiplier+") · ":"No win · ")+"Balance: $"+(d.balance/100).toFixed(2);
parent.postMessage({type:"balance"},"*");spin.disabled=false;};
</script></body></html>`))

func (s *Service) MockGamePage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_ = gamePage.Execute(w, r.URL.Query().Get("token"))
}

func (s *Service) callCasino(path string, payload any) (map[string]any, int, error) {
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest(http.MethodPost, s.Cfg.CallbackURL+path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Signature", Sign(s.Cfg.MockProviderSecret, body))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return out, resp.StatusCode, nil
}

func (s *Service) MockBalance(w http.ResponseWriter, r *http.Request) error {
	var req struct{ Token string }
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	out, code, err := s.callCasino("/api/provider/mock/balance", map[string]any{"token": req.Token})
	if err != nil {
		return err
	}
	if code != 200 {
		httpx.JSON(w, 200, map[string]any{"error": out["message"]})
		return nil
	}
	httpx.JSON(w, 200, out)
	return nil
}

func (s *Service) MockSpin(w http.ResponseWriter, r *http.Request) error {
	var req struct {
		Token string
		Bet   int64
	}
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if req.Bet <= 0 {
		httpx.JSON(w, 200, map[string]any{"error": "bet must be positive"})
		return nil
	}
	round := randomHex(8)
	out, code, err := s.callCasino("/api/provider/mock/bet", map[string]any{"token": req.Token, "round_id": round, "tx_id": "b-" + round, "amount": req.Bet})
	if err != nil {
		return err
	}
	if code != 200 {
		httpx.JSON(w, 200, map[string]any{"error": out["message"]})
		return nil
	}
	mult := slot.Spin()
	win := int64(float64(req.Bet) * mult)
	out, code, err = s.callCasino("/api/provider/mock/win", map[string]any{"token": req.Token, "round_id": round, "tx_id": "w-" + round, "amount": win})
	if err != nil {
		return err
	}
	if code != 200 {
		return fmt.Errorf("win callback failed: %v", out)
	}
	httpx.JSON(w, 200, map[string]any{"round_id": round, "multiplier": mult, "win": win, "balance": out["balance"]})
	return nil
}
