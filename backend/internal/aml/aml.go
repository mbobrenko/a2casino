// Package aml screens crypto wallet addresses (KYT) before money leaves the casino.
//
// Checks, from strongest to weakest:
//   - sanctions: the OFAC SDN list of digital currency addresses (a snapshot ships with the
//     binary and is refreshed daily), and Chainalysis' free sanctions API when a key is set;
//   - the staff blacklist / whitelist kept in the back office;
//   - in-house signals: the same address used by several players.
//
// A paid KYT provider (Crystal, Chainalysis KYT, AMLBot, Elliptic) plugs in as another
// Provider to add risk scores for stolen funds, mixers, darknet markets and scams.
package aml

import (
	"bufio"
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Risk levels, ordered.
const (
	Low    = "low"
	Medium = "medium"
	High   = "high"
	Severe = "severe" // sanctioned or blacklisted: never pay out
)

var rank = map[string]int{Low: 0, Medium: 1, High: 2, Severe: 3}

// Max returns the higher of two risk levels.
func Max(a, b string) string {
	if rank[b] > rank[a] {
		return b
	}
	return a
}

type Result struct {
	Risk      string   `json:"risk"`
	Reasons   []string `json:"reasons"`
	Providers []string `json:"providers"`
}

func (r *Result) add(risk, reason, provider string) {
	r.Risk = Max(r.Risk, risk)
	r.Reasons = append(r.Reasons, reason)
	if provider != "" {
		r.Providers = append(r.Providers, provider)
	}
}

// Provider is an external screening service.
type Provider interface {
	Name() string
	Check(ctx context.Context, network, address string) (risk string, reasons []string, err error)
}

type Service struct {
	Pool      *pgxpool.Pool
	Providers []Provider
}

// Normalize makes addresses comparable: EVM addresses are case-insensitive.
func Normalize(addr string) string {
	addr = strings.TrimSpace(addr)
	if strings.HasPrefix(strings.ToLower(addr), "0x") {
		return strings.ToLower(addr)
	}
	return addr
}

// Screen checks an address and logs the result. player and payment may be nil.
func (s *Service) Screen(ctx context.Context, tx pgx.Tx, network, address, where string, player, payment *uuid.UUID) (Result, error) {
	addr := Normalize(address)
	res := Result{Risk: Low, Reasons: []string{}, Providers: []string{"internal"}}
	var list, reason string
	err := tx.QueryRow(ctx, `SELECT list, reason FROM aml_addresses WHERE address=$1`, addr).Scan(&list, &reason)
	switch {
	case err == nil && list == "whitelist":
		res.Reasons = append(res.Reasons, "whitelisted by staff")
	case err == nil && list == "ofac":
		res.add(Severe, "OFAC sanctions list", "ofac")
	case err == nil:
		res.add(Severe, "blacklisted: "+reason, "")
	case err != pgx.ErrNoRows:
		return res, err
	}
	if list != "whitelist" {
		if player != nil {
			var others int
			if err := tx.QueryRow(ctx, `SELECT count(DISTINCT player_id) FROM payments WHERE address=$1 AND player_id<>$2`, address, *player).Scan(&others); err != nil {
				return res, err
			}
			if others > 0 {
				res.add(High, fmt.Sprintf("address also used by %d other player(s)", others), "")
			}
		}
		var flagged int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM aml_screenings WHERE address=$1 AND risk='severe'`, addr).Scan(&flagged); err != nil {
			return res, err
		}
		if flagged > 0 && res.Risk != Severe {
			res.add(High, "address was flagged before", "")
		}
		for _, p := range s.Providers {
			risk, reasons, err := p.Check(ctx, network, address)
			if err != nil {
				// A provider outage must not let money out unchecked: hold for manual review.
				log.Printf("aml %s: %v", p.Name(), err)
				res.add(Medium, p.Name()+" unavailable, check manually", p.Name())
				continue
			}
			res.Providers = append(res.Providers, p.Name())
			if risk != Low {
				for _, r := range reasons {
					res.add(risk, r, "")
				}
			}
		}
	}
	_, err = tx.Exec(ctx, `INSERT INTO aml_screenings (address, network, player_id, payment_id, context, risk, reasons, providers) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		addr, network, player, payment, where, res.Risk, res.Reasons, res.Providers)
	return res, err
}

// ---- OFAC list ----

//go:embed ofac/*.txt
var ofacSnapshot embed.FS

const ofacListURL = "https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_%s.txt"

var ofacCurrencies = []string{"XBT", "ETH", "TRX", "USDT", "USDC", "LTC", "BCH", "XMR", "BSC", "ARB"}

// SyncOFAC loads the bundled snapshot, then tries to refresh it from the published lists.
// Returns the number of sanctioned addresses known.
func (s *Service) SyncOFAC(ctx context.Context, online bool) (int, error) {
	addrs := map[string]string{}
	for _, c := range ofacCurrencies {
		f, err := ofacSnapshot.Open(path.Join("ofac", c+".txt"))
		if err != nil {
			continue
		}
		readList(f, c, addrs)
		f.Close()
		if online {
			if body, err := fetch(ctx, fmt.Sprintf(ofacListURL, c)); err == nil {
				readList(strings.NewReader(body), c, addrs)
			} else {
				log.Printf("aml: ofac %s refresh: %v", c, err)
			}
		}
	}
	list, nets := make([]string, 0, len(addrs)), make([]string, 0, len(addrs))
	for a, n := range addrs {
		list, nets = append(list, a), append(nets, n)
	}
	_, err := s.Pool.Exec(ctx, `INSERT INTO aml_addresses (address, list, network, reason)
		SELECT a, 'ofac', n, 'OFAC SDN' FROM unnest($1::text[], $2::text[]) AS t(a, n)
		ON CONFLICT (address) DO NOTHING`, list, nets)
	return len(addrs), err
}

func readList(r io.Reader, network string, into map[string]string) {
	sc := bufio.NewScanner(r)
	for sc.Scan() {
		if a := Normalize(sc.Text()); a != "" && !strings.HasPrefix(a, "#") {
			into[a] = network
		}
	}
}

var httpClient = &http.Client{Timeout: 20 * time.Second}

func fetch(ctx context.Context, url string) (string, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("status %d", resp.StatusCode)
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	return string(b), err
}

// ---- Chainalysis free sanctions API ----

// Chainalysis checks an address against Chainalysis' sanctions data
// (free key: https://www.chainalysis.com/free-cryptocurrency-sanctions-screening-tools/).
type Chainalysis struct {
	APIKey  string
	BaseURL string
}

func (c Chainalysis) Name() string { return "chainalysis" }

func (c Chainalysis) Check(ctx context.Context, network, address string) (string, []string, error) {
	base := c.BaseURL
	if base == "" {
		base = "https://public.chainalysis.com"
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, base+"/api/v1/address/"+address, nil)
	req.Header.Set("X-API-Key", c.APIKey)
	req.Header.Set("Accept", "application/json")
	resp, err := httpClient.Do(req)
	if err != nil {
		return "", nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	var out struct {
		Identifications []struct {
			Category string `json:"category"`
			Name     string `json:"name"`
		} `json:"identifications"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", nil, err
	}
	if len(out.Identifications) == 0 {
		return Low, nil, nil
	}
	reasons := []string{}
	for _, id := range out.Identifications {
		reasons = append(reasons, "Chainalysis: "+id.Category+" "+id.Name)
	}
	return Severe, reasons, nil
}
