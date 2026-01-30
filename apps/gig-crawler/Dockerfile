# Build stage
FROM node:24-alpine AS builder

# Install pnpm
RUN npm install -g pnpm@10.11.0

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/gig-crawler/package.json ./apps/gig-crawler/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/gig-crawler ./apps/gig-crawler

# Build the application
WORKDIR /app/apps/gig-crawler
RUN pnpm build

# Production stage
FROM node:24-alpine

# Install pnpm
RUN npm install -g pnpm@10.11.0

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/gig-crawler/package.json ./apps/gig-crawler/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built application from builder
COPY --from=builder /app/apps/gig-crawler/dist ./apps/gig-crawler/dist

# Set working directory to the app
WORKDIR /app/apps/gig-crawler

# Expose port (Railway will set PORT env var)
EXPOSE 3000

# Start the application
CMD ["pnpm", "start:docker"]
