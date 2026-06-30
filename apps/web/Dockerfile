# Server-rendered Astro (node standalone adapter)
FROM node:24-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

WORKDIR /app

# Copy workspace + web manifests, install deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile --filter web

# Copy source and build the SSR server
COPY apps/web ./apps/web
WORKDIR /app/apps/web
RUN pnpm build

# Astro node standalone server binds HOST:PORT (Railway provides PORT)
EXPOSE 4321
ENV NODE_ENV=production
ENV HOST=0.0.0.0

# Serves dist/server/entry.mjs
CMD ["pnpm", "start"]
