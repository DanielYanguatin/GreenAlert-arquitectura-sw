# 17 · Registro de decisiones arquitectónicas (ADR)

Formato: Contexto · Decisión · Alternativas · Consecuencias. Estado: Aceptada / Propuesta.

---

### ADR-001 · Microservicios con API Gateway — Aceptada
**Contexto**: requisito de ≥ 6 servicios independientes, desplegables por separado, con un punto de entrada único.
**Decisión**: 6 aplicaciones NestJS independientes + gateway NestJS; el frontend solo conoce el gateway.
**Alternativas**: monolito modular (descartado por el enunciado); *Backend for Frontend* por rol (más complejidad sin beneficio actual).
**Consecuencias**: + independencia y aislamiento de fallos (verificado en ATAM). − Operación más compleja, latencia de red adicional, consistencia eventual.

### ADR-002 · Database per Service sobre un servidor MySQL — Aceptada
**Decisión**: 6 bases y 6 usuarios MySQL con privilegios solo sobre su base; referencias entre servicios como UUID lógicos sin claves foráneas cruzadas.
**Alternativas**: esquema compartido (viola el requisito); un servidor por servicio (costo alto en local).
**Consecuencias**: + aislamiento real verificado (ERROR 1142). − el servidor es SPOF (TD-11); separar servidores solo requiere cambiar `DB_HOST`.

### ADR-003 · REST síncrono + Transactional Outbox para efectos secundarios — Aceptada
**Contexto**: REST obligatorio; no introducir tecnologías innecesarias; las notificaciones y la proyección geográfica no deben bloquear el registro.
**Decisión**: llamadas síncronas con timeout solo cuando la respuesta es necesaria; eventos guardados en `outbox_events` en la misma transacción y despachados con reintentos exponenciales y reclamo atómico por lotes.
**Alternativas**: broker de mensajes (RabbitMQ/Kafka) — ver ADR-006.
**Consecuencias**: + sin pérdida de eventos ante caídas (verificado). − latencia de 5 s de sondeo; carga de sondeo sobre MySQL.

### ADR-004 · Código transversal copiado por servicio (sin librería compartida en tiempo de ejecución) — Aceptada (temporal)
**Decisión**: cada servicio tiene su copia de guards, filtro, cliente HTTP y validación de entorno. Las herramientas de desarrollo (ESLint, TypeScript base) sí se comparten.
**Alternativas**: paquete interno versionado (preferible a medio plazo); monorepo con librería enlazada (crea acoplamiento de despliegue).
**Consecuencias**: + cada servicio compila y despliega solo. − duplicación (TD-01).

### ADR-005 · Identidad propagada por cabeceras con clave interna — Aceptada
**Decisión**: el gateway verifica el JWT y propaga `x-user-id/role/email` + `x-internal-api-key`; elimina esas cabeceras si vienen del cliente. Los servicios no verifican el JWT.
**Alternativas**: cada servicio verifica el JWT (más CPU y distribución del secreto); mTLS + JWT (recomendado para producción).
**Consecuencias**: + servicios simples. − la clave interna es un secreto crítico (PS-02, R-ATAM-03).

### ADR-006 · No introducir un broker de mensajes en esta versión — Aceptada
**Contexto**: el enunciado fija REST y pide evitar tecnologías innecesarias.
**Decisión**: outbox + cola persistente en MySQL.
**Revisión**: considerar RabbitMQ cuando el volumen de eventos o el número de consumidores (integraciones con entidades, analítica) lo justifique; el outbox facilita la migración (el despachador publicaría al broker).

### ADR-007 · Revocación de tokens fail-closed con caché — Aceptada
**Decisión**: logout registra el `jti`; el gateway consulta la revocación con caché de 30 s; si `users` no responde, rechaza (503).
**Consecuencias**: compromiso PC-01 seguridad > disponibilidad.

### ADR-008 · IA desacoplada mediante el puerto `ImageClassifier` — Aceptada
**Contexto**: no existe un modelo entrenado ni datos etiquetados; no se debe inventar precisión.
**Decisión**: servicio `ai` independiente con dos adaptadores: `HeuristicKeywordClassifier` (prueba, NO entrenado, confianza ≤ 0.6) y `HttpVisionClassifier` (modelo externo). Selección por `AI_PROVIDER`. La sugerencia nunca cambia la categoría: el funcionario decide.
**Integración futura de un modelo real**:
1. Recolectar y etiquetar imágenes locales (Mocoa/Putumayo) por categoría con funcionarios; separar entrenamiento/validación/prueba.
2. Entrenar (p. ej. *fine-tuning* de un modelo de visión preentrenado) y **medir** precisión, *recall* y matriz de confusión por categoría en el conjunto de prueba.
3. Exponer el modelo con el contrato `POST { text, images:[{mimeType, base64}] } → { category, confidence, scores, modelVersion }`.
4. Configurar `AI_PROVIDER=http`, `AI_MODEL_URL`, ajustar `AI_MODEL_TIMEOUT_MS` y `HTTP_TIMEOUT_MS` de reports (PS-01).
5. Registrar las decisiones del funcionario (acepta/rechaza la sugerencia) para medir el desempeño en producción.

