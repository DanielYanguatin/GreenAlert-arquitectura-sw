# syntax=docker/dockerfile:1
# Contexto de construcción: raíz del repositorio (usa el package-lock.json del workspace).
#   docker build -f api-gateway/Dockerfile -t greenalert/users .
ARG SERVICE=api-gateway

FROM node:22-alpine AS build
# Reintentos de red y caché compartida de npm entre imágenes (BuildKit)
ENV npm_config_fetch_retries=5 npm_config_fetch_retry_maxtimeout=120000
ARG SERVICE
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY ${SERVICE}/package.json ${SERVICE}/
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci --workspace=${SERVICE} --include-workspace-root=false --ignore-scripts --no-audit --no-fund
COPY ${SERVICE} ${SERVICE}
RUN npm run build --workspace=${SERVICE}

FROM node:22-alpine AS runtime
ARG SERVICE
ENV npm_config_fetch_retries=5 npm_config_fetch_retry_maxtimeout=120000
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY ${SERVICE}/package.json ${SERVICE}/
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci --workspace=${SERVICE} --include-workspace-root=false --omit=dev --ignore-scripts --no-audit --no-fund \
  && npm cache clean --force
COPY --from=build /app/${SERVICE}/dist ${SERVICE}/dist
WORKDIR /app/${SERVICE}
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
