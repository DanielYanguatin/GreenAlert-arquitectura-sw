# 09 · Evaluación de modificabilidad con SAAM

SAAM (*Software Architecture Analysis Method*) evalúa cuánto cuesta cambiar la arquitectura ante escenarios de modificación concretos. Se aplicó sobre el código real (v0.1.0).

**Tipos de evidencia** (se distinguen explícitamente):

- 🧪 **Medido con prueba**: el cambio se ejecutó o se probó el mecanismo con pruebas automatizadas.
- 🔎 **Medido por inspección**: los componentes afectados se determinaron buscando en el código dónde vive el concepto (`grep`), sin ejecutar el cambio.
- 📐 **Estimación de diseño**: juicio del evaluador sobre una capacidad que aún no existe.

## 1. Funcionalidades principales

F1 registro/autenticación · F2 creación y gestión de reportes · F3 evidencias · F4 geolocalización y mapa · F5 clasificación sugerida · F6 notificaciones · F7 panel institucional.

## 2. Escala de dificultad

Baja: solo configuración/datos o 1 componente con cambio aislado · Media: 2 componentes o una migración · Alta: ≥3 componentes, migraciones y coordinación de despliegues.

## 3. Escenarios

| ID | Cambio solicitado | Servicios afectados | Dificultad | Impacto | Justificación | Resultado / evidencia |
|---|---|---|---|---|---|---|
| S-01 | Nueva categoría ambiental (p. ej. *Contaminación auditiva*) | **reports** (enum `ReportCategory`), **frontend** (`labels.ts`), **notifications** (etiqueta en `templates.ts`), *ai* (opcional: solo si el clasificador debe sugerirla) | Media-Alta | Sin migración: `category` es `VARCHAR` (RF-06). `geolocation` **no** cambia: valida con patrón `[A-Z_]`. | El catálogo está repetido en 4 componentes. | 🔎 `grep DEFORESTACION` → 5 archivos en 4 componentes. Si notifications no se actualiza, el correo muestra "Sin categoría" (degradación, no error). **Hallazgo → TD-14**. |
| S-01b | Nota: *Minería ilegal* (ejemplo del enunciado) | — | — | — | Ya existe en las 4 ubicaciones. | 🔎 Presente en `report.domain.ts`, `classifier.port.ts`, `templates.ts`, `labels.ts`. |
| S-02 | Habilitar un nuevo municipio del Putumayo | **ninguno** (solo datos): `PATCH /api/municipalities/:code` (ADMIN) | Baja | 0 líneas de código; 0 despliegues. | Cobertura parametrizada en la tabla `municipalities` (13 municipios precargados). | 🧪 `geolocation.int-spec.ts` «amplía la cobertura a otro municipio sin cambiar código»: Villagarzón habilitado vía API y resuelto correctamente. |
| S-03 | Reemplazar el clasificador heurístico por un modelo de visión real | **ai** (configuración `AI_PROVIDER=http`, `AI_MODEL_URL`) + el servicio del modelo (nuevo, externo) | Baja-Media | 0 cambios en reports, frontend o gateway. | Puerto `ImageClassifier` + adaptador `HttpVisionClassifier` ya implementado. | 🧪 `classifiers.spec.ts` prueba el adaptador contra un modelo simulado (descarga con clave interna, validación de respuesta, fallos). ⚠️ No existe un modelo real conectado. |
| S-04 | Nuevo canal de notificación (SMS/WhatsApp) | **notifications**: nueva clase `NotificationChannel` + **migración** del `ENUM('EMAIL')` + selección de canal por preferencia del usuario (requiere dato en **users**) | Media | Cola, reintentos y emisores (reports/users) sin cambios. | El puerto existe, pero la columna `channel` es ENUM y no hay preferencia de canal del usuario. | 🔎 `channel` definido en entidad y migración. **Hallazgo → TD-15**. |
| S-05 | Nuevo estado de reporte (p. ej. `ARCHIVADO`) | **reports** (enum, `TRANSITIONS`, **migración** ENUM), **geolocation** (`STATUSES` en `IsIn` del DTO), **notifications** (`STATUS_LABELS`), **frontend** (`labels.ts`) | Alta | 4 componentes y 1 migración; despliegue coordinado (geolocation debe desplegarse antes que reports o rechazará el estado → los eventos quedarían `FAILED`). | Estado validado en 4 lugares. | 🔎 `grep EN_REVISION` → 5 archivos en 4 componentes. **Hallazgo → TD-14/TD-15**. |
| S-06 | Cambiar el motor de base de datos de un solo servicio | Solo ese servicio (`typeorm.options.ts` + migraciones) | Media | Ningún otro servicio comparte su base (verificado: `ga_reports` no puede leer `greenalert_users`). | *Database per Service* real. | 🧪/🔎 Aislamiento verificado (ERROR 1142). El cambio de motor no se ejecutó (además, MySQL es obligatorio). |
| S-07 | Agregar el **chatbot ambiental** | Nuevo servicio + **1 línea** en la tabla del gateway (`PREFIXES`) + vista en frontend | Media | Sin cambios en los 6 servicios existentes. | Gateway con tabla declarativa; chatbot sin acceso a bases ajenas (consume APIs públicas). | 📐 Diseño en ADR-013. |
| S-08 | Integrar la API oficial de Corpoamazonia (enviar reportes nuevos) | Nuevo adaptador consumidor de eventos (nuevo tipo en el outbox de reports o servicio de integración) | Media | Sin cambios en el flujo ciudadano. | El outbox ya publica eventos por reporte. | 📐 Diseño en ADR-012 (no hay API ni autorización disponibles). |
| S-09 | Cambiar el proveedor de correo (SMTP → proveedor comercial) | Ninguno si ofrece SMTP (variables `SMTP_*`); si es API HTTP, solo **notifications** (nuevo canal) | Baja | — | Canal SMTP configurable. | 🧪 Canal intercambiable probado (`InMemoryChannel` en integración; SMTP real contra Mailpit en E2E: 3 correos recibidos). |
| S-10 | Análisis predictivo de riesgo | Nuevo servicio que consume histórico vía API/exportación de reports | Media | Sin acceso directo a la base de reports. | Respeta *Database per Service*. | 📐 Diseño en ADR-014. |
| S-11 | Cambiar el límite de tamaño o cantidad de fotos | Ninguno (variables `MAX_FILE_SIZE_MB`, `MAX_FILES_PER_REPORT`) | Baja | — | Parametrizado. | 🧪 Integración con límites 1 MB/3 archivos → 413/400. |

