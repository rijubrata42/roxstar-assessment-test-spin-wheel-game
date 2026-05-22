# ─────────────────────────────────────────────────────────────
#  Stage 1: deps — install only production dependencies
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package files first for layer-cache efficiency
COPY package.json package-lock.json ./

# Install production deps only
RUN npm ci --omit=dev

# ─────────────────────────────────────────────────────────────
#  Stage 2: runner — final lean image
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Security: run as non-root
RUN addgroup -S spinrox && adduser -S spinrox -G spinrox

WORKDIR /app

# Copy production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY server.js        ./
COPY src/             ./src/
COPY config/          ./config/
COPY public/          ./public/
COPY migrations/      ./migrations/
COPY scripts/         ./scripts/
COPY package.json     ./

# Switch to non-root user
USER spinrox

# Expose app port
EXPOSE 3000

# Health check — hits the /health endpoint every 30s
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

# Start the server
CMD ["node", "server.js"]
