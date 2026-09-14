# ---- build stage -------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Install production dependencies only, from the lockfile.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime stage -----------------------------------------------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=4000

WORKDIR /app

# Tini gives us correct signal handling so SIGTERM reaches the app
# and server.js can shut Mongo down cleanly.
RUN apk add --no-cache tini wget

COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY server.js ./
COPY src ./src

# Run as the unprivileged user that ships with the node image.
USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:4000/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