## 4. Interacción de escenarios (componentes con más escenarios)

| Componente | Escenarios que lo afectan | Lectura |
|---|---|---|
| reports | S-01, S-05, S-08 | Concentra el conocimiento del dominio (esperado). |
| frontend | S-01, S-05, S-07 | Etiquetas de presentación (esperado, pero debería obtenerlas de la API). |
| notifications | S-01, S-04, S-05, S-09 | **Más interacción de la deseable**: repite catálogos de dominio en sus plantillas. |
| geolocation | S-02, S-05 | S-05 revela acoplamiento: valida estados que no le pertenecen. |
| ai | S-01 (opcional), S-03 | Bien aislado. |
| users | S-04 (preferencia de canal) | Bien aislado. |
| gateway | S-07 | Solo tabla de rutas. |

## 5. Resultados

- **Cambios bien soportados** (dificultad baja, 0-1 componente): S-02, S-03, S-09, S-11 — tres de ellos **verificados con pruebas**.
- **Cambios con costo innecesario**: S-01 y S-05 afectan 4 componentes porque los **catálogos de categorías y estados están duplicados**; S-04 y S-05 requieren migraciones por el uso de `ENUM`.
- La arquitectura **sí permite** agregar capacidades nuevas (S-07, S-08, S-10) sin modificar los servicios existentes, gracias al gateway declarativo, al outbox y a *Database per Service*.

## 6. Recomendaciones (alimentan el plan de refactorización)

1. Exponer un catálogo único (`GET /api/reports/catalog` con categorías y estados) y que notifications y frontend lo consuman; `geolocation` debería aceptar cualquier estado con formato válido en lugar de una lista fija. Objetivo medible: S-01 y S-05 pasan de 4 a 1-2 componentes.
2. Sustituir columnas `ENUM` de dominio por `VARCHAR` validado en código (S-04, S-05 sin migración).
3. Repetir este SAAM tras aplicar 1 y 2 y registrar la medición real.
