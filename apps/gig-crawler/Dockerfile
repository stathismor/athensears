FROM mcr.microsoft.com/playwright:v1.52.0-noble
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/gig-crawler/package.json ./apps/gig-crawler/
RUN pnpm install --frozen-lockfile --filter gig-crawler
COPY apps/gig-crawler/tsconfig.json ./apps/gig-crawler/
COPY apps/gig-crawler/src ./apps/gig-crawler/src
WORKDIR /app/apps/gig-crawler
RUN pnpm build
RUN pnpm install --frozen-lockfile --filter gig-crawler --prod
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${PORT:-3000}/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
