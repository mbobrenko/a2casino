# Casinos Confiables LATAM (affiliate review site)

Static casino-review site in Spanish (Latin America) for affiliate revenue share.
Next.js 16 App Router + React 19 + TypeScript + plain CSS, exported as plain HTML (`output: "export"`),
deployed as the free Render static site `a2casino-mb-reviews` (see `../render.yaml`).

```bash
cd affiliate
npm install
npm run dev          # http://localhost:3400
npm run build        # writes the static site to out/
npx serve out -l 3400   # or: python3 -m http.server 3400 -d out
```

## Environment variables (build time)

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3400` | Canonical URLs, Open Graph, hreflang, sitemap.xml, robots.txt. Set to the public domain (no trailing slash). |
| `NEXT_PUBLIC_AFF_SUBID` | `a2mb` | Sub-ID appended to every affiliate link. The placement is appended: `a2mb-home`, `a2mb-review`, `a2mb-bonos`, `a2mb-pais`. |
| `NEXT_PUBLIC_CLICK_API` | empty | Optional. If set, `/ir/<slug>/` sends a `navigator.sendBeacon` POST (text/plain JSON: `slug, placement, subid, referrer, ts`) to this URL before redirecting. No backend is included. |
| `NEXT_PUBLIC_CONTACT_EMAIL` | `contacto@example.com` | Shown on Sobre nosotros, Aviso legal, Privacidad. **Change it.** |

Static export: env vars are baked in at build time. Change them in Render, then redeploy.

## Structure

```
data/casinos.ts     ALL casino data (one typed array) + rating criteria/weights + helpers
data/guides.ts      the 5 guides (Markdown subset, rendered by components/Prose.tsx)
app/                pages: / , /casinos/[slug], /bonos, /guias, /guias/[slug], /mexico, /chile, /peru,
                    /ir/[slug] (affiliate redirect), /sobre-nosotros, /aviso-legal, /privacidad,
                    /juego-responsable, sitemap.ts, robots.ts
lib/site.ts         site name, env config, nav
lib/affiliate.ts    sub-ID and outgoing-URL logic
lib/seo.ts          per-page metadata (canonical, hreflang es, Open Graph) and JSON-LD helper
public/             favicon.svg, og.png (1200x630 share image), logos you add
```

## Cómo añadir un casino real

The site currently ships **five fictional entries** (`Casino Ejemplo 1…5`, `sample: true`). They show a
yellow "Ejemplo — reemplazar con datos reales" badge and link to example.com. Replace them before
promoting the site.

1. **Join the casino's affiliate programme** and get your tracking link from its affiliate dashboard.
   Check in the programme terms which countries you are allowed to promote it in.
2. **Open `data/casinos.ts`**, copy an existing entry and edit it:

   | Field | What to put | Where to verify it |
   |---|---|---|
   | `slug` | lowercase-with-hyphens, e.g. `"micasino"`. Becomes `/casinos/micasino/` and `/ir/micasino/`. Never change it once published. | — |
   | `name` | Brand name. | Casino site |
   | `sample` | **Delete the line** (or set `false`). This removes the badge. | — |
   | `logo`, `logoBg` | An emoji, or put the official logo (from the affiliate dashboard's media kit) in `public/logos/micasino.svg` and set `logo: "/logos/micasino.svg"`. | Affiliate media kit |
   | `affiliateUrl` | Your tracking link. **This is the only place the link lives.** If the programme has a sub-ID parameter, either put `{subid}` where the value goes (`https://track.example/?a=123&sub={subid}`) or set `subidParam` (e.g. `"var1"`, `"payload"`, `"subid"`). | Affiliate dashboard |
   | `established` | Year it started operating. | Terms / About page |
   | `licence`, `licenceNumber`, `licenceUrl`, `operator` | Regulator, licence number, link to the regulator's public register page, operating company. | Click the licence seal in the casino footer; it must open the regulator's domain. Check the company name matches the T&C. |
   | `countries` | `"mx" \| "cl" \| "pe" \| "ca"` it **accepts** and you may promote. Controls the country pages and the country filter. | Casino's restricted-countries list + affiliate programme terms |
   | `minDeposit`, `withdrawalTime`, `paymentMethods`, `crypto` | As text, with currency and network (`"USDT (TRC-20)"`). | Cashier / payments page; ideally test a deposit and withdrawal |
   | `gamesCount`, `providers`, `support` | Approximate figures and channels. | Lobby, chat test |
   | `bonus.*` | `headline`, `wagering` **exactly as in the bonus T&C** (say if it is on bonus or deposit+bonus), `minDeposit`, `freeSpins`, `noDeposit`, `code`, `terms` (max bet, expiry, max cashout). `noDeposit` / `freeSpins` / `crypto` drive the /bonos filters. | Bonus terms page |
   | `ratings` | 0–10 per criterion. Overall = weighted average using `CRITERIA` (25/20/20/15/10/10). Score honestly with the method on /sobre-nosotros. | Your review |
   | `pros`, `cons`, `summary`, `sections`, `faq` | Your own original text. Each `sections.*` string is one paragraph. `faq` also becomes FAQPage JSON-LD. | — |
   | `lastVerified` | `YYYY-MM-DD` of your check. Shown on the review. Re-check at least every few months. | — |

3. **Never copy unverified numbers** (bonus amounts, withdrawal times) from other review sites; casinos
   change terms often. Keep screenshots of the terms page with the date in case of disputes.
4. `npm run build` (it fails on any missing/typo'd field), check the page locally, commit, push.
   Render rebuilds automatically.
5. When all sample entries are gone, the "Ejemplo" notices disappear by themselves.

To change a link later, edit only `affiliateUrl`: every button points at `/ir/<slug>/`, which builds
the final URL. To remove a casino, delete its entry (its review and `/ir/` page disappear on the next build).

## Affiliate redirect (`/ir/<slug>/`)

Every CTA links to `/ir/<slug>/?p=<placement>` with `rel="nofollow sponsored"`. The page (noindex,
disallowed in robots.txt) runs JS that builds the URL with the sub-ID, fires the optional beacon and
calls `location.replace`. Without JS a `<meta http-equiv="refresh">` (2 s) and a visible link use the
default sub-ID.

## Compliance notes

- Footer on every page: 18+, link to Juego responsable, affiliate disclosure.
- Country pages make no legal claims beyond "verifica la normativa local". Before promoting in a
  country, check yourself that the operator and the affiliate programme allow traffic from it and
  that affiliate marketing for gambling is permitted there.
- The site sets no cookies; the cookie notice only stores its dismissal in localStorage. If you add
  analytics, update `/privacidad` and the notice.
