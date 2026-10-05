package payments

// Manual crypto payouts, available in production regardless of DEV_TOOLS.
//
// The player asks for a withdrawal to an address on one of the networks below. Staff approve
// it in the back office (the address is screened again), send the coins themselves from the
// casino's exchange account or hot wallet, and then mark the withdrawal paid with the
// transaction hash. Only then does the money leave the player's locked balance.
//
// Automating the sending step through the NOWPayments mass payouts API is a later step: it
// needs a payout wallet funded in advance and 2FA confirmation of every batch.

import (
	"context"
	"crypto/sha256"
	"errors"
	"math/big"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mbobrenko/a2casino/backend/internal/aml"
	"github.com/mbobrenko/a2casino/backend/internal/httpx"
	"github.com/mbobrenko/a2casino/backend/internal/wallet"
)

// MinWithdrawal applies to every withdrawal a player requests.
const MinWithdrawal = 1000

// PayoutMethods are paid by hand by the finance team (provider "manual").
var PayoutMethods = []Method{
	{Code: "usdt_trc20", Title: "USDT · TRON (TRC-20)", Kind: "crypto", Provider: "manual", Network: "TRC20", Coin: "USDT", MinCents: MinWithdrawal, Withdraw: true},
	{Code: "usdt_erc20", Title: "USDT · Ethereum (ERC-20)", Kind: "crypto", Provider: "manual", Network: "ERC20", Coin: "USDT", MinCents: MinWithdrawal, Withdraw: true},
	{Code: "usdc_erc20", Title: "USDC · Ethereum (ERC-20)", Kind: "crypto", Provider: "manual", Network: "ERC20", Coin: "USDC", MinCents: MinWithdrawal, Withdraw: true},
	{Code: "btc", Title: "Bitcoin (BTC)", Kind: "crypto", Provider: "manual", Network: "BTC", Coin: "BTC", MinCents: MinWithdrawal, Withdraw: true},
	{Code: "eth", Title: "Ether (ETH)", Kind: "crypto", Provider: "manual", Network: "ETH", Coin: "ETH", MinCents: MinWithdrawal, Withdraw: true},
	{Code: "ltc", Title: "Litecoin (LTC)", Kind: "crypto", Provider: "manual", Network: "LTC", Coin: "LTC", MinCents: MinWithdrawal, Withdraw: true},
}

// ---- Address and transaction hash formats ----

var (
	evmAddress = regexp.MustCompile(`^0x[0-9a-fA-F]{40}$`)
	hex64      = regexp.MustCompile(`^[0-9a-f]{64}$`)
	decimalAmt = regexp.MustCompile(`^\d{1,12}(\.\d{1,18})?$`)
)

// NormalizeAddress checks a payout address against the network's format (and its checksum
// where the format has one) and returns it trimmed.
func NormalizeAddress(network, addr string) (string, bool) {
	addr = strings.TrimSpace(addr)
	switch network {
	case "ERC20", "ETH":
		return addr, evmAddress.MatchString(addr)
	case "TRC20":
		v, ok := base58Check(addr)
		return addr, ok && len(addr) == 34 && addr[0] == 'T' && v == 0x41
	case "BTC":
		if strings.HasPrefix(strings.ToLower(addr), "bc1") {
			return strings.ToLower(addr), segwit("bc", addr)
		}
		v, ok := base58Check(addr)
		return addr, ok && (v == 0x00 || v == 0x05)
	case "LTC":
		if strings.HasPrefix(strings.ToLower(addr), "ltc1") {
			return strings.ToLower(addr), segwit("ltc", addr)
		}
		v, ok := base58Check(addr)
		return addr, ok && (v == 0x30 || v == 0x32) // L… and M…
	}
	return addr, false
}

// NormalizeTxHash returns the transaction hash in the form block explorers use:
// 0x + 64 hex for Ethereum, 64 hex for TRON, Bitcoin and Litecoin.
func NormalizeTxHash(network, h string) (string, bool) {
	h = strings.ToLower(strings.TrimSpace(h))
	h = strings.TrimPrefix(h, "0x")
	if !hex64.MatchString(h) {
		return "", false
	}
	if network == "ERC20" || network == "ETH" {
		return "0x" + h, true
	}
	return h, network == "TRC20" || network == "BTC" || network == "LTC"
}

// ExplorerURL links a transaction hash to a public block explorer.
func ExplorerURL(network, hash string) string {
	switch network {
	case "TRC20":
		return "https://tronscan.org/#/transaction/" + hash
	case "ERC20", "ETH":
		return "https://etherscan.io/tx/" + hash
	case "BTC":
		return "https://mempool.space/tx/" + hash
	case "LTC":
		return "https://blockchair.com/litecoin/transaction/" + hash
	}
	return ""
}

const b58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

