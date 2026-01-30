# Gig Crawler - Docker Setup

This guide covers running the gig-crawler locally with Docker.

## Quick Start with Docker Compose

From the **repository root** (`/athensears`):

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Edit .env and add your API keys
nano .env  # or use your preferred editor
```

Add these to `.env`:
```bash
BRAVE_API_KEY=your_brave_api_key
STRAPI_API_TOKEN=your_strapi_token  # Create this after CMS starts
```

```bash
# 3. Start all services (database, CMS, crawler)
docker-compose up

# Or run in detached mode
docker-compose up -d

# View logs
docker-compose logs -f gig-crawler
```

## Getting the Strapi API Token

The gig-crawler needs a Strapi API token to create gigs and venues.

### Step 1: Start CMS without crawler first

If you don't have a token yet, start only the CMS:

```bash
docker-compose up postgres cms
```

### Step 2: Create admin account

Visit http://localhost:1337/admin and create your admin account.

### Step 3: Create API Token

1. Go to **Settings** → **API Tokens**
2. Click **Create new API Token**
3. Configure:
   - **Name**: `gig-crawler-local`
   - **Token duration**: Unlimited
   - **Token type**: Custom
4. Grant these permissions:
   - ✅ `api::gig.gig.create`
   - ✅ `api::gig.gig.find`
   - ✅ `api::venue.venue.create`
   - ✅ `api::venue.venue.find`
5. Click **Save** and copy the token

### Step 4: Add token to .env

```bash
STRAPI_API_TOKEN=your_copied_token_here
```

### Step 5: Start the crawler

```bash
# Start just the crawler (CMS already running)
docker-compose up gig-crawler

# Or restart all services
docker-compose restart gig-crawler
```

## Testing the Crawler

### Check service health

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "gig-crawler",
  "timestamp": "2026-01-28T..."
}
```

### Trigger a manual sync

```bash
curl -X POST http://localhost:3000/api/sync
```

Expected response:
```json
{
  "status": "in_progress",
  "message": "Sync started successfully"
}
```

### Watch the logs

```bash
docker-compose logs -f gig-crawler
```

You'll see:
1. Search queries being executed
2. LLM extracting gig data
3. Venues being matched/created
4. Gigs being created
5. Final summary with counts

### Verify in Strapi

1. Go to http://localhost:1337/admin
2. Navigate to **Content Manager**
3. Check **Gigs** and **Venues** collections
4. You should see newly created entries

## Docker Commands Reference

```bash
# Start all services
docker-compose up

# Start in background
docker-compose up -d

# Start specific service
docker-compose up gig-crawler

# View logs
docker-compose logs -f gig-crawler

# Restart a service
docker-compose restart gig-crawler

# Stop all services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v

# Rebuild images (after code changes)
docker-compose build gig-crawler

# Rebuild and start
docker-compose up --build gig-crawler
```

## Development Workflow

The Docker setup includes hot reload for development.

### Editing code

1. Edit files in `apps/gig-crawler/src/`
2. Changes are automatically detected
3. Service restarts automatically
4. No need to rebuild the image

### Adding dependencies

```bash
# Stop the service
docker-compose stop gig-crawler

# Add dependency
pnpm --filter gig-crawler add axios

# Rebuild and restart
docker-compose up --build gig-crawler
```

## Disabling Cron for Local Dev

By default, the cron scheduler is disabled in docker-compose for local development.

To enable it, uncomment in `docker-compose.yml`:

```yaml
gig-crawler:
  environment:
    # Uncomment to enable nightly sync
    CRON_SCHEDULE: "0 2 * * *"
```

For testing cron locally, use a shorter schedule:

```yaml
CRON_SCHEDULE: "*/5 * * * *"  # Every 5 minutes
```

## Troubleshooting

### Crawler can't reach CMS

Error: `Failed to fetch venues: connect ECONNREFUSED`

**Solution**: Make sure the CMS service is running:
```bash
docker-compose ps
docker-compose logs cms
```

The crawler uses `http://cms:1337` to connect via Docker network.

### Missing API token

Error: `Missing required environment variables: STRAPI_API_TOKEN`

**Solution**: Follow the "Getting the Strapi API Token" section above.

### Rate limit errors

Error: `429 Too Many Requests`

**Solution**:
- SerpAPI free tier: 100 searches/month
- Add delays between syncs
- Upgrade to paid tier if needed

### Port already in use

Error: `Error starting userland proxy: listen tcp4 0.0.0.0:3000: bind: address already in use`

**Solution**: Either stop the process using port 3000, or change the port mapping in docker-compose.yml:

```yaml
gig-crawler:
  ports:
    - "3001:3000"  # Map to 3001 on host
```

## Architecture

The Docker setup includes:

```
┌─────────────┐
│  postgres   │ PostgreSQL database
│  :5432      │
└──────┬──────┘
       │
┌──────▼──────┐
│     cms     │ Strapi CMS
│   :1337     │
└──────┬──────┘
       │
┌──────▼──────┐
│gig-crawler  │ Crawler service
│   :3000     │
└─────────────┘
```

- All services run in isolated containers
- Connected via Docker network
- Data persisted in volumes
- Hot reload for development

## Production Differences

Docker Compose is for **local development only**.

For production on Railway:
- Uses production Dockerfile (multi-stage build)
- Optimized for size and security
- No volumes (immutable containers)
- Environment variables via Railway dashboard
- See `DEPLOY.md` for deployment guide
