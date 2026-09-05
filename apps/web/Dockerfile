# apps/web/Dockerfile — build the Vite SPA and serve it from nginx.
# For self-hosting: `docker compose up` (see docker-compose.yml at repo root).

FROM node:20-alpine AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace=@perfect-solutions/web

COPY apps/web apps/web

# VITE_ vars are baked in at build time. Override per deployment:
#   --build-arg VITE_API_URL=http://my.api:3000
#   --build-arg VITE_AUTH_PROVIDER=clerk
ARG VITE_API_URL=http://localhost:3000
ARG VITE_AUTH_PROVIDER=local
ARG VITE_CLERK_PUBLISHABLE_KEY=
ENV VITE_API_URL=$VITE_API_URL \
    VITE_AUTH_PROVIDER=$VITE_AUTH_PROVIDER \
    VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
RUN npm run build --workspace=@perfect-solutions/web

FROM nginx:alpine
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80