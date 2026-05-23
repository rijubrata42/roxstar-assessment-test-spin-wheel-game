FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

FROM node:20-alpine AS runner

RUN addgroup -S spinrox && adduser -S spinrox -G spinrox

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY server.js        ./
COPY src/             ./src/
COPY config/          ./config/
COPY public/          ./public/
COPY migrations/      ./migrations/
COPY scripts/         ./scripts/
COPY package.json     ./

USER spinrox

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
