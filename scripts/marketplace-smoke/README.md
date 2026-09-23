# Marketplace smoke tests

End-to-end checks that run **against a live server** (dev or production build) and touch only the
HTTP API — the same calls the browser makes. They need no test framework: `bash` + `python3`.

```bash
# 1. run the app
npm run build && node dist/.next/standalone/server.js       # or: npm run dev
# (env: ADMIN_EMAIL, ADMIN_PASSWORD, AUTH_SECRET — see .env.example)

# 2. seed a local artist account so the artist flows can be exercised
node scripts/marketplace-smoke/seed-artist-user.mjs

# 3. run the checks (BASE defaults to http://localhost:3000,
#    DATA defaults to dist/.next/standalone/data)
bash scripts/marketplace-smoke/http-e2e.sh        # upload → review → buy → download → certificate
bash scripts/marketplace-smoke/exclusive-e2e.sh   # exclusive sale delists, refund relists
bash scripts/marketplace-smoke/artist-e2e.sh      # artist studio: prices, sale, payout, coupon
bash scripts/marketplace-smoke/sub-e2e.sh         # download pass, covered download, cancel
bash scripts/marketplace-smoke/pages.sh           # every storefront/admin page renders
```

Notes:

- The scripts print each step; `http-e2e.sh` also asserts that the downloaded bytes are byte-identical
  to the uploaded master and that a tampered token is rejected.
- They write to the app's local storage backend (`data/objects` and `data/mk-*.json`). Point `DATA` at
  the directory your server writes to — `dist/.next/standalone/data` when running the standalone build.
- The uploaded masters come from `mktile.py` (a genuinely tileable pattern, so the seamless detector
  can pass) and `mkpng.py` (a non-tileable gradient, used to prove the detector can fail).
