# Marketplace smoke tests

End-to-end checks that run **against a live server** (dev or production build) and touch only the
HTTP API — the same calls the browser makes. They need no test framework: `bash` + `python3`.

```bash
# 1. run the app
npm run build && node dist/.next/standalone/server.js       # or: npm run dev
# (env: ADMIN_EMAIL, ADMIN_PASSWORD, AUTH_SECRET — see .env.example)

# 2. seed a local artist account so the artist flows can be exercised
DATA=dist/.next/standalone/data node scripts/marketplace-smoke/seed-artist-user.mjs

# 2b. (optional) fill an empty store with two complete, sellable works, so the
#     dashboard/storefront/buyer flow have something real to show — real files,
#     uploaded through the real APIs, approved and priced
node scripts/marketplace-smoke/mkformats.mjs /tmp/fmt
DATA=dist/.next/standalone/data node scripts/marketplace-smoke/seed-demo-works.mjs

# 3. run the checks (BASE defaults to http://localhost:3000,
#    DATA defaults to dist/.next/standalone/data)
bash scripts/marketplace-smoke/http-e2e.sh        # upload → review → buy → download → certificate
bash scripts/marketplace-smoke/exclusive-e2e.sh   # exclusive sale delists, refund relists
bash scripts/marketplace-smoke/artist-e2e.sh      # artist studio: prices, sale, payout, coupon
bash scripts/marketplace-smoke/sub-e2e.sh         # download pass, covered download, cancel
bash scripts/marketplace-smoke/family-e2e.sh      # product families: shop grouping, sidebar tree, ?family=
bash scripts/marketplace-smoke/formats-e2e.sh     # colourways + PNG/JPG/preview/AI/PSD/SVG/EPS delivery
bash scripts/marketplace-smoke/artist-dashboard-e2e.sh   # buyer/seller signup split + artist dashboard
bash scripts/marketplace-smoke/pages.sh           # every storefront/admin page renders
DATA=dist/.next/standalone/data \
MARKETPLACE_MULTIPART_THRESHOLD_MB=5 \
bash scripts/marketplace-smoke/multipart-e2e.sh   # 12 MB master uploaded in 8 MB chunks
```

Notes:

- `multipart-e2e.sh` is the only one that needs a specific server setting: start the app with
  `MARKETPLACE_MULTIPART_THRESHOLD_MB` below the size of the master it generates (12 MB), otherwise the
  upload takes the single-request path. It checks that the assembled master and the delivered download are
  both byte-identical to the source and that the staging chunks are deleted.
- `family-e2e.sh` is the taxonomy rig: it asserts the canonical family order in `/shop`, the eight
  nested sub-categories under «الگو» in the sidebar, `?family=<slug>` / `?family=other` isolation,
  that `?category=` still filters, and that the upload session rejects a missing/unknown `familyId`.
  It deletes the asset it uploads, so it can be re-run without polluting the store.
- `formats-e2e.sh` uploads one design in **two colourways with all seven formats** (`mkformats.mjs`
  builds the real files with `sharp`/`pdf-lib`), checks the refusal paths (`invalid_format`,
  `unsupported_type`, `raster_required`, `invalid_signature`), publishes it, buys it once and downloads
  all twelve deliverables — each must be byte-identical to what the artist uploaded.
- `artist-dashboard-e2e.sh` is the registration rig: it asserts `/signup` is the chooser (both account
  types as a real radio choice, one page each), that the buyer page (`/signup/buyer`) keeps its four
  fields and the switch, that the artist page (`/signup/artist`) keeps its sell-side content and serves
  the seller form as one single page — the account fields required, the studio block (studio,
  experience, bio, formats, families, terms) optional and no step wizard left — that the old
  `/creators/join` path 307s to the artist page, that `POST /api/auth/signup` really stores
  that file on the Artist record when it is filled in and invents nothing when it is not (and that the
  same e-mail cannot register twice), that the admin sees it, and that `/artist` is the dashboard
  (signed-out redirect, buyer upsell, artist KPIs/works/delivery/wallet) while `/artist/portfolio` still
  serves the portfolio manager. It creates and deletes its own accounts. **Note:** the signup endpoint
  throttles by IP (5 attempts/hour, in-process), so a repeated run in the same server process reports
  the throttled checks as skips instead of passes, and a run that cannot register at all exits with
  code **2** and tells you to restart the server (or wait), so a green run always means "verified".
- The scripts print each step; `http-e2e.sh` also asserts that the downloaded bytes are byte-identical
  to the uploaded master and that a tampered token is rejected.
- They write to the app's local storage backend (`data/objects` and `data/mk-*.json`). Point `DATA` at
  the directory your server writes to — `dist/.next/standalone/data` when running the standalone build.
- The uploaded masters come from `mktile.py` (a genuinely tileable pattern, so the seamless detector
  can pass) and `mkpng.py` (a non-tileable gradient, used to prove the detector can fail).
