# Build context must be the repo root: docker build -f server/Dockerfile .
FROM node:20-alpine AS builder

WORKDIR /app/server

COPY server/package*.json ./
RUN npm ci --only=production

# Production stage
FROM node:20-alpine AS production

RUN apk add --no-cache dumb-init curl ca-certificates \
    && addgroup -g 1001 -S nodejs \
    && adduser -S nodejs -u 1001

WORKDIR /app/server

# Copy dependencies from builder
COPY --from=builder /app/server/node_modules ./node_modules

# Copy server application code
COPY --chown=nodejs:nodejs server/ ./

# Copy frontend static files (served at runtime via ../paint-preview-app relative path)
COPY --chown=nodejs:nodejs paint-preview-app/ /app/paint-preview-app/

# Create logs directory
RUN mkdir -p /app/server/logs && chown -R nodejs:nodejs /app/server/logs

USER nodejs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]

# Run migrations then start the server
CMD ["sh", "-c", "npm run migrate:up && node index.js"]
