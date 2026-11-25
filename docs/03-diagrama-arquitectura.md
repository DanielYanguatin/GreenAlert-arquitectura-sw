# 03 · Diagramas de arquitectura

## 1. Contexto (C4 nivel 1)

```mermaid
flowchart LR
  ciudadano([Ciudadano])
  funcionario([Funcionario / Gestor ambiental])
  admin([Administrador])
  ga[[GreenAlert]]
  smtp[(Servidor SMTP)]
  osm[(Teselas OpenStreetMap)]
  ent[/Entidades ambientales<br/>Corpoamazonia, Alcaldía de Mocoa,<br/>Gobernación, PNN, MinAmbiente/]

  ciudadano -- reporta, consulta seguimiento --> ga
  funcionario -- revisa, gestiona, asigna --> ga
  admin -- administra usuarios y cobertura --> ga
  ga -- envía correos --> smtp
  ciudadano -. carga mapa .-> osm
  ga -. integración futura, sin conexión actual .-> ent
```

## 2. Contenedores (C4 nivel 2)

```mermaid
flowchart TB
  subgraph Cliente
    spa[Frontend SPA<br/>React + Vite + TS<br/>Nginx]
  end

  subgraph red_publica[Red public]
    gw[API Gateway<br/>NestJS :3000<br/>JWT · rate limit · CORS · Helmet]
  end

  subgraph red_interna[Red internal]
    users[users :3001]
    reports[reports :3002]
    mm[multimedia :3003]
    geo[geolocation :3004]
    ai[ai :3005]
    notif[notifications :3006]
    mysql[(MySQL 8<br/>6 bases aisladas)]
    vol[(Volumen uploads)]
    mail[Mailpit SMTP<br/>solo desarrollo]
  end

  spa -- HTTPS /api --> gw
  gw --> users & reports & mm & geo & ai & notif
  reports -- validate / outbox --> geo
  reports -- outbox --> notif
  reports -- referencias --> mm
  reports -- clasificar --> ai
  reports -- validar responsable --> users
  mm -- verificar propietario --> reports
  notif -- destinatarios --> users
  users -- bienvenida --> notif
  notif -- SMTP --> mail

  users --- mysql
  reports --- mysql
  mm --- mysql
  geo --- mysql
  ai --- mysql
  notif --- mysql
  mm --- vol
```

## 3. Secuencia: creación de reporte con degradación controlada

```mermaid
sequenceDiagram
  autonumber
  actor C as Ciudadano
  participant F as Frontend
  participant G as Gateway
  participant U as users
  participant R as reports
  participant GEO as geolocation
  participant M as multimedia
  participant A as ai
  participant N as notifications

  C->>F: Completa formulario + fotos
  F->>G: POST /api/reports (JWT)
  G->>G: Verifica firma y caducidad
  G->>U: ¿jti revocado? (caché 30 s)
  U-->>G: no
  G->>R: POST /reports (+x-user-*, x-internal-api-key)
  R->>GEO: POST /internal/locations/validate (timeout 3 s)
  alt dentro de cobertura
    GEO-->>R: 200 {municipio}
  else fuera de cobertura
    GEO-->>R: 422
    R-->>F: 422 Ubicación fuera de cobertura
  else geolocation caído
    GEO--xR: timeout
    R->>R: locationStatus = PENDING
  end
  R->>R: TX: report + history + outbox_events
  R-->>F: 201 {id}
  loop despachador outbox (cada 5 s)
    R->>GEO: PUT /internal/locations/:id
    R->>N: POST /internal/notifications
  end
  F->>G: POST /api/evidences (multipart)
  G->>M: reenvío en streaming
  M->>R: GET /internal/reports/:id/access
  M->>M: Firma binaria + tamaño + SHA-256 → disco
  M-->>F: 201 [evidencias]
  F->>G: POST /api/reports/:id/analysis
  G->>R: reenvío
  R->>M: GET /internal/evidences?reportId
  R->>A: POST /internal/classifications
  alt ai disponible
    A-->>R: {categoría sugerida, confianza}
  else ai caído
    A--xR: error
    R->>R: aiStatus = UNAVAILABLE
  end
  R-->>F: 200 estado del análisis
```

## 4. Despliegue local (Docker Compose)

```mermaid
flowchart LR
  host((Host))
  host -- :8080 --> fe[frontend]
  host -- :3000 --> gw[api-gateway]
  host -- :8025 --> mp[mailpit UI]
  fe --> gw
  gw --> s1[users] & s2[reports] & s3[multimedia] & s4[geolocation] & s5[ai] & s6[notifications]
  s1 & s2 & s3 & s4 & s5 & s6 --> db[(mysql<br/>volumen mysql-data)]
  s3 --> up[(volumen uploads)]
```

Solo `frontend`, `api-gateway` y la interfaz de Mailpit se publican en el host. MySQL y los microservicios únicamente son accesibles en la red `internal`.
