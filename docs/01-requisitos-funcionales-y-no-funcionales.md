# 01 · Requisitos funcionales y no funcionales

> Proyecto: **GreenAlert – Plataforma de Monitoreo Ambiental Ciudadano** (Mocoa, Putumayo).
> Estado del documento: línea base de la Fase 1, actualizada con el estado real de implementación (columna *Estado*).

## 1. Actores

| Actor | Rol en el sistema | Descripción |
|---|---|---|
| Ciudadano | `CIUDADANO` | Se registra, crea reportes, adjunta evidencias, consulta el seguimiento de sus reportes y el mapa público. |
| Funcionario ambiental | `FUNCIONARIO` | Revisa, clasifica, cambia estados, registra observaciones y gestiona reportes asignados. |
| Gestor ambiental | `GESTOR_AMBIENTAL` | Igual que el funcionario y además asigna responsables y consulta estadísticas globales. |
| Administrador | `ADMIN` | Administra usuarios, roles, cobertura geográfica y tiene acceso total. |
| Entidad ambiental | (integración futura) | Corpoamazonia, Alcaldía de Mocoa, Gobernación del Putumayo, PNN de Colombia, MinAmbiente. **No existe integración oficial**: solo se diseñan puertos de integración (ver ADR-012). Sus funcionarios usan el sistema con rol `FUNCIONARIO`/`GESTOR_AMBIENTAL` y el atributo `entity` de su perfil. |

## 2. Requisitos funcionales

Prioridad: **A** = imprescindible para la evaluación académica, **M** = importante, **B** = deseable/futuro.

### 2.1 Usuarios y autenticación (servicio `users`)

| ID | Requisito | Prioridad | Servicio |
|---|---|---|---|
| RF-01 | Registro de ciudadanos con nombre, correo y contraseña robusta (mín. 8 caracteres, mayúscula, minúscula y número). | A | users |
| RF-02 | Inicio de sesión con correo y contraseña; emite JWT firmado con caducidad configurable. | A | users |
| RF-03 | Cierre de sesión que revoca el token actual (lista de revocación por `jti`). | A | users, gateway |
| RF-04 | Consulta y actualización del perfil propio (nombre, teléfono, entidad). | A | users |
| RF-05 | Administración de usuarios: listar, cambiar rol, activar/desactivar (solo `ADMIN`). | A | users |
| RF-06 | Roles iniciales `ADMIN`, `CIUDADANO`, `FUNCIONARIO`, `GESTOR_AMBIENTAL`; permisos por rol. | A | users, todos |
| RF-07 | Protección de rutas: el gateway rechaza solicitudes sin token válido en rutas protegidas. | A | gateway |

### 2.2 Reportes ambientales (servicio `reports`)

| ID | Requisito | Prioridad | Servicio |
|---|---|---|---|
| RF-10 | Crear reporte con título, descripción, categoría, coordenadas y dirección de referencia. | A | reports, geolocation |
| RF-11 | Consultar reportes propios (ciudadano) y todos los reportes con filtros (personal institucional). | A | reports |
| RF-12 | Actualizar título/descripción/categoría de un reporte mientras está `PENDIENTE` (autor) o en cualquier estado (personal). | A | reports |
| RF-13 | Cambiar estado según la máquina de estados `PENDIENTE → EN_REVISION → EN_PROCESO → RESUELTO`, con `RECHAZADO` desde `PENDIENTE`/`EN_REVISION`. | A | reports |
| RF-14 | Asignar responsable (usuario institucional) a un reporte. | A | reports |
| RF-15 | Registrar observaciones de seguimiento. | A | reports |
| RF-16 | Historial de cambios (estado, asignación, categoría) consultable por el autor y el personal. | A | reports |
| RF-17 | Estadísticas agregadas por estado y categoría para el panel institucional. | M | reports |

### 2.3 Multimedia (servicio `multimedia`)

| ID | Requisito | Prioridad |
|---|---|---|
| RF-20 | Adjuntar hasta N fotografías (configurable, por defecto 5) a un reporte. | A |
| RF-21 | Validar el **tipo real** del archivo por firma binaria (JPEG, PNG, WEBP), no solo por extensión o `Content-Type`. | A |
| RF-22 | Limitar el tamaño por archivo (configurable, por defecto 5 MB). | A |
| RF-23 | Almacenar el binario en un volumen de archivos; en MySQL solo metadatos (nombre, tipo, tamaño, hash SHA-256, ruta). | A |
| RF-24 | Consultar las evidencias de un reporte y descargar el archivo con control de acceso. | A |

### 2.4 Geolocalización (servicio `geolocation`)

| ID | Requisito | Prioridad |
|---|---|---|
| RF-30 | Validar coordenadas (rango WGS84) y que el punto esté dentro de un municipio con cobertura habilitada. | A |
| RF-31 | Asociar la ubicación con el reporte y conservar una proyección (categoría, estado) para el mapa. | A |
| RF-32 | Consultar reportes por municipio, por rectángulo (bounding box) y por radio (km). | A |
| RF-33 | Entregar datos en formato GeoJSON para mapas interactivos. | A |
| RF-34 | Ampliar la cobertura a otros municipios del Putumayo mediante configuración (sin cambiar código). | M |

### 2.5 Inteligencia artificial (servicio `ai`)

