# 08 · Evaluación arquitectónica con ATAM

ATAM (*Architecture Tradeoff Analysis Method*, SEI) es un **método de evaluación**: examina cómo las decisiones arquitectónicas satisfacen los atributos de calidad que el negocio necesita, y hace explícitos riesgos, puntos sensibles y compromisos. No es una herramienta de software.

Esta evaluación se aplicó sobre la **implementación real** (versión 0.1.0, 25-11-2026). Para cada escenario se distingue entre lo **verificado con pruebas ejecutadas** y lo **analizado sobre el diseño**.

## Paso 1 · Presentación de la arquitectura

Microservicios NestJS (6) + API Gateway NestJS + SPA React, MySQL con *Database per Service*, REST con timeouts, Transactional Outbox y cola persistente para la entrega asíncrona, Docker Compose con redes separadas. Detalle en `02-arquitectura-general.md`, `03-diagrama-arquitectura.md` y `04-diagrama-microservicios.md`.

Tamaño medido (líneas TypeScript sin pruebas / de pruebas): gateway 551/330 · users 1032/626 · reports 1787/828 · multimedia 865/477 · geolocation 857/365 · ai 868/390 · notifications 1028/484 · frontend 2063/224.

## Paso 2 · Objetivos de negocio

| ID | Objetivo | Atributos que lo soportan |
|---|---|---|
| OB-1 | Cualquier ciudadano de Mocoa puede reportar desde el celular, sin perder su reporte. | Disponibilidad, usabilidad, rendimiento |
| OB-2 | Las autoridades reciben información confiable, geolocalizada y trazable. | Seguridad (integridad), interoperabilidad |
| OB-3 | Protección de datos personales (Ley 1581 de 2012). | Seguridad (confidencialidad) |
| OB-4 | Crecer de Mocoa al Putumayo y a nuevas capacidades (IA real, chatbot, predicción). | Escalabilidad, modificabilidad |
| OB-5 | Un equipo pequeño puede mantener y evolucionar el sistema. | Mantenibilidad |

## Paso 3 · Atributos de calidad

Seguridad, disponibilidad, rendimiento, escalabilidad, modificabilidad, mantenibilidad e interoperabilidad. Su descomposición y priorización está en el **árbol de utilidad** (`10-arbol-utilidad.md`).

## Paso 4 · Enfoques arquitectónicos identificados

| ID | Enfoque | Dónde |
|---|---|---|
| AA-1 | Microservicios con *Database per Service* (usuario MySQL por servicio con permisos solo sobre su base) | `infrastructure/mysql/init/01-databases.sh` |
| AA-2 | API Gateway delgado (enrutamiento, autenticación, límites) | `api-gateway/src` |
| AA-3 | Identidad propagada por cabeceras + clave interna compartida | `*/src/common/guards.ts`, `gateway.middleware.ts` |
| AA-4 | Timeouts en toda llamada interna | `*/src/common/http-client.ts`, `PROXY_TIMEOUT_MS` |
| AA-5 | Transactional Outbox + reintentos exponenciales | `reports/src/outbox` |
| AA-6 | Cola persistente de notificaciones con reintentos | `notifications/src/notifications` |
| AA-7 | Degradación controlada (operaciones no esenciales desacopladas) | `reports.service.ts` (`analyze`, `resolveLocation`) |
| AA-8 | Puertos y adaptadores (Strategy) para IA, canales, almacenamiento | `ImageClassifier`, `NotificationChannel`, `StoragePort` |
| AA-9 | Validación por lista blanca y por firma binaria | `ValidationPipe`, `file-signature.ts` |
| AA-10 | Contenedores con health checks y reinicio automático | `docker-compose.yml`, `Dockerfile` |

## Paso 5 · Escenarios (generados desde el árbol de utilidad)

Formato: Fuente → Estímulo → Entorno → Artefacto → Respuesta → Medida.

### AS-05 (UT-DIS-01) · La IA deja de responder durante la recepción de reportes — prioridad (A,A)

| Elemento | Valor |
|---|---|
| Fuente | Fallo interno (contenedor `ai` detenido) |
| Estímulo | Un ciudadano crea un reporte con foto y se solicita el análisis |
| Entorno | Operación normal, resto de servicios disponible |
| Artefacto | `reports` (`analyze`), `ai` |
| Respuesta esperada | El reporte se registra; el análisis queda `UNAVAILABLE`; la plataforma informa estado degradado |
| Medida | 0 reportes perdidos; creación 201; análisis 200 con `aiStatus=UNAVAILABLE` |
| **Resultado medido** | ✅ E2E `node tests/e2e/smoke.mjs --failures`: reporte 201, análisis `UNAVAILABLE`, `GET /api/health` → `degraded, ai=down`. También `reports.int-spec.ts` y `reports.service.spec.ts`. |
| Decisiones | AA-7 (análisis separado de la creación), AA-4 (timeout 3 s) |

### AS-06 (UT-DIS-02) · Notificaciones caídas durante un cambio de estado — (A,A)

