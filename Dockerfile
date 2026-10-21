FROM node:20-alpine AS base
RUN apk add --no-cache python3 make g++ sqlite openssl ca-certificates tzdata dumb-init
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --only=production && npm cache clean --force

FROM node:20-alpine AS web-builder
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production PORT=3000
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 appuser
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=appuser:nodejs . .
COPY --from=web-builder --chown=appuser:nodejs /app/web/.next ./web/.next
COPY --from=web-builder --chown=appuser:nodejs /app/web/public ./web/public
RUN mkdir -p data uploads backups logs exports storage && chown -R appuser:nodejs data uploads backups logs exports storage
USER appuser
EXPOSE 3000 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health',r=>r.statusCode===200?process.exit(0):process.exit(1))"
ENTRYPOINT ["/usr/bin/dumb-init","--"]
CMD ["node","server.js"]
