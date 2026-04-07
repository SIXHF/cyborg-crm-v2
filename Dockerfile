FROM node:20-slim AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Build the app
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Include postgres + bcryptjs modules for migration script
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/postgres ./node_modules/postgres
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/bcryptjs ./node_modules/bcryptjs

# Include migration SQL, migrate script, and startup script
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate.js ./migrate.js
COPY --from=builder --chown=nextjs:nodejs /app/scripts/startup.sh ./startup.sh
RUN chmod +x ./startup.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["./startup.sh"]
