# Athens Ears

Monorepo for Athens live music events platform.

## Stack

- **CMS**: Strapi v5 (PostgreSQL)
- **Frontend**: Astro v5 (server-rendered via `@astrojs/node`) + Tailwind CSS v4
- **Gig Crawler**: Node.js service — crawls a curated registry of Athens venues + ticketing pages (`apps/gig-crawler/src/models/sources.ts`) and extracts gigs with Google Gemini
- **Package Manager**: pnpm with workspaces
- **Node.js**: v24.13.0 (pinned via `.node-version`)

## Quick Start

### Option 1: Docker Compose (Recommended)

Run the full stack (database, CMS, crawler) with Docker:

```bash
# Copy each app's environment template and fill in the values
cp apps/cms/.env.example apps/cms/.env                  # CMS secrets
cp apps/gig-crawler/.env.example apps/gig-crawler/.env  # GEMINI_API_KEY, STRAPI_API_TOKEN

# Start all services
docker-compose up

# Or run in background
docker-compose up -d
```

Services will be available at:
- **Strapi Admin**: http://localhost:1337/admin
- **Web (SSR)**: http://localhost:4321
- **Gig Crawler**: http://localhost:3000
- **Gig Crawler Health**: http://localhost:3000/health

### Option 2: Local Development (without Docker)

```bash
# Install dependencies
pnpm install

# Start PostgreSQL (required)
docker run -d \
  --name postgres \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=strapi \
  postgres:16-alpine

# Start CMS + Frontend
pnpm dev

# In another terminal, start the crawler
pnpm dev:crawler
```

- **Strapi Admin**: http://localhost:1337/admin
- **Astro Frontend**: http://localhost:4321
- **Gig Crawler**: http://localhost:3000

## Prerequisites

- Node.js 24.13.0 (use nvm/fnm to switch: `nvm use` or `fnm use`)
- pnpm 10.11.0+
- Docker & Docker Compose (for containerized setup)
- PostgreSQL (if running locally)

## Environment Variables

Each app has its own env file (no root `.env`). Copy the templates and configure:

```bash
cp apps/cms/.env.example apps/cms/.env
cp apps/gig-crawler/.env.example apps/gig-crawler/.env
```

Required for gig-crawler:
- `GEMINI_API_KEY` - Get from https://aistudio.google.com/apikey
- `STRAPI_API_TOKEN` - Create in Strapi admin (Settings > API Tokens). Needs `gig.create`, `gig.find`, `gig.update`, `venue.create`, `venue.find`, `crawl-cache.find`, `crawl-cache.update`.

## Development

See [DEVELOPMENT.md](./docs/DEVELOPMENT.md) for detailed documentation.

## License

ISC
