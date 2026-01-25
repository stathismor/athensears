# Athens Ears

Monorepo with Strapi CMS and Astro frontend.

## Stack

- **CMS**: Strapi v5.33.4 (PostgreSQL)
- **Frontend**: Astro v5.16.15 + Tailwind CSS v4
- **Package Manager**: pnpm with workspaces
- **Node.js**: v24.13.0 (pinned via `.node-version`)

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development servers
pnpm dev
```

- **Strapi Admin**: http://localhost:1337/admin
- **Astro Frontend**: http://localhost:4321

## Prerequisites

- Node.js 24.13.0 (use nvm/fnm to switch: `nvm use` or `fnm use`)
- pnpm 10.11.0+
- PostgreSQL (Docker or local)

### PostgreSQL Setup (Docker)

```bash
docker run -d \
  --name postgres \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=strapi \
  postgres:16-alpine
```

## Development

See [DEVELOPMENT.md](./DEVELOPMENT.md) for detailed documentation.

## License

ISC
