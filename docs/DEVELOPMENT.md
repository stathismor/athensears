# Development Guide

## Quick Start

```bash
# Install dependencies
pnpm install

# Start both CMS and Web in development mode
pnpm dev

# Or start individually
pnpm dev:cms  # Strapi CMS on http://localhost:1337
pnpm dev:web  # Astro frontend on http://localhost:4321
```

## Project Structure

```
athensears/
├── apps/
│   ├── cms/          # Strapi headless CMS (PostgreSQL)
│   └── web/          # Astro frontend with Tailwind CSS
├── .prettierrc       # Code formatting config
└── package.json      # Root workspace config
```

## Available Commands

### Development
- `pnpm dev` - Run both apps in parallel
- `pnpm dev:cms` - Run only Strapi CMS
- `pnpm dev:web` - Run only Astro frontend

### Building
- `pnpm build` - Build both apps
- `pnpm build:cms` - Build Strapi admin panel
- `pnpm build:web` - Build Astro site

### Code Quality
- `pnpm format` - Format all code with Prettier
- `pnpm format:check` - Check code formatting

### Maintenance
- `pnpm clean:cms` - Clear Strapi build cache and rebuild

### Production
- `pnpm start:cms` - Start Strapi in production mode
- `pnpm start:web` - Preview Astro production build

## Troubleshooting

### Strapi admin UI errors

If you see "error loading dynamically imported module" or similar Vite errors in the admin UI:

```bash
pnpm run clean:cms
```

This clears the Vite/Strapi build cache and rebuilds the admin panel. Common causes:
- Dependency changes (adding/removing packages)
- Interrupted build process
- Stale cache after switching branches

### Database connection errors

If Strapi fails to connect to PostgreSQL:

1. **Check PostgreSQL is running**:
   ```bash
   docker ps | grep postgres
   # or
   sudo systemctl status postgresql
   ```

2. **Verify connection details** in `apps/cms/.env`:
   - `DATABASE_HOST` (default: localhost)
   - `DATABASE_PORT` (default: 5432)
   - `DATABASE_NAME` (default: strapi)
   - `DATABASE_USERNAME` and `DATABASE_PASSWORD`

3. **Test connection manually**:
   ```bash
   psql -h localhost -U postgres -d strapi
   ```

4. **Create database if needed**:
   ```bash
   psql -h localhost -U postgres -c "CREATE DATABASE strapi;"
   ```

### Docker PostgreSQL setup

If you need to start a PostgreSQL container:

```bash
docker run -d \
  --name postgres \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=strapi \
  postgres:16-alpine
```

## First Time Setup

1. **Ensure PostgreSQL is running** (see Docker setup below if needed)

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Start development servers**
   ```bash
   pnpm dev
   ```

4. **Access the applications**
   - Strapi Admin: http://localhost:1337/admin (create admin user on first visit)
   - Astro Frontend: http://localhost:4321

## Code Formatting

The project uses Prettier for consistent code formatting. Run before committing:

```bash
pnpm format
```

Or set up your editor to format on save.

## Technologies

- **Package Manager**: pnpm with workspaces
- **CMS**: Strapi v5.33.4
- **Frontend**: Astro v5.16.15
- **Styling**: Tailwind CSS v4
- **Database**: PostgreSQL