| ID | Requisito | Prioridad |
|---|---|---|
| RF-40 | Recibir referencias de evidencias de un reporte y devolver una categoría sugerida con nivel de confianza. | A |
| RF-41 | Categorías: Basura, Contaminación hídrica, Deforestación, Humo y quemas, Vertimientos, Minería ilegal. | A |
| RF-42 | Registrar cada resultado (proveedor, versión del modelo, puntuaciones). | A |
| RF-43 | La clasificación es una **recomendación** que el funcionario confirma o descarta. | A |
| RF-44 | Proveedor intercambiable (heurístico de prueba hoy, modelo de visión por computadora en el futuro). | A |

### 2.6 Notificaciones (servicio `notifications`)

| ID | Requisito | Prioridad |
|---|---|---|
| RF-50 | Notificar registro de usuario, cambio de estado y asignación de reporte. | A |
| RF-51 | Avisar a funcionarios cuando se crea un reporte nuevo (alerta ambiental). | A |
| RF-52 | Historial de notificaciones por usuario. | A |
| RF-53 | Reintentos con retroceso exponencial y registro de errores; la falla de notificaciones no afecta al registro de reportes. | A |
| RF-54 | Canal correo electrónico (SMTP) con interfaz para canales futuros (SMS, WhatsApp, push). | M |

### 2.7 Frontend

| ID | Requisito | Prioridad |
|---|---|---|
| RF-60 | Páginas públicas: inicio, acerca de, registro, inicio de sesión, mapa público. | A |
| RF-61 | Panel ciudadano: crear reporte (mapa para ubicar el punto, fotos), mis reportes, seguimiento. | A |
| RF-62 | Panel institucional: dashboard con estadísticas, listas por estado, gestión, asignación, evidencias, mapa. | A |
| RF-63 | Gestión de usuarios para `ADMIN`. | A |
| RF-64 | Chatbot ambiental (desacoplado). | B – diseño en ADR-013, no implementado |
| RF-65 | Análisis predictivo de riesgo ambiental. | B – diseño en ADR-014, no implementado |

## 3. Requisitos no funcionales

Cada RNF está enlazado con escenarios del árbol de utilidad (`docs/10-arbol-utilidad.md`).

| ID | Atributo | Requisito | Métrica / verificación |
|---|---|---|---|
| RNF-01 | Seguridad | Contraseñas almacenadas con bcrypt (coste ≥ 12). | Revisión de código + prueba unitaria que verifica que el hash ≠ contraseña. |
| RNF-02 | Seguridad | Todas las rutas no públicas exigen JWT válido y no revocado. | Pruebas de integración del gateway (401 sin token / token revocado). |
| RNF-03 | Seguridad | Los microservicios solo aceptan tráfico con la clave interna (`x-internal-api-key`); no se publican puertos de servicios en Docker. | Pruebas de integración (401 sin clave) + `docker-compose.yml`. |
| RNF-04 | Seguridad | Validación de entradas con lista blanca (`whitelist`, `forbidNonWhitelisted`). | Pruebas con campos extra → 400. |
| RNF-05 | Seguridad | Sin secretos en el repositorio; configuración por variables de entorno. | Revisión + `.env.example` sin valores reales. |
| RNF-06 | Seguridad | Límite de solicitudes por IP en el gateway (configurable). | Prueba de integración (429). |
| RNF-07 | Disponibilidad | Un reporte se registra aunque `ai`, `notifications` o `geolocation` estén caídos. | Pruebas de fallo (ver `docs/11-estrategia-pruebas.md`). |
| RNF-08 | Disponibilidad | Health checks por servicio y reinicio automático de contenedores. | `docker compose ps` (estado `healthy`). |
| RNF-09 | Rendimiento | Las llamadas entre servicios tienen tiempo máximo configurable (por defecto 3 s) y no bloquean indefinidamente. | Prueba de timeout. |
| RNF-10 | Rendimiento | Listados paginados (máx. 100 elementos por página) e índices en columnas de filtro. | Migraciones + pruebas. |
| RNF-11 | Escalabilidad | Servicios sin estado en memoria crítica (excepto caché de revocación con TTL corto); escalado horizontal posible. | Revisión de diseño (ATAM). |
| RNF-12 | Modificabilidad | Agregar una categoría ambiental o un municipio no requiere modificar todos los servicios. | SAAM (escenarios S-01, S-02). |
| RNF-13 | Mantenibilidad | ESLint sin errores, compilación exitosa, pruebas automatizadas en CI. | Pipeline de GitHub Actions. |
| RNF-14 | Mantenibilidad | Umbral de cobertura **configurable** (`COVERAGE_THRESHOLD`), sin fijar el 85 % como exigencia confirmada. | `jest.config.js` + `docs/12-informe-calidad-codigo.md`. |
| RNF-15 | Interoperabilidad | API REST documentada con OpenAPI/Swagger por servicio y agregada en el gateway. | `/api/docs`. |
| RNF-16 | Usabilidad | Interfaz responsiva (móvil primero) en español. | Revisión manual en anchos de 360 px y 1280 px. |
| RNF-17 | Privacidad | El mapa público no expone identidad del autor del reporte. | Prueba de la respuesta GeoJSON. |

## 4. Restricciones

- Tecnologías obligatorias: React + Vite + TypeScript, NestJS + TypeScript, MySQL + TypeORM, Docker/Compose, ESLint, SonarQube, Jest, Swagger, Git, GitHub Actions.
- Cobertura inicial: Mocoa (DANE 86001). Los demás municipios del Putumayo se cargan deshabilitados hasta contar con geometrías oficiales.
- No se afirma integración con entidades oficiales ni precisión del modelo de IA.
- El significado del umbral del 85 % mencionado por el docente **no está confirmado**; ver `docs/12-informe-calidad-codigo.md` §5.
