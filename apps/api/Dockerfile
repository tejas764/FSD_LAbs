# ── Stage 1: builder ─────────────────────────────────────────────────────────
FROM node:24.14.1-alpine AS builder

WORKDIR /app

# Install build tools needed by native addons (sharp, pg)
RUN apk add --no-cache python3 make g++

# Copy manifests first for layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy Prisma schema and generate the client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source and compile TypeScript
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

# ── Stage 2: runner ──────────────────────────────────────────────────────────
FROM node:24.14.1-alpine AS runner

WORKDIR /app

# Non-root user for minimal attack surface
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Install production dependencies only (includes native addon binaries)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled output and Prisma artefacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# Copy the prisma CLI so that `npx prisma migrate deploy` works at runtime
# (prisma is a devDependency so it is absent from the --omit=dev install above)
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY prisma ./prisma
# prisma.config.ts provides DATABASE_URL to the Prisma CLI (Prisma 7 pattern)
COPY prisma.config.ts ./

USER appuser

EXPOSE 4000

# Run migrations then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
