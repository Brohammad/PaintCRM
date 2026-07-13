# Build context must be the repo root: docker build -f server/Dockerfile .

# --- Frontend build stage (Vite bundle) ---
FROM node:20-alpine AS frontend
WORKDIR /app/paint-preview-app
COPY paint-preview-app/package*.json ./
RUN npm ci
COPY paint-preview-app/ ./
RUN npm run build

# --- Server dependency stage ---
FROM node:20-alpine AS builder
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --only=production

# --- Production stage ---
FROM node:20-alpine AS production

RUN apk add --no-cache dumb-init curl ca-certificates \
    && addgroup -g 1001 -S nodejs \
    && adduser -S nodejs -u 1001

WORKDIR /app/server

# Copy dependencies from builder
COPY --from=builder /app/server/node_modules ./node_modules

# Copy server application code
COPY --chown=nodejs:nodejs server/ ./

# Copy the built frontend bundle (served at runtime from ../paint-preview-app/dist)
COPY --chown=nodejs:nodejs --from=frontend /app/paint-preview-app/dist /app/paint-preview-app/dist

# Seed migration 005 reads the raw shades.json from ../../paint-preview-app/shades.json
COPY --chown=nodejs:nodejs paint-preview-app/shades.json /app/paint-preview-app/shades.json

# Create logs directory
RUN mkdir -p /app/server/logs && chown -R nodejs:nodejs /app/server/logs

USER nodejs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]

# Run migrations then start the server
CMD ["sh", "-c", "npm run migrate:up && node index.js"]