// base58Check decodes a Base58Check string (25 bytes: version, 20-byte hash, 4-byte checksum)
// and returns the version byte.
func base58Check(s string) (byte, bool) {
	if len(s) < 26 || len(s) > 35 {
		return 0, false
	}
	n := new(big.Int)
	for _, c := range s {
		i := strings.IndexRune(b58Alphabet, c)
		if i < 0 {
			return 0, false
		}
		n.Mul(n, big.NewInt(58)).Add(n, big.NewInt(int64(i)))
	}
	b := n.Bytes()
	for i := 0; i < len(s) && s[i] == '1'; i++ {
		b = append([]byte{0}, b...)
	}
	if len(b) != 25 {
		return 0, false
	}
	h1 := sha256.Sum256(b[:21])
	h2 := sha256.Sum256(h1[:])
	if string(h2[:4]) != string(b[21:]) {
		return 0, false
	}
	return b[0], true
}

// Base58Check encodes a version byte and a 20-byte payload (used by tests to build valid addresses).
func Base58Check(version byte, payload []byte) string {
	b := append([]byte{version}, payload...)
	h1 := sha256.Sum256(b)
	h2 := sha256.Sum256(h1[:])
	b = append(b, h2[:4]...)
	n := new(big.Int).SetBytes(b)
	out := []byte{}
	mod := new(big.Int)
	for n.Sign() > 0 {
		n.DivMod(n, big.NewInt(58), mod)
		out = append([]byte{b58Alphabet[mod.Int64()]}, out...)
	}
	for i := 0; i < len(b) && b[i] == 0; i++ {
		out = append([]byte{'1'}, out...)
	}
	return string(out)
}

// segwit validates a bech32 (witness v0) or bech32m (v1+) address for the given human-readable part.
func segwit(hrp, addr string) bool {
	if addr != strings.ToLower(addr) && addr != strings.ToUpper(addr) {
		return false // mixed case is not allowed
	}
	addr = strings.ToLower(addr)
	pos := strings.LastIndexByte(addr, '1')
	if pos < 1 || addr[:pos] != hrp || len(addr)-pos-1 < 7 || len(addr) > 90 {
		return false
	}
	const charset = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
	data := make([]byte, 0, len(addr)-pos-1)
	for _, c := range addr[pos+1:] {
		i := strings.IndexRune(charset, c)
		if i < 0 {
			return false
		}
		data = append(data, byte(i))
	}
	values := []byte{}
	for _, c := range hrp {
		values = append(values, byte(c)>>5)
	}
	values = append(values, 0)
	for _, c := range hrp {
		values = append(values, byte(c)&31)
	}
	values = append(values, data...)
	chk := uint32(1)
	gen := []uint32{0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3}
	for _, v := range values {
		top := chk >> 25
		chk = (chk&0x1ffffff)<<5 ^ uint32(v)
		for i := 0; i < 5; i++ {
			if (top>>i)&1 == 1 {
				chk ^= gen[i]
			}
		}
	}
	prog := data[:len(data)-6]
	if len(prog) < 1 {
		return false
	}
	version := prog[0]
	switch {
	case version == 0 && chk != 1: // bech32
		return false
	case version > 0 && chk != 0x2bc830a3: // bech32m
		return false
	case version > 16:
		return false
	}
	// The witness program is 5-bit groups; it must regroup into 2..40 bytes (20 or 32 for v0).
	bits := (len(prog) - 1) * 5
	size := bits / 8
	if bits%8 >= 5 || size < 2 || size > 40 || (version == 0 && size != 20 && size != 32) {
		return false
	}
	return true
}

// ---- Shared withdrawal steps ----

// screen checks a payout address in its own transaction, so a sanctioned address leaves a
// trace (log, account flag) even though the request is refused.
func (s *Service) screen(ctx context.Context, m Method, pid, id uuid.UUID, addr string) (aml.Result, error) {
	var res aml.Result
	err := s.Wallet.InTx(ctx, func(tx pgx.Tx) error {
		var err error
		if res, err = s.AML.Screen(ctx, tx, m.Network, addr, "withdrawal", &pid, &id); err != nil {
			return err
		}
		if res.Risk == aml.Severe {
			_, err = tx.Exec(ctx, `UPDATE players SET tags = array_append(array_remove(tags,'aml_review'),'aml_review'), withdrawals_blocked=true WHERE id=$1`, pid)
		}
		return err
	})
	if err == nil && res.Risk == aml.Severe {
		err = httpx.Err(403, "address_blocked", "withdrawals to this address are not allowed; contact support")
	}
	return res, err
}

// hold moves the amount to the locked balance and records the withdrawal as pending.
func (s *Service) hold(ctx context.Context, tx pgx.Tx, id, pid uuid.UUID, m Method, amount int64, addr string, screen aml.Result, createdBy *uuid.UUID) error {
	_, err := s.Wallet.HoldWithdrawal(ctx, tx, pid, amount, "wd:hold:"+id.String(), map[string]any{"payment_id": id, "method": m.Code})
	if errors.Is(err, wallet.ErrInsufficientFunds) {
		return httpx.Err(402, "insufficient_funds", "not enough withdrawable balance")
	}
	if err != nil {
		return err
	}
	var address, network, risk *string
	if m.Kind == "crypto" {
		address, network = &addr, &m.Network
	}
	if screen.Risk != "" {
		risk = &screen.Risk
	}
	if screen.Reasons == nil {
		screen.Reasons = []string{}
	}
	_, err = tx.Exec(ctx, `INSERT INTO payments (id, player_id, direction, method, provider, amount, status, address, network, risk, risk_reasons, created_by)
		VALUES ($1,$2,'withdrawal',$3,$4,$5,'pending',$6,$7,$8,$9,$10)`,
		id, pid, m.Code, m.Provider, amount, address, network, risk, screen.Reasons, createdBy)
	return err
}

