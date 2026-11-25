# 11 · Estrategia y resultados de pruebas

## 1. Niveles de prueba

| Nivel | Herramienta | Alcance | Dependencias | Comando |
|---|---|---|---|---|
| Unitarias | Jest + ts-jest | Dominio, servicios, guards, clientes HTTP, clasificadores, plantillas, componentes React | Ninguna (repositorios y puertos simulados) | `npm test` / `npm run test:cov` |
| Integración | Jest + Supertest | Aplicación Nest completa por servicio: HTTP real, validación, guards, **MySQL real**, migraciones; vecinos simulados con un servidor HTTP local (`test/stub-server.ts`) | MySQL 8 (Docker local en `:3307`, servicio `mysql` en CI) | `npm run test:integration` |
| Extremo a extremo | Script Node (`tests/e2e/smoke.mjs`) | Sistema desplegado con Docker Compose a través de Nginx → gateway → servicios → MySQL/Mailpit | Stack completo | `node tests/e2e/smoke.mjs [--failures]` |

Las pruebas de integración de cada servicio crean su propia base `greenalert_<servicio>_test` (se elimina y recrea en cada ejecución), por lo que son independientes entre sí.

## 2. Cobertura de los casos exigidos

| Caso | Dónde se prueba |
|---|---|
| Registro de usuarios | `users/auth.service.spec.ts`, `users/test/users.int-spec.ts`, E2E |
| Inicio de sesión | ídem + `api-gateway/auth/token-verifier.spec.ts` |
| Creación / actualización / consulta de reportes | `reports/reports.service.spec.ts`, `reports/test/reports.int-spec.ts`, E2E |
| Carga de fotografías | `multimedia/evidences.service.spec.ts`, `file-signature.spec.ts`, `multimedia.int-spec.ts`, E2E |
| Validación de coordenadas | `geolocation/geo.spec.ts`, `geolocation.int-spec.ts`, `reports.int-spec.ts` |
| Clasificación de imágenes | `ai/classifiers.spec.ts`, `ai.int-spec.ts`, E2E |
| Envío de notificaciones | `notifications/*.spec.ts`, `notifications.int-spec.ts`, E2E (Mailpit) |
| Comunicación entre servicios | Pruebas de integración con servidor simulado (verifican ruta, método, cabecera `x-internal-api-key` y cuerpo) + E2E real |
| Casos exitosos / datos incorrectos / faltantes | Tablas `it.each` con 400 en todas las integraciones |
| Usuarios no autorizados | 401 (sin clave interna o sin identidad) y 403 (rol) en todas las integraciones; gateway 401/404 |
| Servicios no disponibles | Unitarias con `UpstreamError`; integración con rutas simuladas apagadas (503); gateway con servicio en puerto cerrado (503) y lento (504); E2E con contenedores detenidos |
| Errores de base de datos | `multimedia/evidences.service.spec.ts` «elimina los archivos escritos si falla la base de datos»; health checks 503 si la base no responde |

## 3. Resultados de la ejecución (25-11-2026, entorno local Windows 11 + Docker Desktop, Node 22.15)

### 3.1 Unitarias (`npm run test:cov` desde la raíz)

| Paquete | Pruebas | Líneas | Sentencias | Ramas | Funciones |
|---|---:|---:|---:|---:|---:|
| api-gateway | 36 | 33.8 % | 33.8 % | 27.8 % | 28.3 % |
| users | 37 | 66.5 % | 66.3 % | 64.2 % | 54.1 % |
| reports | 58 | 73.3 % | 72.1 % | 72.0 % | 49.1 % |
| multimedia | 38 | 68.1 % | 68.0 % | 63.3 % | 61.0 % |
| geolocation | 27 | 63.6 % | 62.7 % | 65.8 % | 50.0 % |
| ai | 32 | 69.2 % | 68.7 % | 68.4 % | 62.0 % |
| notifications | 33 | 68.2 % | 67.5 % | 62.9 % | 52.5 % |
| frontend | 17 | 28.6 % | 30.0 % | 18.5 % | 14.7 % |
| **Total** | **278 (278 aprobadas, 0 fallidas)** | | | | |

La cobertura de esta tabla corresponde **solo a pruebas unitarias**. Controladores y middleware (en especial del gateway) se ejercitan en integración; su cobertura se mide aparte (§3.2). Excluidos de la medición: `main.ts`, módulos, DTO y migraciones.

