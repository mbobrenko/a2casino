# A2Casino — back office

Staff web app for A2Casino: dashboard, player search, player card (balances, stats, bet log,
payments, ledger, audit, staff actions) and the withdrawal queue. Interface in Russian.

Next.js 16 (App Router) + React 19 + TypeScript, plain CSS (`app/globals.css`). All pages are
client components that call the Go API (`/api/bo/*`, see `../docs/API.md`) with `fetch`.

## Run locally

```bash
npm install
npm run dev            # http://localhost:3001
# or
npm run build && npm start
```

API base URL: `NEXT_PUBLIC_API_URL` (default `http://localhost:8080`). It is inlined at build
time, so set it before `next build`. The API must allow CORS from the back-office origin.

Login: `admin@a2casino.local` / `admin12345` (seed admin). The staff token is kept in
`localStorage`; any 401 clears it and redirects to `/login`.

## Pages

| Path | What |
| --- | --- |
| `/login` | Staff login |
| `/` | Dashboard tiles (`/api/bo/dashboard`) |
| `/players` | Search by email / id / tag, paginated table; row → card |
| `/players/[id]` | Player card: header, balances, stats, tabs «Ставки» / «Платежи» / «Транзакции» / «Аудит», actions (block, verification, withdrawals block, tags, balance adjustment). Every action requires a comment. |
| `/withdrawals` | Withdrawal queue by status with anti-fraud columns; approve / reject |

Money comes from the API in integer cents and is shown as `$1,234.56`. In the balance
adjustment form the amount is entered in dollars with a sign (`-5.25`) and sent as cents.

## Docker

```bash
docker build --build-arg NEXT_PUBLIC_API_URL=https://api.example.com -t a2casino-backoffice .
docker run -p 3001:3001 a2casino-backoffice
```

The image uses Next's `output: "standalone"` build and runs `node server.js` on port 3001.
(`next start` still works locally but prints a warning about the standalone output.)

## Layout

```
app/            routes (layout, login, dashboard, players, players/[id], withdrawals) + globals.css
components/     Shell (sidebar + auth guard), ActionModal (comment-required confirm), Badge, Tile
lib/            api.ts (fetch wrapper, token, 401 handling), format.ts (money/dates/labels), types.ts
```