### ADR-009 · Validación del tipo real de archivo por firma binaria — Aceptada
**Decisión**: implementación propia mínima (JPEG, PNG, WEBP) en lugar de una librería (las alternativas populares son ESM-only y amplían la superficie de dependencias). SVG excluido (puede contener scripts).

### ADR-010 · Almacenamiento de evidencias en volumen con puerto `StoragePort` — Aceptada
**Decisión**: binarios en disco (`/data/uploads`), metadatos y SHA-256 en MySQL. **Consecuencia**: no escala horizontalmente sin almacenamiento compartido (TD-17).

### ADR-011 · Cobertura geográfica parametrizada por datos — Aceptada
**Decisión**: tabla `municipalities` con los 13 municipios del Putumayo (DANE), solo Mocoa habilitado; ampliar cobertura = `PATCH /api/municipalities/:code`. Geometría rectangular aproximada (TD-06).

### ADR-012 · Integración con entidades ambientales: solo puertos — Propuesta
**Contexto**: Corpoamazonia, Alcaldía de Mocoa, Gobernación del Putumayo, PNN y MinAmbiente no han provisto API ni autorización.
**Decisión**: no se implementa ninguna integración. Se propone un servicio `integrations` que consuma eventos del outbox de reports (`REPORT_CREATED`, `STATUS_CHANGED`) y aplique un adaptador por entidad, con su propio registro de envíos y reintentos. Los funcionarios de cada entidad usan hoy la plataforma con su rol y el campo `entity`.

### ADR-013 · Chatbot ambiental desacoplado — Propuesta
**Decisión de diseño**: nuevo servicio `chatbot` con ruta `/api/chatbot` en la tabla del gateway. Responde con una base de conocimiento curada (cómo reportar, qué información incluir, buenas prácticas, problemáticas del Putumayo, información institucional pública) y, si se usa un LLM, con recuperación sobre esa base y sin acceso a datos personales. Puede consultar endpoints públicos (municipios, categorías). No tiene base de datos compartida. Requisitos previos: contenido validado por las entidades, política de privacidad y evaluación de respuestas.

### ADR-014 · Análisis predictivo — Propuesta
**Requisitos de datos**: histórico suficiente de reportes geolocalizados y fechados por categoría (no existe aún), variables exógenas (lluvias, temporada seca, cobertura boscosa — fuentes IDEAM/IGAC) y etiquetas de resolución.
**Metodología propuesta**: agregación espacio-temporal (celdas H3 o veredas × semana), modelos base (frecuencias históricas, regresión de Poisson) antes de modelos más complejos; validación temporal (*backtesting* con cortes por fecha) y métricas como error absoluto medio y precisión@k de zonas de riesgo.
**Arquitectura**: servicio `analytics` que lee un *export* periódico vía API de reports (nunca su base), con su propia base. **No se generan predicciones** hasta contar con datos y validación.

### ADR-015 · Umbrales de calidad configurables — Aceptada
**Contexto**: el criterio del 85 % mencionado por el docente no está confirmado.
**Decisión**: `COVERAGE_THRESHOLD` (Jest, por defecto 0) y la variable de repositorio `vars.COVERAGE_THRESHOLD` en CI; el Quality Gate de SonarQube se define en el servidor. Ver `12-informe-calidad-codigo.md` §5.

### ADR-016 · Nginx para servir el frontend y reenviar `/api` — Aceptada
**Decisión**: imagen `nginx-unprivileged` sirve la SPA y reenvía `/api` al gateway (mismo origen: sin CORS en el navegador, CSP `connect-src 'self'`). En desarrollo, Vite hace el mismo reenvío.

### ADR-017 · Mailpit solo para desarrollo — Aceptada
**Decisión**: servidor SMTP de captura para verificar correos reales en local (usado en el E2E). En producción se configura un SMTP real con `SMTP_*`; Mailpit no debe desplegarse.
