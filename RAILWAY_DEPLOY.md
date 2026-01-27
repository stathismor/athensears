# Railway Deployment Guide

This guide walks you through deploying the Strapi CMS to Railway.

## Prerequisites

- GitHub account
- Railway account (sign up at [railway.app](https://railway.app))
- This repository pushed to GitHub

## Step-by-Step Deployment

### 1. Create Railway Project

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your **athensears** repository
5. Railway will detect the Dockerfile and create the service

### 2. Add PostgreSQL Database

1. In your Railway project dashboard, click **"New"**
2. Select **"Database"** → **"Add PostgreSQL"**
3. Railway automatically provisions a PostgreSQL 16 instance
4. The database variables will be automatically available to your CMS service

### 3. Configure Environment Variables

In your CMS service settings, add these environment variables:

#### Required Variables

```bash
# Database (Railway auto-populates these from PostgreSQL service)
DATABASE_CLIENT=postgres
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Server
HOST=0.0.0.0
PORT=${{PORT}}
NODE_ENV=production

# Strapi Secrets (GENERATE NEW VALUES!)
APP_KEYS=your-generated-keys-here
API_TOKEN_SALT=your-generated-salt-here
ADMIN_JWT_SECRET=your-generated-secret-here
TRANSFER_TOKEN_SALT=your-generated-salt-here
JWT_SECRET=your-generated-jwt-secret-here
ENCRYPTION_KEY=your-generated-encryption-key-here
```

#### Generate Secure Secrets

Run this command locally to generate secure random strings:

```bash
# Generate multiple secrets at once
node -e "console.log('APP_KEYS=' + Array(4).fill(0).map(() => require('crypto').randomBytes(32).toString('base64')).join(','))"
node -e "console.log('API_TOKEN_SALT=' + require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log('ADMIN_JWT_SECRET=' + require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log('TRANSFER_TOKEN_SALT=' + require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
```

Copy the output and paste into Railway's environment variables.

### 4. Configure Service Settings

1. In your CMS service, go to **"Settings"**
2. Set **Root Directory** to: `/` (leave as default)
3. Railway will use `railway.json` configuration automatically
4. **Healthcheck endpoint**: `/admin` or `/_health`

### 5. Link Database to CMS Service

Railway should automatically link the PostgreSQL database to your CMS service. Verify this:

1. Go to your CMS service
2. Check **"Variables"** tab
3. You should see `DATABASE_URL` from the Postgres service

If not linked:
1. Click **"Variables"**
2. Click **"New Variable"** → **"Add Reference"**
3. Select `Postgres.DATABASE_URL`

### 6. Deploy

1. Railway automatically deploys when you push to GitHub
2. Watch the build logs in the Railway dashboard
3. Once deployed, click **"Generate Domain"** to get a public URL
4. Visit `https://your-app.railway.app/admin` to set up your admin account

## Environment Variables Reference

Railway provides these automatically when PostgreSQL is linked:

- `DATABASE_URL` - Full PostgreSQL connection string
- `PORT` - Railway assigns this automatically
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` - Individual DB connection params

## Troubleshooting

### Build Fails

- Check build logs in Railway dashboard
- Verify `pnpm-lock.yaml` is committed
- Ensure Dockerfile is in the root directory

### Database Connection Issues

- Verify PostgreSQL service is running
- Check that `DATABASE_URL` is available in Variables tab
- Ensure `DATABASE_CLIENT=postgres` is set

### App Crashes After Deployment

- Check deployment logs for errors
- Verify all required environment variables are set
- Check that secrets (APP_KEYS, JWT_SECRET, etc.) are properly configured

## Custom Domain

To add a custom domain:

1. Go to your CMS service settings
2. Click **"Settings"** → **"Domains"**
3. Click **"Custom Domain"**
4. Follow the DNS configuration instructions

## Automatic Deployments

Railway automatically deploys when you push to your connected GitHub branch:

1. Go to service **"Settings"**
2. Under **"Source"**, verify the branch (usually `main`)
3. Every push to this branch triggers a new deployment

## Cost Considerations

Railway pricing:
- **Free tier**: $5 credit/month (good for testing)
- **Hobby plan**: $5/month + usage
- PostgreSQL and app deployments count toward your usage

Monitor usage in Railway dashboard → Billing.