| Elemento | Valor |
|---|---|
| Estímulo | Un funcionario cambia el estado con `notifications` detenido |
| Respuesta | El cambio se confirma (200); el evento queda en el outbox y se entrega al recuperarse |
| Medida | 0 notificaciones perdidas; entrega tras recuperación |
| **Resultado medido** | ✅ E2E: cambio 200; notificación `SENT` **9–14 s** después del cambio (2 ejecuciones) tras reiniciar el contenedor. |
| Decisiones | AA-5, AA-6 |

### AS-07 (UT-DIS-03) · Geolocalización caída al crear un reporte — (A,M)

| **Resultado medido** | ✅ E2E: reporte 201 con `locationStatus=PENDING`; validado (`VALIDATED`, municipio Mocoa) **4–14 s** después de reiniciar `geolocation`. |
|---|---|
| Decisiones | AA-7 (validación síncrona con caída a diferida), AA-5 |

### AS-08 (UT-DIS-04) · Terminación inesperada de un servicio — (M,M)

| **Resultado medido** | ✅ E2E: proceso principal de `reports` terminado; `RestartCount 0 → 1`; `healthy` en **5 s**; solicitudes posteriores 200. |
|---|---|
| Hallazgo | `docker kill` no dispara la política `unless-stopped` (Docker lo trata como detención manual). La primera versión de la prueba fallaba por este motivo; se documentó y se corrigió el método de simulación. |

### AS-01 (UT-SEG-01) · Reutilización de un token tras cerrar sesión — (A,M)

| **Resultado medido** | ✅ E2E: token válido (200) → logout (204) → mismo token **401 inmediatamente** (el gateway invalida su caché al procesar el logout). Con varias réplicas del gateway la ventana máxima sería el TTL de caché (30 s) — analizado, no probado. |
|---|---|
| Decisiones | AA-2, `jti` + lista de revocación en `users`, caché TTL |

### AS-04 (UT-SEG-04) · Suplantación de identidad o acceso directo a un servicio — (A,M)

| **Resultado medido** | ✅ `gateway.int-spec.ts`: cabeceras `x-user-*` y `x-internal-api-key` del cliente se eliminan; E2E: `x-user-role: ADMIN` enviado por un ciudadano → 403; `/api/…/internal/…` → 404; puertos de servicios no publicados (conexión a `:3002` rechazada). Cada servicio → 401 sin clave interna (pruebas de integración de los 6). Aislamiento de datos: el usuario `ga_reports` recibe `ERROR 1142 … SELECT command denied` al leer `greenalert_users.users`. |
|---|---|

### AS-03 (UT-SEG-03) · Archivo malicioso disfrazado de imagen — (A,M)

| **Resultado medido** | ✅ E2E y `multimedia.int-spec.ts`: ejecutable `MZ` con `Content-Type: image/jpeg` → 415 y ningún archivo escrito; SVG con script → 415; archivo > límite → 413. |
|---|---|

### AS-09 (UT-REN-01) · Dependencia lenta — (M,M)

| **Resultado medido** | ✅ `gateway.int-spec.ts`: servicio que tarda 1,5 s con `PROXY_TIMEOUT_MS=800` → **504** en ~0,8 s; el resto de servicios sigue respondiendo. `http-client.spec.ts`: corte a 100 ms. |
|---|---|
| Hallazgo | Ver RF-01: la opción `timeout` de *http-proxy* cerraba el socket del cliente; se corrigió. |

### AS-10…AS-12 · Modificabilidad

Evaluados en detalle con SAAM (`09-evaluacion-saam.md`): nueva categoría, nuevo municipio, cambio de proveedor de IA.

### AS-13 (UT-ESC-01) · Dos réplicas de `reports` — (M,M)

| Resultado | ⚠️ **Solo análisis de diseño.** El reclamo atómico de lotes (`UPDATE … LIMIT` con `locked_by`/`locked_until`) evita entregas simultáneas; los `PUT` de ubicación son idempotentes. No se ejecutó una prueba con réplicas concurrentes. |
|---|---|

### AS-14 (UT-MAN-01/02) · Regresiones bloqueadas por CI

| Resultado | ⚠️ El pipeline (`.github/workflows/ci.yml`) está definido; localmente se ejecutaron exactamente sus comandos con éxito (typecheck, lint con `--max-warnings=0`, build, 278 pruebas unitarias, 96 de integración, `npm audit`). **No se ha ejecutado en GitHub** porque el repositorio no tiene remoto configurado. |
|---|---|

## Paso 6 · Análisis de decisiones arquitectónicas

