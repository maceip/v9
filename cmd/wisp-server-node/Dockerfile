# Multi-stage build for a minimal production image.
FROM node:22-alpine AS deps

WORKDIR /app
COPY package.json ./
# The `ws` package is the only runtime dep. Keep install reproducible.
RUN npm install --omit=dev --no-audit --no-fund

FROM node:22-alpine AS runtime

# Run as an unprivileged user. App Runner / Fargate will also enforce this
# via the task definition, but belt-and-braces.
RUN addgroup -S wisp && adduser -S wisp -G wisp

WORKDIR /app
COPY --from=deps --chown=wisp:wisp /app/node_modules ./node_modules
COPY --chown=wisp:wisp server.js guard.js package.json ./

USER wisp

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Health check endpoint — App Runner polls this for readiness
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:8080/health || exit 1

CMD ["node", "server.js"]
