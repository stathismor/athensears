# Use Node.js 20 LTS
FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/cms/package.json ./apps/cms/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy application code
COPY apps/cms ./apps/cms

# Build Strapi
WORKDIR /app/apps/cms
RUN pnpm build

# Production stage
FROM node:20-alpine AS production

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

WORKDIR /app

# Copy package files and install production dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/cms/package.json ./apps/cms/
RUN pnpm install --frozen-lockfile --prod

# Copy built application (compiled .js files, not source .ts files)
COPY --from=base /app/apps/cms/dist/config ./apps/cms/config
COPY --from=base /app/apps/cms/dist/src ./apps/cms/src
COPY --from=base /app/apps/cms/public ./apps/cms/public
COPY --from=base /app/apps/cms/.strapi ./apps/cms/.strapi
COPY --from=base /app/apps/cms/package.json ./apps/cms/

WORKDIR /app/apps/cms

# Expose Strapi port
EXPOSE 1337

# Start Strapi
CMD ["pnpm", "start"]
