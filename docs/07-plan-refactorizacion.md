# 07 · Refactorización arquitectónica

## Parte A — Refactorizaciones realizadas (con evidencia)

Cada refactorización conservó la funcionalidad existente; las pruebas indicadas se ejecutaron antes y después.

### RF-01 · Timeout del proxy del gateway

| Campo | Detalle |
|---|---|
| Situación inicial | El proxy usaba las opciones `timeout` y `proxyTimeout` de `http-proxy-middleware`. |
| Problema | Ante un servicio lento, `timeout` cerraba el **socket del cliente** ("socket hang up") en lugar de responder un error controlado. El escenario UT-REN-01 fallaba. |
| Cambio | Se eliminó `timeout`; solo se usa `proxyTimeout` (hacia el servicio), que activa el manejador de error → **504** JSON. |
| Justificación | El cliente debe recibir una respuesta normalizada; el corte aplica solo a la conexión con el servicio. |
| Resultado | Respuesta 504 con mensaje claro; el resto de servicios sigue disponible. |
| Pruebas | `api-gateway/test/gateway.int-spec.ts` «servicio lento → 504»: falló antes, pasó después (2 ejecuciones consecutivas). |

### RF-02 · Registro del cliente de API en el frontend

| Campo | Detalle |
|---|---|
| Situación inicial | `AuthProvider` registraba el proveedor de token del cliente HTTP en un `useEffect`. |
| Problema | En React los efectos de los hijos se ejecutan **antes** que los del padre: las primeras solicitudes de una página salían sin token. |
| Cambio | Registro síncrono e idempotente durante el render del proveedor. |
| Resultado | Todas las solicitudes llevan el token desde el primer render. |
| Pruebas | `frontend/test/components.spec.tsx` y verificación manual de la carga del panel. |

### RF-03 · Construcción de imágenes Docker

| Campo | Detalle |
|---|---|
| Situación inicial | 8 imágenes descargaban dependencias npm en paralelo sin caché compartida. |
| Problema | Fallos de red `ECONNRESET` y, tras añadir caché, `ENOTEMPTY` por acceso concurrente a la caché desde dos etapas. |
| Cambio | Caché de BuildKit (`--mount=type=cache,sharing=locked`), reintentos de npm y construcción secuencial en local. |
| Resultado | Construcción reproducible de las 8 imágenes (ver `14-despliegue.md`). |

### RF-04 · Actualización de nodemailer (seguridad)

Situación: `nodemailer@8` con vulnerabilidad alta (GHSA-p6gq-j5cr-w38f y otras). Cambio: actualización mayor a 10.6.1 y retiro de `@types/nodemailer`. Pruebas: 33 unitarias + 10 de integración de `notifications` en verde después del cambio.

### RF-05 · Eliminación de código muerto en geolocation

`geolocation` no tiene dependencias salientes; se eliminó el cliente HTTP copiado de la plantilla. Compilación, lint y 27 pruebas unitarias en verde.

### RF-06 · Decisión preventiva: categoría como VARCHAR

Antes de escribir la migración de `reports` se decidió almacenar `category` como `VARCHAR(40)` validado en código (no `ENUM`), para que agregar una categoría no requiera migración. SAAM S-01 confirmó el beneficio y reveló que `status` (ENUM) sí la requiere (TD-15).

## Parte B — Plan de refactorización pendiente

Priorizado según la matriz de riesgos y el registro de deuda. Ninguna de estas refactorizaciones se ha ejecutado todavía.

| Orden | Refactorización | Deuda/Riesgo | Cambio propuesto | Criterio de aceptación |
|---|---|---|---|---|
| 1 | Geometrías oficiales | TD-06 | Columnas `POLYGON` + índice `SPATIAL`; `ST_Contains` en `resolve()`. | Pruebas de integración existentes de geolocation en verde + casos de borde con polígonos reales. |
| 2 | Paquete `@greenalert/service-kit` | TD-01, TD-02 | Extraer guards, filtro, cliente HTTP, validación de entorno y cola persistente. Versionado semántico; cada servicio fija versión. | Las 278 pruebas unitarias y 96 de integración en verde; diff de cada servicio reducido a imports. |
| 3 | Catálogo de categorías único | TD-14 | `GET /reports/categories` como fuente; notifications/frontend lo consumen con caché. | SAAM S-01 pasa de 4 a 1 componente modificado. |
| 4 | Estados como VARCHAR | TD-15 | Migración `ALTER TABLE … MODIFY status VARCHAR(20)` + validación existente. | SAAM S-05 sin migración. |
| 5 | TypeORM 1.x | TD-07 | Actualización mayor guiada por las pruebas de integración. | `npm audit --omit=dev`: 0 vulnerabilidades. |
| 6 | Sesión en cookie HttpOnly | TD-08 | El gateway emite/borra la cookie; CSRF *double-submit*. | Pruebas del gateway para cookie y CSRF. |
| 7 | Almacenamiento de objetos | TD-17 | Adaptador S3/MinIO del `StoragePort`. | Pruebas de `multimedia` con el nuevo adaptador. |
