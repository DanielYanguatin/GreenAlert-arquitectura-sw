import { isInternalPath, isPublicRoute, resolveService, serviceUrls } from './routes';

describe('tabla de enrutamiento', () => {
  it.each([
    ['/api/auth/login', 'users'],
    ['/api/users/me', 'users'],
    ['/api/reports?status=PENDIENTE', 'reports'],
    ['/api/evidences/abc/file', 'multimedia'],
    ['/api/municipalities', 'geolocation'],
    ['/api/locations/geojson', 'geolocation'],
    ['/api/classifications/categories', 'ai'],
    ['/api/notifications/me', 'notifications'],
  ])('%s → %s', (url, service) => {
    expect(resolveService(url)).toBe(service);
  });

  it('devuelve null para prefijos desconocidos', () => {
    expect(resolveService('/api/admin')).toBeNull();
    expect(resolveService('/otra')).toBeNull();
  });

  it.each([
    ['POST', '/api/auth/login', true],
    ['POST', '/api/auth/register', true],
    ['GET', '/api/locations/geojson?category=BASURA', true],
    ['GET', '/api/municipalities', true],
    ['OPTIONS', '/api/reports', true],
    ['GET', '/api/auth/login', false],
    ['POST', '/api/auth/logout', false],
    ['PATCH', '/api/municipalities/86001', false],
    ['GET', '/api/reports', false],
  ])('%s %s público=%s', (method, url, expected) => {
    expect(isPublicRoute(method, url)).toBe(expected);
  });

  it.each([
    '/api/reports/internal/x',
    '/api/internal/users',
    '/api/users/%69nternal/x',
    '/api/users/INTERNAL',
    '/api/reports/../internal',
    '/api/reports/%E0%A4%A',
  ])('bloquea la ruta interna o sospechosa %s', (url) => {
    expect(isInternalPath(url)).toBe(true);
  });

  it('no confunde palabras que contienen "internal"', () => {
    expect(isInternalPath('/api/reports/internalization')).toBe(false);
  });

  it('lee las URL de los servicios desde el entorno con valores por defecto', () => {
    const urls = serviceUrls({ USERS_SERVICE_URL: 'http://u:1' });
    expect(urls.users).toBe('http://u:1');
    expect(urls.reports).toBe('http://reports:3002');
  });
});
