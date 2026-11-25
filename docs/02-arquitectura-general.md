# 02 · Arquitectura general

## 1. Estilo arquitectónico

GreenAlert usa una **arquitectura de microservicios** con un **API Gateway** como único punto de entrada para el frontend. Cada microservicio es una aplicación NestJS independiente (su propio `package.json`, `main.ts`, `Dockerfile`, configuración, migraciones, pruebas y base de datos MySQL).

Principios aplicados:

| Principio | Aplicación concreta |
|---|---|
| Responsabilidad única por servicio | Seis servicios alineados con subdominios: identidad, reportes, evidencias, geografía, clasificación, notificación. |
| Database per Service | Seis bases de datos (`greenalert_users`, `greenalert_reports`, …) con un usuario MySQL distinto por servicio y permisos **solo** sobre su base (ver `infrastructure/mysql/init/01-databases.sql`). |
| Comunicación por API | REST/JSON síncrono con timeout; nunca acceso a tablas ajenas. |
| Degradación controlada | Las dependencias no esenciales (`ai`, `notifications`, `geolocation` para la proyección del mapa) se invocan con timeout y, si fallan, se reintenta mediante **Transactional Outbox** en `reports`. |
| Gateway delgado | El gateway enruta, autentica (verifica JWT), limita solicitudes, aplica CORS/cabeceras de seguridad y normaliza errores. No contiene reglas de negocio. |
| Confianza cero en la red interna (básica) | Los servicios exigen la cabecera `x-internal-api-key`; el gateway elimina cualquier cabecera `x-user-*` que venga del cliente antes de inyectar la identidad verificada. |

## 2. Componentes

| Componente | Puerto interno | Base de datos | Responsabilidad |
|---|---|---|---|
| `frontend` | 80 (Nginx) / 5173 (dev) | — | SPA React + Vite + TypeScript. Consume solo el gateway. |
| `api-gateway` | 3000 (publicado) | — | Enrutamiento, autenticación JWT, revocación, rate limiting, CORS, Helmet, Swagger agregado, health agregado. |
| `users` | 3001 | `greenalert_users` | Registro, login, logout, perfiles, roles, administración de usuarios, lista de revocación de tokens. |
| `reports` | 3002 | `greenalert_reports` | Ciclo de vida del reporte, máquina de estados, asignación, observaciones, historial, estadísticas, outbox. |
| `multimedia` | 3003 | `greenalert_multimedia` + volumen `uploads` | Recepción, validación (firma binaria, tamaño), almacenamiento y descarga de evidencias. |
| `geolocation` | 3004 | `greenalert_geolocation` | Municipios y cobertura, validación de coordenadas, proyección geográfica de reportes, consultas por zona, GeoJSON. |
| `ai` | 3005 | `greenalert_ai` | Clasificación sugerida mediante un puerto `ImageClassifier` (proveedor heurístico de prueba o HTTP externo). |
| `notifications` | 3006 | `greenalert_notifications` | Plantillas, cola persistente de notificaciones, reintentos con retroceso exponencial, canal correo (SMTP), historial. |
| `mysql` | 3306 (no publicado) | — | Un servidor MySQL 8 con seis bases aisladas. |
| `mailpit` | 1025/8025 | — | Servidor SMTP de **desarrollo** que captura correos (no se usa en producción). |

## 3. Comunicación

### 3.1 Externa (cliente → gateway)

