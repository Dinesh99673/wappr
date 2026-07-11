# Wappr — production image.
#
# whatsapp-web.js drives a real headless Chromium via Puppeteer, so we use a
# Debian base (NOT Alpine — Puppeteer's prebuilt Chromium is glibc-only and does
# not run on musl) and bake in the shared libraries headless Chromium needs.
# Puppeteer downloads a matched Chromium during `npm ci`, so we don't pin a
# system chromium package — the versions always agree.

FROM node:22-bookworm-slim

# --- Chromium runtime libraries (headless) ---------------------------------
# This is the "libnss3 / libgbm1 / libasound2 / ..." set the README mentions,
# installed once at build time so the image just works on any host.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      fonts-liberation \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libc6 \
      libcairo2 \
      libcups2 \
      libdbus-1-3 \
      libexpat1 \
      libfontconfig1 \
      libgbm1 \
      libgcc-s1 \
      libglib2.0-0 \
      libgtk-3-0 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libpangocairo-1.0-0 \
      libstdc++6 \
      libx11-6 \
      libx11-xcb1 \
      libxcb1 \
      libxcomposite1 \
      libxcursor1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxi6 \
      libxrandr2 \
      libxrender1 \
      libxss1 \
      libxtst6 \
      wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Dependencies (cached layer) -------------------------------------------
# Copy only the manifests first so `npm ci` is re-run only when they change.
# postinstall runs `prisma generate`; Puppeteer's install downloads Chromium.
COPY package.json package-lock.json ./
RUN npm ci

# --- Build ------------------------------------------------------------------
COPY . .
RUN npm run build

# Now that build (which needs devDependencies) is done, switch to production.
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Runtime data lives here and should be mounted as volumes (see compose):
#   data/          SQLite database
#   .wwebjs_auth/  WhatsApp login session
#   .wwebjs_cache/ WhatsApp web assets
RUN mkdir -p data .wwebjs_auth .wwebjs_cache

# Apply any pending Prisma migrations, then start Next.js. `migrate deploy` is
# idempotent, so this is safe on every boot (fresh clone or existing volume).
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
