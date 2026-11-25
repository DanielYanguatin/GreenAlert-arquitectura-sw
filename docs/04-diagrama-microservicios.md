# 04 · Diagrama de microservicios

## 1. Estructura interna común

Todos los servicios siguen la misma organización por capas (cada uno con su propio código; no hay librería compartida en tiempo de ejecución, ver ADR-004):

```mermaid
flowchart TB
  main[main.ts<br/>ValidationPipe · Swagger · filtro de errores] --> app[AppModule]
  app --> cfg[config/<br/>validación de variables de entorno]
  app --> db[database/<br/>DataSource · migraciones]
  app --> common[common/<br/>guards internos · roles · decoradores · filtros]
  app --> health[health/<br/>GET /health]
  app --> dom[Módulo de dominio<br/>controller → service → repository TypeORM]
  dom --> clients[clients/<br/>clientes HTTP con timeout hacia otros servicios]
```

Capas: **Controller** (HTTP, DTO, Swagger) → **Service** (reglas de negocio, transacciones) → **Repository** (TypeORM) / **Client** (HTTP a otros servicios). Las dependencias externas se inyectan por interfaz (tokens de Nest) para poder sustituirlas en pruebas.

## 2. Endpoints por servicio

| Servicio | Endpoints públicos (vía gateway `/api`) | Endpoints internos (`/internal`, no enrutados) |
|---|---|---|
| users | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PATCH /users/me`, `GET /users`, `GET /users/staff`, `PATCH /users/:id/role`, `PATCH /users/:id/status` | `GET /internal/auth/revoked/:jti`, `GET /internal/users/:id`, `GET /internal/users?roles=` |
| reports | `POST /reports`, `GET /reports`, `GET /reports/mine`, `GET /reports/stats`, `GET /reports/:id`, `PATCH /reports/:id`, `PATCH /reports/:id/status`, `PATCH /reports/:id/assignment`, `POST /reports/:id/observations`, `GET /reports/:id/history`, `POST /reports/:id/analysis` | `GET /internal/reports/:id/access` |
| multimedia | `POST /evidences` (multipart), `GET /evidences?reportId=`, `GET /evidences/:id/file`, `DELETE /evidences/:id` | `GET /internal/evidences?reportId=`, `GET /internal/evidences/:id/file` |
| geolocation | `GET /municipalities`, `GET /locations/geojson`, `GET /locations/near`, `GET /locations?municipality=` , `PATCH /municipalities/:code` (ADMIN) | `POST /internal/locations/validate`, `PUT /internal/locations/:reportId` |
| ai | `GET /classifications?reportId=`, `GET /classifications/categories` | `POST /internal/classifications` |
| notifications | `GET /notifications/me`, `PATCH /notifications/:id/read`, `GET /notifications` y `GET /notifications/stats` (ADMIN) | `POST /internal/notifications` |

Todos exponen `GET /health` y Swagger en `/docs` (JSON en `/docs-json`). El gateway agrega los seis documentos en `/api/docs`.

## 3. Modelo de datos por servicio

### users (`greenalert_users`)

```mermaid
erDiagram
  users {
    char36 id PK
    varchar email UK
    varchar password_hash
    varchar full_name
    varchar phone
    enum role "ADMIN|CIUDADANO|FUNCIONARIO|GESTOR_AMBIENTAL"
    varchar entity "entidad ambiental (opcional)"
    boolean active
    datetime created_at
    datetime updated_at
  }
  revoked_tokens {
    char36 jti PK
    char36 user_id
    datetime expires_at "índice para depuración"
    datetime revoked_at
  }
```

### reports (`greenalert_reports`)

```mermaid
erDiagram
  reports ||--o{ report_history : tiene
  reports ||--o{ report_observations : tiene
  reports {
    char36 id PK
    char36 user_id "lógico → users"
    varchar title
    text description
    varchar category "índice"
    enum status "índice"
    decimal latitude
    decimal longitude
    varchar address
    varchar municipality_code
    enum location_status "VALIDATED|PENDING"
    char36 assigned_to "lógico → users"
    varchar ai_suggested_category
    decimal ai_confidence
    enum ai_status "NOT_REQUESTED|COMPLETED|UNAVAILABLE"
    datetime created_at
    datetime updated_at
  }
  report_history {
    char36 id PK
    char36 report_id FK
    varchar action
    varchar from_value
    varchar to_value
    char36 changed_by
    varchar comment
    datetime created_at
  }
  report_observations {
    char36 id PK
    char36 report_id FK
    char36 author_id
    text text
    datetime created_at
  }
  outbox_events {
    char36 id PK
    varchar type
    json payload
    enum status "PENDING|SENT|FAILED"
    int attempts
    datetime next_attempt_at "índice (status, next_attempt_at)"
    varchar last_error
  }
```

### multimedia (`greenalert_multimedia`)

```mermaid
erDiagram
  evidences {
    char36 id PK
    char36 report_id "lógico → reports, índice"
    char36 uploader_id
    varchar original_name
    varchar stored_name UK "UUID + extensión real"
    varchar mime_type "detectado por firma"
    int size_bytes
    char64 sha256
    datetime created_at
  }
```

### geolocation (`greenalert_geolocation`)

```mermaid
erDiagram
  municipalities ||--o{ report_locations : contiene
  municipalities {
    varchar code PK "DANE"
    varchar name
    varchar department
    boolean enabled
    decimal min_lat
    decimal max_lat
    decimal min_lng
    decimal max_lng
    decimal center_lat
    decimal center_lng
  }
  report_locations {
    char36 report_id PK "lógico → reports"
    decimal latitude "índice (lat,lng)"
    decimal longitude
    varchar municipality_code FK
    varchar category
    varchar status
    varchar title
    datetime reported_at
  }
```

### ai (`greenalert_ai`)

```mermaid
erDiagram
  classifications {
    char36 id PK
    char36 report_id "índice"
    json evidence_ids
    varchar suggested_category
    decimal confidence
    json scores
    varchar provider
    varchar model_version
    boolean requires_review
    datetime created_at
  }
```

### notifications (`greenalert_notifications`)

```mermaid
erDiagram
  notifications {
    char36 id PK
    char36 recipient_user_id "índice"
    varchar recipient_email
    enum channel "EMAIL"
    enum type "REGISTRO|REPORTE_RECIBIDO|NUEVO_REPORTE|CAMBIO_ESTADO|ASIGNACION|ALERTA"
    varchar subject
    text body
    enum status "PENDING|SENT|FAILED"
    int attempts
    datetime next_attempt_at
    varchar last_error
    boolean is_read
    datetime sent_at
    datetime created_at
  }
```

## 4. Matriz de dependencias entre servicios

| ↓ llama a → | users | reports | multimedia | geolocation | ai | notifications |
|---|---|---|---|---|---|---|
| gateway | ● (revocación) | ● | ● | ● | ● | ● |
| users | — | | | | | ○ |
| reports | ● (asignación) | — | ● | ● / ○ | ● | ○ |
| multimedia | | ● | — | | | |
| geolocation | | | | — | | |
| ai | | | | | — | |
| notifications | ● | | | | | — |

● síncrona · ○ asíncrona (outbox / fire-and-forget). No hay ciclos síncronos: `multimedia → reports` y `reports → multimedia` ocurren en flujos distintos (subida vs. análisis) y ninguno espera al otro de forma recursiva.
