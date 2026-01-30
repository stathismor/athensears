# Netlify Deployment Guide

This guide walks you through deploying the Astro website to Netlify.

## Prerequisites

- GitHub account
- Netlify account (sign up at [netlify.com](https://netlify.com))
- Railway CMS deployed and running
- This repository pushed to GitHub

## Architecture

```
GitHub → Netlify (static site build)
           ↓ (fetches data at build time)
         Railway Strapi CMS
```

## Step-by-Step Deployment

### 1. Create Netlify Site

1. Go to [app.netlify.com](https://app.netlify.com) and sign in
2. Click **"Add new site"** → **"Import an existing project"**
3. Select **"Deploy with GitHub"**
4. Choose your **athensears** repository
5. Netlify will auto-detect the `netlify.toml` configuration

### 2. Configure Build Settings

Netlify should automatically detect these from `netlify.toml`:

```
Base directory: apps/web
Build command: cd ../.. && pnpm --filter web build
Publish directory: apps/web/dist
```

If not auto-detected, enter them manually in the build settings.

### 3. Environment Variables

If your site needs to fetch data from Strapi at build time, add these environment variables in Netlify:

```bash
# Strapi CMS URL (your Railway URL)
PUBLIC_STRAPI_URL=https://your-cms.railway.app
```

**To add in Netlify:**
1. Go to **"Site settings"** → **"Environment variables"**
2. Click **"Add a variable"**
3. Key: `PUBLIC_STRAPI_URL`
4. Value: Your Railway CMS URL (e.g., `https://athensears-cms.railway.app`)
5. Click **"Create variable"**

**Note:** Astro exposes environment variables prefixed with `PUBLIC_` to the client-side code.

### 4. Deploy

1. Click **"Deploy site"**
2. Netlify will:
   - Install pnpm dependencies
   - Build your Astro site (fetching data from Railway CMS)
   - Deploy static files to their CDN
3. Watch the deploy logs for any errors

### 5. Configure Domain (Optional)

**Free Subdomain:**
- Netlify gives you a free `*.netlify.app` domain
- You can customize it: Site settings → Domain management → Edit site name

**Custom Domain:**
1. Go to **"Domain settings"**
2. Click **"Add custom domain"**
3. Enter your domain (e.g., `athensears.com`)
4. Follow DNS configuration instructions

## Fetching Data from Strapi

In your Astro pages, fetch data at build time:

```astro
---
// apps/web/src/pages/index.astro
const strapiUrl = import.meta.env.PUBLIC_STRAPI_URL || 'http://localhost:1337';

// Fetch data at build time
const response = await fetch(`${strapiUrl}/api/gigs?populate=*`);
const { data: gigs } = await response.json();
---

<html>
  <body>
    {gigs.map(gig => (
      <div>{gig.attributes.title}</div>
    ))}
  </body>
</html>
```

## Automatic Deployments

Netlify automatically deploys when you push to your connected GitHub branch:

1. Go to **"Site settings"** → **"Build & deploy"**
2. Under **"Build settings"**, verify the branch (usually `main`)
3. Every push triggers a new build and deployment

### Deploy Hooks (Optional)

To trigger Netlify builds when CMS content changes:

1. In Netlify: **"Site settings"** → **"Build & deploy"** → **"Build hooks"**
2. Click **"Add build hook"**
3. Name it "Strapi Content Update"
4. Copy the webhook URL
5. In Strapi: Add this URL to trigger rebuilds when content changes

## Troubleshooting

### Build Fails

Check the deploy logs in Netlify dashboard:
- Verify `pnpm-lock.yaml` is committed
- Ensure all dependencies are listed in `package.json`
- Check that `PUBLIC_STRAPI_URL` is set if needed

### 404 Errors

- Verify `publish` directory is set to `apps/web/dist`
- Check that the Astro build completed successfully
- Review Netlify function logs for errors

### Slow Builds

- Astro builds are typically fast (< 1 minute)
- If slow, check if you're fetching large amounts of data from Strapi
- Consider implementing build caching or pagination

## Cost

Netlify pricing:
- **Free tier**: 100GB bandwidth/month, 300 build minutes/month
- Perfect for small to medium sites
- Your static site will likely stay within free tier limits

Monitor usage in Netlify dashboard → Billing.

## Performance Tips

1. **Enable Netlify CDN caching** (automatic)
2. **Optimize images**: Use Astro's `<Image>` component
3. **Enable asset optimization**: Site settings → Build & deploy → Post processing
4. **Use Netlify Analytics** (optional, $9/month) for visitor insights

## Development Workflow

```bash
# Local development
cd apps/web
pnpm dev

# Test production build locally
pnpm build
pnpm preview

# Push to GitHub
git push origin main

# Netlify auto-deploys
```
