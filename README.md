# Athens Ears

Monorepo for Athens live music events platform.

## Stack

- **CMS**: Strapi v5.33.4 (PostgreSQL)
- **Frontend**: Astro v5.16.15 + Tailwind CSS v4
- **Gig Crawler**: Node.js service (Brave AI Grounding API)
- **Package Manager**: pnpm with workspaces
- **Node.js**: v24.13.0 (pinned via `.node-version`)

## Quick Start

### Option 1: Docker Compose (Recommended)

Run the full stack (database, CMS, crawler) with Docker:

```bash
# Copy environment template
cp .env.example .env
# Edit .env and add your API keys (SerpAPI, Groq, Strapi token)

# Start all services
docker-compose up

# Or run in background
docker-compose up -d
```

Services will be available at:
- **Strapi Admin**: http://localhost:1337/admin
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

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required for gig-crawler:
- `BRAVE_API_KEY` - Get from https://api.search.brave.com/app/dashboard (2,000-5,000 free queries/month)
- `STRAPI_API_TOKEN` - Create in Strapi admin (Settings > API Tokens)

## Development

See [DEVELOPMENT.md](./docs/DEVELOPMENT.md) for detailed documentation.

## License

ISC
