# Deploying Athens Ears (Railway)

Four services: **Postgres**, **CMS** (Strapi), **crawler** (Node), **web** (Astro SSR).
Each app already has a `railway.json` pointing at its production `Dockerfile`. The crawler
no longer uses Brave; the only external API key you need is **Gemini**.

> Any Docker host works (Render, Fly, a VPS with docker-compose). Steps below assume Railway.

## 0. Prerequisites
- A **Gemini API key** - https://aistudio.google.com/apikey
- `openssl` (to generate Strapi secrets)
- Railway account + the repo connected to it

## 1. Postgres
Add a **PostgreSQL** database to the Railway project. Note its connection vars
(`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`) - Railway exposes them as
reference variables you can wire into the CMS.

## 2. CMS (Strapi) - `apps/cms/Dockerfile`
Create a service from the repo; set its config/`railway.json` path is already
`apps/cms/Dockerfile`. Environment:

```
NODE_ENV=production
DATABASE_CLIENT=postgres
DATABASE_HOST=${{Postgres.PGHOST}}
DATABASE_PORT=${{Postgres.PGPORT}}
DATABASE_NAME=${{Postgres.PGDATABASE}}
DATABASE_USERNAME=${{Postgres.PGUSER}}
DATABASE_PASSWORD=${{Postgres.PGPASSWORD}}
DATABASE_SSL=true        # Railway Postgres requires SSL

# Generate each with: openssl rand -base64 32
APP_KEYS=<k1>,<k2>,<k3>,<k4>
API_TOKEN_SALT=<rand>
ADMIN_JWT_SECRET=<rand>
TRANSFER_TOKEN_SALT=<rand>
JWT_SECRET=<rand>
ENCRYPTION_KEY=<rand>
```

Deploy. On first boot Strapi creates the tables (including the `genre` column) and grants
**public read** on gigs/venues automatically. Do **not** set `SEED_SAMPLE_DATA` - demo data
stays off so the site isn't seeded with placeholder gigs.

Then:
1. Open the CMS public URL `/admin`, **register the admin** account.
2. **Settings → API Tokens → Create**: name `gig-crawler`, token type **Full access**
   (simplest - the crawler needs gig create/find/update + venue create/find, and delete for
   pruning). Copy the token now (shown once).

## 3. Crawler - `apps/gig-crawler/Dockerfile`
Create a service. Environment:

```
NODE_ENV=production
STRAPI_API_URL=http://${{cms.RAILWAY_PRIVATE_DOMAIN}}:1337   # private networking
STRAPI_API_TOKEN=<the Full-access token from step 2>
GEMINI_API_KEY=<your key>
GEMINI_MODEL=gemini-flash-latest
TZ=Europe/Athens
CRON_SCHEDULE=0 4 * * *      # nightly 04:00 Athens
# optional tuning:
# SYNC_SOURCE_CONCURRENCY=4   SYNC_MAX_DETAIL_PER_SOURCE=30
# SYNC_PRUNE_GRACE_DAYS=3     GEMINI_RATE_LIMIT_RPM=120     GEMINI_CHUNK_SIZE=6
# SYNC_API_KEY=<random>       # if set, POST /api/sync requires Authorization: Bearer it
```

It has a `/health` check and an embedded nightly cron. Trigger the first run manually:
`curl -XPOST https://<crawler-url>/api/sync` (add `-H "Authorization: Bearer $SYNC_API_KEY"`
if you set one). Watch logs; it should finish in a few minutes with `errors: 0`. The same
endpoint takes options (`force`, `sources`, `clear`, `normalize`, ...) - see
`apps/gig-crawler/README.md` for the full API.

## 4. Web (SSR) - `apps/web/Dockerfile`
Create a service. Environment:

```
NODE_ENV=production
HOST=0.0.0.0
STRAPI_API_URL=http://${{cms.RAILWAY_PRIVATE_DOMAIN}}:1337   # server-side fetch (private)
```

Railway sets `PORT`; the Astro node server binds it. Add a public domain to this service -
that's the site. It server-renders from Strapi each request, so new nightly gigs and any
manual CMS edits appear on refresh with no rebuild.

## Operating notes
- **Add/fix gigs**: edit in the CMS admin and tick **`manual`** so the nightly crawler won't
  overwrite or prune it.
- **Add a venue/source**: edit `apps/gig-crawler/src/models/sources.ts` (verify the listing
  URL resolves), commit, redeploy the crawler.
- **Non-destructive**: runs upsert in place and only prune gigs unseen for
  `SYNC_PRUNE_GRACE_DAYS`; a failed scrape never empties the site.
- **No Brave/Netlify**: discovery is the curated registry; the web app is SSR on Railway
  (the old `docs/RAILWAY_DEPLOY.md` / `docs/NETLIFY_DEPLOY.md` are superseded by this file).
```
