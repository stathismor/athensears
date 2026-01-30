# Gig Crawler - Railway Deployment Guide

This guide covers deploying the gig-crawler service to Railway.

## Prerequisites

1. Railway account (https://railway.app)
2. Git repository connected to Railway
3. Brave AI Grounding API key
4. Strapi CMS deployed and accessible (get the Railway URL)

## Deployment Steps

### 1. Create Strapi API Token

Before deploying, you need to create an API token in Strapi:

1. Log into your Strapi admin panel (e.g., `https://your-cms.railway.app/admin`)
2. Go to **Settings** → **API Tokens**
3. Click **Create new API Token**
4. Configure:
   - **Name**: `gig-crawler-service`
   - **Token duration**: Unlimited
   - **Token type**: Full access (or Custom with specific permissions)
5. If using Custom, grant these permissions:
   - `api::gig.gig.create`
   - `api::gig.gig.find`
   - `api::venue.venue.create`
   - `api::venue.venue.find`
6. Click **Save** and copy the token immediately (shown only once)

### 2. Create Railway Service

1. Go to your Railway project dashboard
2. Click **New** → **GitHub Repo** or **New** → **Empty Service**
3. If using GitHub:
   - Select your repository
   - Set root directory to `/apps/gig-crawler` (or leave empty if deploying from root)
4. Name the service: `gig-crawler`

### 3. Configure Environment Variables

In the Railway service settings, add these environment variables:

#### Required Variables

```bash
# Strapi CMS Configuration
STRAPI_API_URL=https://your-cms-service.railway.app
STRAPI_API_TOKEN=your_strapi_api_token_from_step_1

# Brave AI Grounding API
BRAVE_API_KEY=your_brave_api_key

# Server (Railway will set PORT automatically, but you can override)
PORT=3000
NODE_ENV=production
```

#### Optional Variables

```bash
# Cron Schedule (default: 2 AM daily)
CRON_SCHEDULE=0 2 * * *

# Timezone
TZ=Europe/Athens

# Logging
LOG_LEVEL=info
```

### 4. Configure Build Settings

Railway should auto-detect the Dockerfile. If not:

1. Go to **Settings** → **Build**
2. Set **Build Method**: Dockerfile
3. Set **Dockerfile Path**: `apps/gig-crawler/Dockerfile` (or `Dockerfile` if deploying from root)

### 5. Deploy

1. Railway will automatically deploy on push to main branch
2. Or click **Deploy** manually in the Railway dashboard
3. Monitor the build logs for any errors

### 6. Verify Deployment

Once deployed, verify the service is running:

```bash
# Check health endpoint
curl https://your-gig-crawler.railway.app/health

# Expected response:
# {"status":"ok","service":"gig-crawler","timestamp":"2026-01-28T..."}
```

### 7. Test Manual Sync

Trigger a manual sync to test the full workflow:

```bash
curl -X POST https://your-gig-crawler.railway.app/api/sync
```

Expected response:
```json
{
  "status": "in_progress",
  "message": "Sync started successfully"
}
```

Check the Railway logs to see the sync progress and results.

## Environment Variable Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STRAPI_API_URL` | ✅ | - | URL of your Strapi CMS (e.g., https://cms.railway.app) |
| `STRAPI_API_TOKEN` | ✅ | - | Strapi API token with create/read permissions |
| `BRAVE_API_KEY` | ✅ | - | Brave AI Grounding API key (search + AI extraction) |
| `PORT` | ❌ | 3000 | Server port (Railway sets automatically) |
| `NODE_ENV` | ❌ | development | Environment (set to `production`) |
| `CRON_SCHEDULE` | ❌ | `0 2 * * *` | Cron schedule for automated sync |
| `TZ` | ❌ | Europe/Athens | Timezone for cron jobs |
| `LOG_LEVEL` | ❌ | info | Log level (trace, debug, info, warn, error) |

## Cron Schedule Examples

The `CRON_SCHEDULE` variable uses standard cron syntax:

```bash
# Every day at 2 AM (default)
CRON_SCHEDULE=0 2 * * *

# Every 6 hours
CRON_SCHEDULE=0 */6 * * *

# Every Sunday at midnight
CRON_SCHEDULE=0 0 * * 0

# Every day at 3:30 AM
CRON_SCHEDULE=30 3 * * *
```

## Monitoring

### View Logs

In Railway:
1. Go to your gig-crawler service
2. Click **Deployments**
3. Click on the active deployment
4. View real-time logs

### Check Sync Results

Look for log entries like:
```json
{
  "level": "info",
  "msg": "Sync completed successfully",
  "result": {
    "status": "completed",
    "summary": {
      "gigsFound": 15,
      "gigsCreated": 12,
      "gigsDuplicate": 3,
      "gigsSkipped": 0,
      "venuesCreated": 2,
      "errors": []
    },
    "executionTime": "45.3s"
  }
}
```

## Troubleshooting

### Build Fails

- Check Dockerfile path is correct
- Verify pnpm-lock.yaml is committed
- Check build logs for specific errors

### Runtime Errors

- Verify all required environment variables are set
- Check STRAPI_API_URL is accessible from Railway
- Verify API tokens are valid and have correct permissions
- Check rate limits on Brave AI (2,000-5,000 queries/month free tier)

### No Gigs Created

- Check Railway logs for LLM extraction results
- Verify search results are returning Athens events
- Check Strapi CMS is accepting API requests
- Test manual sync via API endpoint

### Cron Not Running

- Verify CRON_SCHEDULE syntax is correct
- Check timezone is set correctly (TZ variable)
- Look for cron job logs in Railway

## Cost Estimation

With default nightly sync (30 days/month):

- **Railway**: Free tier includes 500 hours/month (more than enough)
- **Brave AI**: ~30 queries/month (within 2,000-5,000 free tier limit)
- **Strapi**: Runs on Railway free tier

**Total monthly cost: $0** (within free tiers)

## Scaling Up

If you exceed free tier limits:

- **More frequent syncs**: Brave AI paid tier is $5/1,000 queries
- **Daily sync**: 365 queries/year = ~$1.83/year (very affordable!)
- **Production traffic**: Railway paid plans start at $5/month

## Support

For issues:
1. Check Railway deployment logs
2. Review error messages in logs
3. Test endpoints manually
4. Verify API keys and permissions
