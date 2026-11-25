# syntax=docker/dockerfile:1
# Contexto: raíz del repositorio.   docker build -f frontend/Dockerfile -t greenalert/frontend .
FROM node:22-alpine AS build
# Reintentos de red y caché compartida de npm entre imágenes (BuildKit)
ENV npm_config_fetch_retries=5 npm_config_fetch_retry_maxtimeout=120000
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci --workspace=frontend --include-workspace-root=false --ignore-scripts --no-audit --no-fund
COPY tsconfig.base.json ./
COPY frontend frontend
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build --workspace=frontend

# Nginx sin privilegios: sirve la SPA y reenvía /api al gateway (mismo origen, sin CORS en el navegador)
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
