import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { InternalHttpClient, UpstreamError } from './http-client';

describe('InternalHttpClient', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/slow') {
        setTimeout(() => res.end('{}'), 500);
        return;
      }
      if (req.url === '/fail') {
        res.statusCode = 503;
        res.end('{"message":"down"}');
        return;
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ key: req.headers['x-internal-api-key'] }));
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('envía la clave interna y devuelve el JSON', async () => {
    const client = new InternalHttpClient({ baseUrl, internalApiKey: 'k', timeoutMs: 1000 });
    await expect(client.request('GET', '/ok')).resolves.toEqual({ key: 'k' });
  });

  it('corta la llamada al superar el timeout', async () => {
    const client = new InternalHttpClient({ baseUrl, internalApiKey: 'k', timeoutMs: 100 });
    const err = await client.request('GET', '/slow').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).unavailable).toBe(true);
  });

  it('tipa los errores HTTP con su código', async () => {
    const client = new InternalHttpClient({ baseUrl, internalApiKey: 'k', timeoutMs: 1000 });
    const err = (await client.request('GET', '/fail').catch((e: unknown) => e)) as UpstreamError;
    expect(err.status).toBe(503);
    expect(err.body).toEqual({ message: 'down' });
  });

  it('marca como no disponible un servicio inaccesible', async () => {
    const client = new InternalHttpClient({ baseUrl: 'http://127.0.0.1:1', internalApiKey: 'k', timeoutMs: 500 });
    const err = (await client.request('GET', '/').catch((e: unknown) => e)) as UpstreamError;
    expect(err.unavailable).toBe(true);
  });
});