| Decisión | Atributos favorecidos | Atributos afectados | Observación |
|---|---|---|---|
| D1 · Análisis IA como operación independiente de la creación | Disponibilidad | Experiencia (dos llamadas desde el frontend) | Verificado en AS-05. |
| D2 · Outbox en MySQL en lugar de un broker | Simplicidad, consistencia transaccional | Latencia de entrega (sondeo cada 5 s), escalabilidad del sondeo | Verificado en AS-06. |
| D3 · Validación de cobertura síncrona con caída a diferida | Disponibilidad + UX (rechazo inmediato fuera de cobertura) | Consistencia: un reporte puede quedar `OUT_OF_COVERAGE` después de aceptado | Verificado en AS-07. |
| D4 · Revocación consultada a `users` (fail-closed) | Seguridad | Disponibilidad (users en la ruta crítica) | PC-01. |
| D5 · Identidad por cabeceras + clave interna | Rendimiento (los servicios no verifican JWT), desacoplamiento | Seguridad si se filtra la clave interna | PS-02. |
| D6 · Un servidor MySQL con 6 bases | Costo/simplicidad local | Disponibilidad (SPOF) | R-ATAM-02. |
| D7 · Código transversal copiado por servicio | Independencia de despliegue | Mantenibilidad | TD-01. |
| D8 · Proyección geográfica propia en `geolocation` | Autonomía de consultas espaciales y mapa público | Duplicación de datos, consistencia eventual | RA-11. |

## Paso 7 · Riesgos

| ID | Riesgo | Decisión relacionada |
|---|---|---|
| R-ATAM-01 | `users` es dependencia de toda solicitud autenticada (mitigado por caché de 30 s, no eliminado). | D4 |
| R-ATAM-02 | MySQL y el gateway son puntos únicos de fallo en el despliegue actual. | D6 |
| R-ATAM-03 | La clave interna compartida es un secreto de alto valor: su filtración permite suplantar identidades dentro de la red interna. | D5 |
| R-ATAM-04 | El catálogo de categorías y estados está repetido en varios servicios (modificabilidad). | TD-14, TD-15 |
| R-ATAM-05 | La cobertura geográfica usa rectángulos aproximados. | TD-06 |
| R-ATAM-06 | La "IA" actual no analiza imágenes. | TD-10 |

**No-riesgos** (decisiones verificadas como adecuadas): D1, D2 y D3 para disponibilidad; validación binaria de archivos; aislamiento de bases por usuario MySQL; bloqueo de rutas `/internal`.

## Paso 8 · Puntos sensibles

| ID | Punto sensible | Por qué |
|---|---|---|
| PS-01 | `HTTP_TIMEOUT_MS` / `PROXY_TIMEOUT_MS` | Muy alto: latencias en cascada; muy bajo: falsos "no disponible" con la IA real (más lenta). |
| PS-02 | `INTERNAL_API_KEY` | Toda la confianza interna depende de un único secreto. |
| PS-03 | `REVOCATION_CACHE_TTL_MS` | Balancea carga sobre `users` frente a la ventana de revocación entre réplicas. |
| PS-04 | `OUTBOX_INTERVAL_MS` y retroceso | Definen la latencia de notificaciones y de la proyección del mapa (medido: 4–14 s tras recuperación). |
| PS-05 | Límites de *rate limiting* | Protección frente a fuerza bruta vs. bloqueo de usuarios tras NAT compartida (frecuente en redes móviles). |

## Paso 9 · Puntos de compromiso (tradeoffs)

| ID | Compromiso | Elección actual |
|---|---|---|
| PC-01 | **Seguridad vs. disponibilidad** en la verificación de revocación: si `users` cae, ¿aceptar tokens (fail-open) o rechazarlos (fail-closed)? | Fail-closed: se prioriza OB-3. La caché reduce el impacto. Verificado: 503 si `users` no responde. |
| PC-02 | **Consistencia vs. disponibilidad** en la ubicación del reporte (D3). | Disponibilidad: se acepta el reporte y se valida después. |
| PC-03 | **Independencia vs. mantenibilidad** del código común (D7). | Independencia; deuda TD-01 registrada con solución. |
| PC-04 | **Simplicidad vs. escalabilidad** del outbox en MySQL frente a un broker (D2). | Simplicidad (REST obligatorio, sin tecnologías innecesarias). Revisar al superar el volumen que soporte el sondeo. |
| PC-05 | **Privacidad vs. utilidad** del mapa público. | Se publican ubicación, categoría y estado, nunca el autor. |

## Paso 10 · Resultados y recomendaciones

1. **Disponibilidad (OB-1)**: los cuatro escenarios de fallo priorizados se **verificaron en el sistema desplegado** (21/21 pasos E2E). La arquitectura cumple el requisito de registrar reportes con la IA, las notificaciones o la geolocalización fuera de servicio.
2. **Seguridad (OB-2, OB-3)**: controles verificados por pruebas (cabeceras, rutas internas, archivos, revocación, fuerza bruta, aislamiento de bases). Recomendación: migrar a JWT asimétrico (TD-13) y cookie HttpOnly (TD-08); gestionar `INTERNAL_API_KEY` en un gestor de secretos con rotación, o evolucionar a mTLS entre servicios.
3. **Escalabilidad (OB-4)**: servicios sin estado salvo la caché de revocación y el volumen de evidencias. Recomendación: almacenamiento de objetos (TD-17) y prueba real de réplicas (AS-13).
4. **Modificabilidad (OB-4, OB-5)**: ver SAAM. Recomendación prioritaria: catálogo único de categorías/estados (TD-14/TD-15).
5. **Infraestructura**: MySQL y gateway en alta disponibilidad antes de producción (R-ATAM-02).