- HTTPS en producción (terminación TLS en un proxy/ingress; en local HTTP).
- `Authorization: Bearer <JWT>` (HS256, `sub`, `email`, `role`, `jti`, `exp`).
- Rutas públicas: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/municipalities`, `GET /api/locations/geojson`, `GET /api/health`, `/api/docs`.
- Cualquier ruta con segmento `/internal` es bloqueada por el gateway (404).

### 3.2 Interna (gateway → servicios, servicio → servicio)

| Origen | Destino | Operación | Modo | Si el destino falla |
|---|---|---|---|---|
| gateway | users | `GET /internal/auth/revoked/:jti` | síncrono, caché 30 s | Se rechaza la solicitud (fail-closed, 503). |
| users | notifications | `POST /internal/notifications` (registro) | síncrono, timeout, *fire-and-forget* | Se registra el error; el registro del usuario continúa. (Deuda TD-03) |
| reports | geolocation | `POST /internal/locations/validate` | síncrono, timeout | Si 422 → reporte rechazado (fuera de cobertura). Si no responde → se acepta y se valida después vía outbox. |
| reports | geolocation | `PUT /internal/locations/:reportId` | outbox, asíncrono | Reintento con retroceso. |
| reports | notifications | `POST /internal/notifications` | outbox, asíncrono | Reintento con retroceso. |
| reports | multimedia | `GET /internal/evidences?reportId=` | síncrono (análisis IA) | El análisis queda `UNAVAILABLE`; el reporte no se afecta. |
| reports | ai | `POST /internal/classifications` | síncrono, timeout | El análisis queda `UNAVAILABLE`; puede reintentarse. |
| reports | users | `GET /internal/users/:id` (validar responsable al asignar) | síncrono, timeout | 503: la asignación se reintenta; el resto del flujo no se afecta. |
| multimedia | reports | `GET /internal/reports/:id/access` | síncrono | 503: no se aceptan archivos sin verificar el propietario. |
| notifications | users | `GET /internal/users/:id`, `GET /internal/users?roles=` | síncrono | La notificación queda pendiente y se reintenta. |

Cabeceras internas: `x-internal-api-key` (secreto compartido), `x-user-id`, `x-user-role`, `x-user-email`, `x-request-id` (trazabilidad).

### 3.3 ¿Por qué REST y no un broker de mensajes?

El enunciado fija REST como mecanismo de comunicación y pide no añadir tecnologías innecesarias. La entrega asíncrona fiable se resuelve con el patrón **Transactional Outbox** sobre MySQL dentro de `reports` (y una cola persistente en `notifications`). La sustitución por un broker (RabbitMQ/Kafka) queda documentada como evolución en ADR-006.

## 4. Flujo principal: creación de un reporte

1. El ciudadano envía `POST /api/reports` al gateway con su JWT.
2. El gateway verifica firma, caducidad y revocación; inyecta `x-user-*` y reenvía a `reports`.
3. `reports` valida el DTO y consulta `geolocation` (`validate`) con timeout:
   - `200` → guarda el municipio resuelto.
   - `422` → responde 422 al cliente (fuera de cobertura).
   - error/timeout → guarda `locationStatus = PENDING` (validación diferida).
4. En **una transacción** guarda `report`, `report_history` y eventos `outbox_events` (`LOCATION_UPSERT`, `NOTIFY_STAFF_NEW_REPORT`, `NOTIFY_AUTHOR_CREATED`).
5. Responde `201`. El despachador del outbox entrega los eventos a `geolocation` y `notifications` con reintentos.
6. El frontend sube las fotos (`POST /api/evidences`, multipart). `multimedia` verifica el propietario con `reports`, valida la firma binaria y guarda el archivo en disco y los metadatos en MySQL.
7. El frontend solicita `POST /api/reports/:id/analysis`. `reports` obtiene las referencias de evidencias, llama a `ai` y guarda la sugerencia (`aiSuggestedCategory`, `aiConfidence`). Si `ai` no responde, el estado del análisis queda `UNAVAILABLE` y el reporte sigue intacto.

## 5. Datos (Database per Service)

| Base | Tablas principales | Propietario |
|---|---|---|
| `greenalert_users` | `users`, `revoked_tokens` | users |
| `greenalert_reports` | `reports`, `report_history`, `report_observations`, `outbox_events` | reports |
| `greenalert_multimedia` | `evidences` | multimedia |
| `greenalert_geolocation` | `municipalities`, `report_locations` | geolocation |
| `greenalert_ai` | `classifications` | ai |
| `greenalert_notifications` | `notifications` | notifications |

Las referencias entre servicios (`reportId`, `userId`) son **identificadores lógicos** (UUID) sin claves foráneas cruzadas. Las claves foráneas solo existen dentro de una misma base (p. ej. `report_history.report_id → reports.id`).

Migraciones: cada servicio tiene sus migraciones TypeORM en `src/database/migrations` y las ejecuta al arrancar (`migrationsRun: true`, `synchronize: false`).

## 6. Seguridad (resumen)

Ver `docs/13-seguridad.md`. Elementos clave: bcrypt, JWT con `jti` y revocación, roles, `ValidationPipe` con lista blanca, consultas parametrizadas de TypeORM, Helmet, CORS restringido, rate limiting, validación binaria de archivos, nombres de archivo generados (UUID), clave interna entre servicios, filtros de excepciones que no filtran trazas.

## 7. Calidad

ESLint (TypeScript estricto, reglas de promesas, tipos inseguros y duplicación con `eslint-plugin-sonarjs`), Prettier, Jest (unitarias + integración), SonarQube (`sonar-project.properties`), `npm audit`, GitHub Actions con jobs bloqueantes.

## 8. Despliegue

Docker Compose para el entorno local con health checks, `restart: unless-stopped`, volúmenes persistentes (`mysql-data`, `uploads`), redes `public` e `internal` (los servicios solo están en la red interna). Ver `docs/14-despliegue.md`.
