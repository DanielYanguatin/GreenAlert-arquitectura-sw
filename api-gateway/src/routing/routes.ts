/**
 * Tabla de enrutamiento del gateway. Es la ÚNICA lógica de dominio que conoce el gateway:
 * qué prefijo pertenece a qué microservicio y qué rutas son públicas. No contiene reglas de negocio.
 */
export type ServiceName = 'users' | 'reports' | 'multimedia' | 'geolocation' | 'ai' | 'notifications';

export const SERVICE_NAMES: readonly ServiceName[] = [
  'users',
  'reports',
  'multimedia',
  'geolocation',
  'ai',
  'notifications',
];

export const DEFAULT_SERVICE_URLS: Record<ServiceName, string> = {
  users: 'http://users:3001',
  reports: 'http://reports:3002',
  multimedia: 'http://multimedia:3003',
  geolocation: 'http://geolocation:3004',
  ai: 'http://ai:3005',
  notifications: 'http://notifications:3006',
};

/** Primer segmento después de /api → servicio propietario. */
const PREFIXES: Record<string, ServiceName> = {
  auth: 'users',
  users: 'users',
  reports: 'reports',
  evidences: 'multimedia',
  municipalities: 'geolocation',
  locations: 'geolocation',
  classifications: 'ai',
  notifications: 'notifications',
};

interface PublicRoute {
  method: string;
  pattern: RegExp;
}

/** Rutas accesibles sin token. Todo lo demás exige un JWT válido y no revocado. */
const PUBLIC_ROUTES: PublicRoute[] = [
  { method: 'POST', pattern: /^\/api\/auth\/register\/?$/ },
  { method: 'POST', pattern: /^\/api\/auth\/login\/?$/ },
  { method: 'GET', pattern: /^\/api\/municipalities\/?$/ },
  { method: 'GET', pattern: /^\/api\/locations\/geojson\/?$/ },
  { method: 'GET', pattern: /^\/api\/classifications\/categories\/?$/ },
];

export function pathOf(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

export function resolveService(url: string): ServiceName | null {
  const segment = pathOf(url).split('/')[2] ?? '';
  return PREFIXES[segment] ?? null;
}

export function isPublicRoute(method: string, url: string): boolean {
  const path = pathOf(url);
  return method === 'OPTIONS' || PUBLIC_ROUTES.some((r) => r.method === method && r.pattern.test(path));
}

/**
 * Las rutas /internal solo existen para la comunicación entre servicios y nunca se exponen.
 * Se decodifica la ruta para impedir evasiones del tipo /api/x/%69nternal.
 */
export function isInternalPath(url: string): boolean {
  let path = pathOf(url);
  try {
    path = decodeURIComponent(path);
  } catch {
    return true; // codificación inválida: se trata como sospechosa
  }
  return /(^|\/)internal(\/|$)/i.test(path) || path.includes('..');
}

export function serviceUrls(env: Record<string, string | undefined>): Record<ServiceName, string> {
  return Object.fromEntries(
    SERVICE_NAMES.map((name) => [name, env[`${name.toUpperCase()}_SERVICE_URL`] ?? DEFAULT_SERVICE_URLS[name]]),
  ) as Record<ServiceName, string>;
}
