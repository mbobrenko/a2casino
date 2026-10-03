// k6 load test for the hot path: provider bet/win callbacks against the wallet.
// Run: k6 run -e API=http://localhost:8080 loadtest/wallet.js
// setup() registers PLAYERS players and funds them through the mock PSP webhook; each iteration is one bet + win.
// Needs AUTH_RATE_LIMIT=0 on the API (registration is rate limited per IP).
import http from "k6/http";
import crypto from "k6/crypto";
import { check } from "k6";

const API = __ENV.API || "http://localhost:8080";
const PROVIDER_SECRET = __ENV.MOCK_PROVIDER_SECRET || "mock-provider-secret";
const PSP_SECRET = __ENV.PSP_WEBHOOK_SECRET || "mock-psp-secret";

export const options = {
  scenarios: {
    rounds: { executor: "constant-arrival-rate", rate: Number(__ENV.RPS || 2000), timeUnit: "1s",
      duration: __ENV.DURATION || "1m", preAllocatedVUs: 200, maxVUs: 1000 },
  },
  thresholds: { http_req_failed: ["rate<0.01"], http_req_duration: ["p(99)<100"] },
};

const json = { headers: { "Content-Type": "application/json", "X-Country": "CL" } };
function signed(path, secret, body) {
  const s = JSON.stringify(body);
  return http.post(API + path, s, { headers: { "Content-Type": "application/json", "X-Signature": crypto.hmac("sha256", secret, s, "hex") } });
}

// Registration (bcrypt) is deliberately slow, so players are created once up front and shared by VUs.
export function setup() {
  const players = [];
  for (let i = 0; i < Number(__ENV.PLAYERS || 100); i++) {
    const email = `lt-${Date.now()}-${i}@load.test`;
    const reg = http.post(API + "/api/auth/register", JSON.stringify({ email, password: "loadtest123", country: "CL", birth_date: "1990-01-01" }), json);
    const auth = { headers: { ...json.headers, Authorization: `Bearer ${reg.json("token")}` } };
    const pid = http.post(API + "/api/payments/deposit", JSON.stringify({ method: "card_mock", amount: 100000000 }), auth).json("payment_id");
    signed("/api/webhooks/mockpsp", PSP_SECRET, { payment_id: pid, status: "success", psp_ref: "lt-" + pid });
    const url = http.post(API + "/api/games/mock-fruit-slot/launch", "{}", auth).json("url");
    players.push(url.match(/token=([^&]+)/)[1]);
  }
  return { players };
}

let n = 0;
export default function (data) {
  const token = data.players[__VU % data.players.length];
  const round = `lt-${__VU}-${n++}-${Date.now()}`;
  const bet = signed("/api/provider/mock/bet", PROVIDER_SECRET, { token, round_id: round, tx_id: "b-" + round, amount: 100 });
  check(bet, { "bet 200": (r) => r.status === 200 });
  const win = signed("/api/provider/mock/win", PROVIDER_SECRET, { token, round_id: round, tx_id: "w-" + round, amount: Math.random() < 0.4 ? 200 : 0 });
  check(win, { "win 200": (r) => r.status === 200 });
}
