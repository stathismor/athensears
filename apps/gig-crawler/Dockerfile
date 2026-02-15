# Build stage
FROM mcr.microsoft.com/playwright:v1.52.0-noble AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY src ./src

# Build
RUN npm run build

# Production stage
FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${PORT:-3000}/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Expose port
EXPOSE 3000

# Run
CMD ["node", "dist/index.js"]
