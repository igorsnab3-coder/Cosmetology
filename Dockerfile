# syntax=docker/dockerfile:1

# --- Frontend build ---
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-fund --no-audit || npm install --no-fund --no-audit
COPY frontend/ ./
RUN npm run build

# --- Runtime image ---
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    DEBIAN_FRONTEND=noninteractive \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    JARVIS_ROOT=/app \
    JARVIS_DATA_DIR=/app/data \
    JARVIS_SEED_DIR=/app/data-seed \
    JARVIS_ENV_FILE=/app/.env \
    JARVIS_STATIC_ROOT=/app/dist \
    JARVIS_DB_FILE=/app/data/yana.sqlite \
    JARVIS_HOST=127.0.0.1 \
    JARVIS_GATEWAY_HOST=0.0.0.0 \
    PORT=5500

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    fonts-noto-core \
    fonts-noto-color-emoji \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY ai/package.json ai/package-lock.json* ./ai/
COPY db/package.json db/package-lock.json* ./db/
COPY pdf/package.json pdf/package-lock.json* ./pdf/
COPY gateway/package.json ./gateway/

RUN cd /app/ai && npm install --omit=dev --no-fund --no-audit \
 && cd /app/db && npm install --omit=dev --no-fund --no-audit \
 && cd /app/pdf && npm install --omit=dev --no-fund --no-audit

COPY ai/ ./ai/
COPY db/ ./db/
COPY pdf/ ./pdf/
COPY gateway/ ./gateway/
COPY data/ ./data-seed/
COPY docker/entrypoint.sh /app/docker/entrypoint.sh
COPY --from=frontend-build /build/dist /app/dist

RUN chmod +x /app/docker/entrypoint.sh \
 && mkdir -p /app/data \
 && chown -R node:node /app

USER node
EXPOSE 5500
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5500)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/docker/entrypoint.sh"]
