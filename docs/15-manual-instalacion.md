# 15 · Manual de instalación

## Requisitos

- Docker Desktop 4.x (Docker Engine ≥ 24, Compose v2) con ≥ 6 GB de RAM asignados.
- Node.js 22 y npm 10 (solo para desarrollo y pruebas fuera de Docker).
- Git.

## Opción A · Todo en Docker (recomendada)

```bash
git clone <url-del-repositorio> greenalert && cd greenalert
cp .env.example .env
```

Edite `.env` y reemplace **todos** los valores `cambiar-…`. Para generar secretos:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

La contraseña de `ADMIN_PASSWORD` debe cumplir la política (≥ 8 caracteres, mayúscula, minúscula y número).

```bash
# Construcción (secuencial, más estable con redes lentas)
for s in users reports multimedia geolocation ai notifications api-gateway frontend; do docker compose build $s; done
docker compose up -d
docker compose ps          # todos deben quedar "healthy"
```

| URL | Uso |
|---|---|
| http://localhost:8080 | Aplicación web |
| http://localhost:3000/api/docs | Swagger (seleccione el servicio en la barra superior) |
| http://localhost:3000/api/health | Estado de la plataforma |
| http://localhost:8025 | Correos capturados por Mailpit (solo desarrollo) |

Ingrese con `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Para crear funcionarios: regístrelos como ciudadanos y cambie su rol en **Usuarios**.

Verificación automática del despliegue:

```bash
node tests/e2e/smoke.mjs              # flujo funcional
node tests/e2e/smoke.mjs --failures   # además detiene y reinicia contenedores
```

La prueba E2E crea **datos de prueba** (correos `@e2e.test`, títulos con prefijo `[E2E]`). Para empezar con una base limpia: `docker compose down -v` (borra volúmenes).

## Opción B · Desarrollo local

```bash
npm install                                   # instala todos los workspaces
docker run -d --name greenalert-mysql-test -e MYSQL_ROOT_PASSWORD=test-root-password -p 3307:3306 mysql:8.4
npm run typecheck && npm run lint && npm run build
npm test                                      # unitarias
npm run test:integration                      # integración (usa MySQL en :3307)
```

Para ejecutar un servicio fuera de Docker, defina sus variables (ver `docker-compose.yml`) y use `npm run build && npm start` dentro de su carpeta. Frontend en modo desarrollo:

```bash
cd frontend && npm run dev     # http://localhost:5173, reenvía /api a http://localhost:3000
```

## Scripts estandarizados (en la raíz y en cada paquete)

`npm run lint` · `npm run lint:fix` · `npm run build` · `npm run test` · `npm run test:cov` · `npm run test:integration` · `npm run typecheck`

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| `npm error ECONNRESET` al construir | Red inestable | Construir de forma secuencial (ver arriba); la caché de BuildKit reutiliza descargas. |
| Un servicio queda `unhealthy` | MySQL no listo o credenciales erróneas | `docker compose logs <servicio>`; revisar contraseñas `*_DB_PASSWORD` (solo se aplican al **crear** el volumen: si las cambia, `docker compose down -v`). |
| `Variables de entorno obligatorias ausentes` | `.env` incompleto | Completar `.env`. |
| 422 al crear un reporte | Punto fuera de Mocoa | Solo Mocoa está habilitado; un ADMIN puede habilitar otro municipio vía `PATCH /api/municipalities/:code`. |
