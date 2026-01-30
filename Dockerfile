# Use Node.js 20 LTS
FROM node:24-alpine

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

# Remove development dependencies to reduce image size
RUN pnpm install --frozen-lockfile --prod

# Expose Strapi port
EXPOSE 1337

# Set NODE_ENV
ENV NODE_ENV=production

# Start Strapi
CMD ["pnpm", "start"]
