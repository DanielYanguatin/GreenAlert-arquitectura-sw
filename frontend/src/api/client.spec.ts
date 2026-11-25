import { api, ApiError, configureClient, query } from './client';

function mockFetch(status: number, body: unknown) {
  const fn = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body === undefined ? '' : JSON.stringify(body)),
  });
  global.fetch = fn;
  return fn;
}

describe('cliente de API', () => {
  afterEach(() =>
    configureClient(
      () => null,
      () => undefined,
    ),
  );

  it('llama siempre al gateway (/api) con el token y JSON', async () => {
    configureClient(
      () => 'tok',
      () => undefined,
    );
    const fetchMock = mockFetch(200, { ok: true });
    await expect(api('/reports', { method: 'POST', body: { a: 1 } })).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/reports');
    expect(init.headers).toEqual({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' });
    expect(init.body).toBe('{"a":1}');
  });

  it('convierte errores de validación en mensajes legibles', async () => {
    mockFetch(400, { message: ['Latitud no válida', 'Título requerido'] });
    await expect(api('/reports')).rejects.toThrow('Latitud no válida. Título requerido');
  });

  it('cierra la sesión local ante un 401 con token', async () => {
    const onUnauthorized = jest.fn();
    configureClient(() => 'tok', onUnauthorized);
    mockFetch(401, { message: 'La sesión fue cerrada' });
    await expect(api('/reports/mine')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it('informa la falta de conexión', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api('/x')).rejects.toMatchObject({ status: 0, message: 'No hay conexión con el servidor' });
  });

  it('maneja 204 sin cuerpo', async () => {
    mockFetch(204, undefined);
    await expect(api('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('construye query strings omitiendo valores vacíos', () => {
    expect(query({ page: 1, status: '', category: 'BASURA', x: undefined })).toBe('?page=1&category=BASURA');
    expect(query({})).toBe('');
  });
});
