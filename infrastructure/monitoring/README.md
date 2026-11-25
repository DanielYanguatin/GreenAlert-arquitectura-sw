# Monitoreo y observabilidad

**Estado: no implementado** (deuda TD-12). Este documento define qué existe hoy y qué falta, para no aparentar una capacidad inexistente.

## Disponible hoy

| Señal | Dónde |
|---|---|
| Salud por servicio (incluye conectividad a MySQL) | `GET /health` de cada servicio (solo red interna) y health checks de Docker |
| Salud agregada de la plataforma | `GET /api/health` → `ok` / `degraded` con el estado de cada servicio |
| Trazabilidad de solicitudes | Cabecera `x-request-id` generada por el gateway, propagada a los servicios e incluida en las respuestas de error |
| Estado de colas | `GET /api/notifications/stats` (ADMIN); tabla `outbox_events` de reports (`status`, `attempts`, `last_error`) |
| Logs | Salida estándar de cada contenedor (`docker compose logs`), con rotación |

## Propuesta para producción

1. **Logs estructurados (JSON)** con `requestId`, servicio y usuario (sin datos personales), enviados a Loki o ELK.
2. **Métricas Prometheus** por servicio: latencia y tasa de errores por ruta, eventos `PENDING/FAILED` del outbox y de notificaciones, tiempo hasta entrega.
3. **Trazas OpenTelemetry** propagando el contexto en las llamadas internas.
4. **Alertas** sugeridas: servicio `down` > 2 min; eventos `FAILED` > 0; `PENDING` con antigüedad > 10 min; tasa de 5xx > 2 % en 5 min; espacio del volumen `uploads` > 80 %.
5. Panel con los indicadores del árbol de utilidad (disponibilidad por servicio, latencia de entrega de notificaciones).
