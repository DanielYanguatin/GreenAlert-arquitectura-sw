# 13 · Seguridad

## 1. Modelo de amenazas (resumen)

| Activo | Amenaza | Control |
|---|---|---|
| Cuentas de usuario | Robo de credenciales, fuerza bruta, enumeración | bcrypt coste 12, límite de intentos por IP (20/min por defecto), mensaje genérico e igualación de tiempo |
| Sesiones | Reutilización de token robado | JWT con `exp` (1 h) y `jti`; revocación en logout verificada en el gateway |
| Identidad interna | Falsificación de `x-user-*`, acceso directo a servicios | Gateway elimina cabeceras de confianza; `x-internal-api-key` (comparación en tiempo constante); servicios solo en red Docker `internal` sin puertos publicados |
| Datos de otros servicios | Acceso lateral a tablas | Usuario MySQL por servicio con privilegios solo sobre su base |
| Evidencias | Archivos maliciosos, *path traversal*, XSS por SVG | Firma binaria (solo JPEG/PNG/WEBP), límites de tamaño y cantidad, nombre UUID, `X-Content-Type-Options: nosniff`, ruta verificada |
| Datos personales | Exposición en el mapa público | GeoJSON sin `userId`; 404 (no 403) al consultar reportes ajenos |
| Plataforma | Abuso / DoS de aplicación | *Rate limiting* general (300/min), límites de multer, paginación máx. 100, timeouts |

## 2. Controles implementados

### Autenticación y autorización
- `users`: registro siempre con rol `CIUDADANO` (el campo `role` enviado por el cliente se rechaza con 400 por `forbidNonWhitelisted`).
- Política de contraseña: 8–72 caracteres, mayúscula, minúscula y número (72 = límite de bcrypt).
- JWT HS256, emisor `greenalert-users`, verificado con algoritmo fijado (`algorithms: ['HS256']`) para impedir *algorithm confusion*.
- Control de acceso por rol en cada servicio (`@Roles`), no solo en el frontend.
- El administrador inicial se crea desde variables de entorno solo si no existe ningún ADMIN; un ADMIN no puede quitarse su rol ni desactivarse.

### Validación de entradas
- `ValidationPipe` global: `whitelist`, `forbidNonWhitelisted`, `transform`. DTO con `class-validator` (UUID, rangos de coordenadas, longitudes, enumeraciones, URL sin `javascript:`).
- **Inyección SQL**: solo TypeORM con parámetros; no se concatenan entradas en SQL.
- **XSS**: React escapa por defecto; no se usa `dangerouslySetInnerHTML`; CSP en Nginx (`script-src 'self'`, `frame-ancestors 'none'`); plantillas de correo limpian etiquetas y escapan HTML.

### Manejo de errores
- Filtro global que responde JSON homogéneo; los errores 500 no exponen trazas ni mensajes de MySQL (se registran en el log del servicio).

### Cabeceras y transporte
- Gateway: Helmet (incluye HSTS, `nosniff`, `frame-ancestors`), `x-powered-by` deshabilitado, CORS con lista blanca (`CORS_ORIGINS`).
- Nginx: CSP, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (verificado con `curl -I`).
- TLS: **no** configurado en el entorno local; en producción debe terminarse en un *ingress*/proxy con certificados válidos.

### Secretos
- Ningún secreto en el repositorio. `.env` en `.gitignore`; `.env.example` solo con marcadores `cambiar-…`.
- Validación al arranque: `JWT_SECRET` ≥ 32 caracteres e `INTERNAL_API_KEY` ≥ 24; sin ellos el servicio no inicia.
- Contraseñas de MySQL por servicio inyectadas por variables de entorno al script de inicialización.

### Contenedores
- Procesos como usuario sin privilegios (`node`, `nginx-unprivileged`).
- Imágenes multi-etapa con dependencias de producción únicamente.

## 3. Verificación (evidencias ejecutadas)

| Control | Evidencia |
|---|---|
| Cabeceras falsificadas eliminadas | `gateway.int-spec.ts`; E2E (`x-user-role: ADMIN` → 403) |
| Rutas `/internal` bloqueadas (incl. `%69nternal`, `..`) | `routes.spec.ts`, `gateway.int-spec.ts`, E2E |
| Servicios rechazan llamadas sin clave interna | Pruebas de integración de los 6 servicios |
| Servicios no publicados en el host | `curl http://localhost:3002/health` → conexión rechazada |
| Aislamiento de bases | `ga_reports` → `ERROR 1142 SELECT command denied` sobre `greenalert_users.users`; `SHOW DATABASES` solo muestra la suya |
| Archivos maliciosos | 415 para ejecutable y SVG; 413 por tamaño; `storage.spec.ts` (traversal) |
| Revocación | E2E: 200 → logout 204 → 401 |
| Fuerza bruta | `gateway.int-spec.ts` → 429 |
| bcrypt | `users.int-spec.ts` verifica el formato `$2…$10$` del hash almacenado (coste 10 en pruebas, 12 por defecto) |

## 4. Auditoría de dependencias (`npm audit`, 25-11-2026)

| Hallazgo | Severidad | Tratamiento |
|---|---|---|
| `nodemailer` ≤ 10.1.3 (GHSA-p6gq-j5cr-w38f y otras 14) | **Alta** | **Corregido**: actualizado a 10.6.1; pruebas de notifications en verde. |
| `glob` 9.0.0–14.0.1 (GHSA-3g3m-2fjr-6pw4), transitiva de `typeorm@0.3.31` | Moderada | **Aceptado temporalmente** (TD-07). La vulnerabilidad afecta a la CLI de `glob` (`-c/--cmd`), que no se ejecuta. Se probó un `override` y se descartó porque dejaba un árbol de dependencias inválido. |
| `minimatch` 7.0.0–11.0.0 (GHSA-g3hv-75wg-m249, ReDoS), transitiva de `typeorm` | Moderada | **Aceptado temporalmente** (TD-07). Solo explotable con patrones controlados por un atacante; TypeORM los usa con configuración estática (aquí ni siquiera se usan patrones: entidades y migraciones se pasan como clases). |
| `typeorm` (por las anteriores) | Moderada | La corrección requiere TypeORM 1.x (cambio mayor) → plan de refactorización, orden 5. |

Estado actual: `npm audit --omit=dev` → **0 críticas, 0 altas, 3 moderadas**. El job `security` de CI bloquea con `--audit-level=high`.

## 5. SonarQube

Ver `12-informe-calidad-codigo.md` §4. No se afirma ningún resultado de SonarQube que no se haya ejecutado.

## 6. Pendientes de seguridad antes de producción

1. TLS extremo a extremo y HSTS en el dominio real.
2. JWT asimétrico con rotación (TD-13) y cookie HttpOnly (TD-08).
3. Gestor de secretos (Vault, AWS/GCP Secret Manager) y rotación de `INTERNAL_API_KEY`; o mTLS entre servicios.
4. Escaneo de imágenes de contenedor (p. ej. Trivy) — no ejecutado.
5. Análisis dinámico (DAST, p. ej. OWASP ZAP) — no ejecutado.
6. Política de retención y tratamiento de datos personales conforme a la Ley 1581 de 2012 (aviso de privacidad, autorización de tratamiento).
7. Revisión del uso de teselas de OpenStreetMap (política de uso) o servidor de teselas propio.
