/**
 * Validación de variables de entorno al arrancar: el servicio no inicia con configuración incompleta
 * ni con secretos débiles.
 */
const REQUIRED = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'INTERNAL_API_KEY', 'JWT_SECRET'] as const;

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const missing = REQUIRED.filter((key) => typeof config[key] !== 'string' || config[key] === '');
  if (missing.length > 0) {
    throw new Error(`Variables de entorno obligatorias ausentes: ${missing.join(', ')}`);
  }
  if (String(config.JWT_SECRET).length < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
  }
  if (String(config.INTERNAL_API_KEY).length < 24) {
    throw new Error('INTERNAL_API_KEY debe tener al menos 24 caracteres');
  }
  return config;
}