// ---- Back office ----

// MarkPaid completes an approved manual payout once staff have sent the coins: the locked
// amount leaves the player's wallet and the transaction hash is stored for the player to see.
func (s *Service) MarkPaid(ctx context.Context, paymentID, staffID uuid.UUID, txHash, cryptoAmount string) (string, error) {
	var hash string
	err := s.Wallet.InTx(ctx, func(tx pgx.Tx) error {
		var pid uuid.UUID
		var amount int64
		var status, provider, method string
		var network *string
		err := tx.QueryRow(ctx, `SELECT player_id, amount, status, provider, method, network FROM payments WHERE id=$1 AND direction='withdrawal' FOR UPDATE`, paymentID).
			Scan(&pid, &amount, &status, &provider, &method, &network)
		if errors.Is(err, pgx.ErrNoRows) {
			return httpx.Err(404, "not_found", "withdrawal not found")
		}
		if err != nil {
			return err
		}
		if provider != "manual" || network == nil {
			return httpx.Err(409, "not_manual", "this withdrawal is not paid by hand")
		}
		if status != "approved" {
			return httpx.Err(409, "not_approved", "only an approved withdrawal can be marked paid (it is "+status+")")
		}
		var ok bool
		if hash, ok = NormalizeTxHash(*network, txHash); !ok {
			return httpx.Err(400, "bad_tx_hash", "not a valid "+*network+" transaction hash")
		}
		var sent *string
		if a := strings.TrimSpace(strings.ReplaceAll(cryptoAmount, ",", ".")); a != "" {
			if !decimalAmt.MatchString(a) || strings.Trim(a, "0.") == "" {
				return httpx.Err(400, "bad_crypto_amount", "crypto amount must be a positive number")
			}
			v := a + " " + coinOf(method)
			sent = &v
		}
		if _, err := s.Wallet.CompleteWithdrawal(ctx, tx, pid, amount, wallet.HouseCryptoClearing, "wd:complete:"+paymentID.String(),
			map[string]any{"payment_id": paymentID, "tx_hash": hash}); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE payments SET status='completed', external_ref=$2, crypto_amount=$3, paid_by=$4, paid_at=now(), updated_at=now() WHERE id=$1`,
			paymentID, hash, sent, staffID)
		if err != nil && strings.Contains(err.Error(), "23505") {
			return httpx.Err(409, "tx_hash_used", "this transaction hash is already recorded for another withdrawal")
		}
		return err
	})
	return hash, err
}

func coinOf(method string) string {
	for _, m := range PayoutMethods {
		if m.Code == method {
			return m.Coin
		}
	}
	return strings.ToUpper(method)
}

// StaffPayout creates a withdrawal of a blocked or self-excluded player's real balance to an
// address given by staff. It goes through the same screening, approval and mark-paid steps.
// amount 0 means the whole real balance.
func (s *Service) StaffPayout(ctx context.Context, staffID, pid uuid.UUID, method string, amount int64, address string) (uuid.UUID, aml.Result, error) {
	id := uuid.New()
	m, ok := s.methodBy(method, "withdraw")
	if !ok || m.Kind != "crypto" {
		return id, aml.Result{}, httpx.Err(400, "unknown_method", "choose a crypto payout method")
	}
	addr, ok := NormalizeAddress(m.Network, address)
	if !ok {
		return id, aml.Result{}, httpx.Err(400, "bad_address", "not a valid "+m.Network+" address")
	}
	var status string
	if err := s.Wallet.Pool.QueryRow(ctx, `SELECT status FROM players WHERE id=$1`, pid).Scan(&status); err != nil {
		return id, aml.Result{}, httpx.Err(404, "not_found", "player not found")
	}
	if status == "active" {
		return id, aml.Result{}, httpx.Err(409, "player_active", "an active player requests withdrawals from the wallet; this payout is for blocked or self-excluded accounts")
	}
	if amount < 0 {
		return id, aml.Result{}, httpx.Err(400, "bad_amount", "amount must be positive")
	}
	res, err := s.screen(ctx, m, pid, id, addr)
	if err != nil {
		return id, res, err
	}
	err = s.Wallet.InTx(ctx, func(tx pgx.Tx) error {
		if active, err := s.Promo.HasActive(ctx, tx, pid); err != nil {
			return err
		} else if active {
			return httpx.Err(409, "bonus_active", "cancel the player's active bonus first")
		}
		if amount == 0 {
			b, err := s.Wallet.Balances(ctx, tx, pid)
			if err != nil {
				return err
			}
			amount = b.Real
		}
		if amount <= 0 {
			return httpx.Err(409, "nothing_to_pay", "the player has no real balance")
		}
		return s.hold(ctx, tx, id, pid, m, amount, addr, res, &staffID)
	})
	return id, res, err
}
