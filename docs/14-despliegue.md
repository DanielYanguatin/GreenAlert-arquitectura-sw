# 14 · Despliegue

## 1. Entorno local con Docker Compose (verificado)

| Elemento | Configuración |
|---|---|
| Servicios | `mysql`, `mailpit`, 6 microservicios, `api-gateway`, `frontend` (10 contenedores) |
| Redes | `internal` (`internal: true`, sin salida a Internet): MySQL, microservicios, Mailpit · `public`: gateway, frontend, Mailpit UI |
| Puertos publicados | `8080` frontend, `3000` gateway, `127.0.0.1:8025` Mailpit UI. MySQL y microservicios **no** se publican. |
| Health checks | MySQL (`mysqladmin ping`), cada servicio (`GET /health` con `SELECT 1`), gateway (`/api/health/live`), frontend (`wget /`) |
| Reinicio | `restart: unless-stopped` en todos |
| Volúmenes | `mysql-data`, `mysql-backups`, `uploads` |
| Dependencias | Los servicios esperan a `mysql` *healthy*; el gateway arranca aunque algún servicio no esté listo (responde 503 para ese servicio) |
| Logs | Driver `json-file` con rotación (10 MB × 3) |

### Resultado de la verificación (25-11-2026)

- Construcción de las 8 imágenes: correcta (secuencial; tamaños: servicios ≈ 378 MB, gateway 333 MB, frontend 74 MB).
- `docker compose up -d`: 10 contenedores en estado `healthy`.
- `GET /api/health` → `{"status":"ok", …6 servicios "up"}`.
- E2E: 21/21 (ver `11-estrategia-pruebas.md`).

### Problemas encontrados al construir y su solución

1. `ECONNRESET` al descargar paquetes npm en 8 construcciones paralelas → caché BuildKit + reintentos + construcción secuencial.
2. `ENOTEMPTY` en la caché compartida → `sharing=locked`.
3. Volumen `uploads` sin permisos para el usuario `node` → directorio creado con propietario `node` en la imagen.

## 2. Respaldo y restauración

```bash
# Respaldo lógico de las 6 bases (comprimido, con retención de 14 copias)
docker compose exec mysql /backup/backup.sh
# Restaurar una base
gunzip < respaldo/greenalert_reports.sql.gz | docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" greenalert_reports'
# Evidencias (volumen uploads)
docker run --rm -v greenalert-arquitectura-sw_uploads:/data -v "$PWD":/out alpine tar czf /out/uploads.tgz -C /data .
```

Estrategia recomendada: respaldo diario de bases + evidencias, copia fuera del servidor, prueba de restauración mensual. **Estado**: el script existe; la restauración no se ha ensayado en este entorno.

## 3. Despliegue en producción (requisitos — no verificados)

El sistema **no se declara listo para producción**. Antes de un despliegue controlado se requiere:

| Requisito | Estado |
|---|---|
| TLS en un *ingress*/proxy con certificados válidos; `TRUST_PROXY` ajustado | Pendiente |
| Secretos en un gestor (no `.env` en el servidor) y rotación | Pendiente |
| MySQL gestionado o con réplica y respaldos automáticos verificados | Pendiente (TD-11) |
| ≥ 2 réplicas de gateway y servicios detrás de balanceador | Pendiente; requiere almacenamiento de objetos para evidencias (TD-17) |
| SMTP real (sin Mailpit) | Pendiente |
| Observabilidad: logs centralizados, métricas, alertas | Pendiente (TD-12, ver `infrastructure/monitoring/README.md`) |
| Escaneo de imágenes y DAST | Pendiente |
| Pipeline de CI ejecutado en GitHub con protección de rama | Pendiente (sin remoto configurado) |
| Geometrías oficiales de municipios | Pendiente (TD-06) |
| Aviso de privacidad y autorización de tratamiento de datos (Ley 1581) | Pendiente |

### Orquestación sugerida
Las imágenes son independientes y sin estado (excepto `multimedia` por el volumen), por lo que pueden desplegarse en Kubernetes o en un servicio de contenedores gestionado: un `Deployment` por servicio, `Service` interno, `Ingress` solo para frontend y gateway, `NetworkPolicy` equivalente a la red `internal`, sondas `readiness` y `liveness` sobre `/health`.

## 4. Orden de despliegue de cambios con contrato

Cuando un cambio modifica un contrato entre servicios, desplegar primero el **consumidor tolerante** (p. ej. `geolocation` aceptando un nuevo estado) y después el **productor** (`reports`); ver SAAM S-05.