### 3.2 Integración (MySQL 8.4 real)

| Paquete | Pruebas | Resultado |
|---|---:|---|
| api-gateway | 18 | 18 ✔ |
| users | 19 | 19 ✔ |
| reports | 19 | 19 ✔ (estable en 3 ejecuciones consecutivas) |
| multimedia | 11 | 11 ✔ |
| geolocation | 11 | 11 ✔ |
| ai | 8 | 8 ✔ |
| notifications | 10 | 10 ✔ (estable en 2 ejecuciones) |
| **Total** | **96** | **96 ✔** |

Cobertura de las pruebas de integración (`npm run test:integration:cov`):

| Paquete | Líneas | Sentencias | Ramas | Funciones |
|---|---:|---:|---:|---:|
| api-gateway | 95.4 % | 92.8 % | 67.8 % | 95.7 % |
| users | 92.0 % | 91.4 % | 58.5 % | 91.8 % |
| reports | 88.7 % | 87.8 % | 63.4 % | 93.5 % |
| multimedia | 91.5 % | 89.8 % | 60.2 % | 93.2 % |
| geolocation | 92.6 % | 91.8 % | 64.5 % | 92.6 % |
| ai | 75.1 % | 76.4 % | 50.5 % | 78.0 % |
| notifications | 88.4 % | 88.1 % | 57.6 % | 85.2 % |

Ambos informes LCOV (unitario e integración) se entregan a SonarQube, que calcula la cobertura combinada. La cobertura de **ramas** es la métrica más baja en todos los paquetes (50–72 %).

### 3.3 Extremo a extremo sobre Docker Compose

`node tests/e2e/smoke.mjs --failures` → **21/21 pasos correctos**: 17 del flujo funcional (registro, login, 401/403/404, reporte 201, fuera de cobertura 422, foto 201, ejecutable 415, IA, gestión, historial, GeoJSON sin autor, 3 correos en Mailpit, estadísticas, revocación inmediata) y 4 de fallo/recuperación (ver §4).

## 4. Pruebas de fallo: un fallo no derriba la plataforma

| Escenario | Resultado medido |
|---|---|
| `ai` detenido | Reporte 201; análisis `UNAVAILABLE`; salud `degraded`. |
| `notifications` detenido | Cambio de estado 200; notificación entregada 9–14 s tras reiniciar el contenedor. |
| `geolocation` detenido | Reporte 201 `PENDING`; `VALIDATED` 4–14 s tras reiniciar. |
| Terminación del proceso de `reports` | Reinicio automático (`RestartCount 0→1`), `healthy` en 5 s. |
| `users` sin respuesta (revocación) | Gateway responde 503 (fail-closed) — prueba unitaria e integración. |
| Servicio lento | 504 a los 800 ms configurados; otros servicios siguen respondiendo. |

## 5. Problemas encontrados por las pruebas (y corregidos)

| Problema | Detectado por | Corrección |
|---|---|---|
| Prueba inestable: mezclaba el reloj de MySQL (`NOW()` en la VM de Docker) con el de la aplicación. | 2 de 3 ejecuciones de `reports.int-spec.ts` | La prueba usa una fecha explícita en el pasado; el código ya usaba un único reloj. |
| Proxy cerraba el socket del cliente con servicios lentos. | `gateway.int-spec.ts` | RF-01. |
| `docker kill` no activa la política de reinicio. | E2E UT-DIS-04 | Simulación correcta de la caída (ver ATAM AS-08). |
| Cabeceras de seguridad de Nginx no se enviaban. | Verificación manual con `curl -I` tras el E2E | `security-headers.conf` incluido por `location`. |
| `TextEncoder` ausente en jsdom (Jest 29) con React Router 7. | Suite del frontend | Polyfill en `test/polyfills.ts`. |

## 6. Informes generados

- Cobertura: `*/coverage/lcov.info` (consumido por SonarQube) y `coverage-summary.json`.
- JUnit: `*/reports/junit/unit.xml` e `integration.xml` (publicados como artefactos en CI).

## 7. Pendiente

- Subir la cobertura de ramas (50–72 %), la métrica más baja medida.
- Pruebas de interacción por página en el frontend y pruebas E2E en navegador (TD-05).
- Prueba de concurrencia con 2 réplicas de `reports` (AS-13).
- Pruebas de contrato entre servicios (TD-16).
- Pruebas de carga (no se han ejecutado; no se reportan métricas de rendimiento bajo carga).
