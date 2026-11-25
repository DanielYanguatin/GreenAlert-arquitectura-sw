// Se ejecuta antes de importar los módulos. Todos los microservicios apuntan a un servidor simulado,
// excepto "ai", que apunta a un puerto cerrado para probar la respuesta ante un servicio caído.
const STUB = `http://127.0.0.1:${process.env.STUB_PORT ?? '47200'}`;

Object.assign(process.env, {
  INTERNAL_API_KEY: 'integration-internal-key-0123456789',
  JWT_SECRET: 'integration-jwt-secret-0123456789abcdef',
  USERS_SERVICE_URL: STUB,
  REPORTS_SERVICE_URL: STUB,
  MULTIMEDIA_SERVICE_URL: STUB,
  GEOLOCATION_SERVICE_URL: STUB,
  NOTIFICATIONS_SERVICE_URL: STUB,
  AI_SERVICE_URL: 'http://127.0.0.1:1',
  PROXY_TIMEOUT_MS: '800',
  HTTP_TIMEOUT_MS: '800',
  RATE_LIMIT_MAX: '1000',
  RATE_LIMIT_AUTH_MAX: '5',
  CORS_ORIGINS: 'http://localhost:5173',
});
