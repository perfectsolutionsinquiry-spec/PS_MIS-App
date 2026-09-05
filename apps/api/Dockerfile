# apps/api/Dockerfile — build + run the Fastify API in any container host.
# Works on Render/Railway/Fly.io as-is, and on `docker compose up` locally.
#
# Self-hosted mode: point DATABASE_URL at any Postgres and set
# AUTH_PROVIDER=local (see docker-compose.yml for a full working example).

FROM node:20-alpine AS build
WORKDIR /repo

# Install workspace deps (package-lock + workspace manifests only, for cache).
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm ci --workspace=@perfect-solutions/api

# Build the API.
COPY apps/api apps/api
# db/migrations is needed at runtime by dist/migrate.js.
COPY db db
RUN npm run build --workspace=@perfect-solutions/api

FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

# Production deps only.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm ci --workspace=@perfect-solutions/api --omit=dev

# Built output + migrations for the migrate runner.
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY db db

WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["node", "dist/index.js"]