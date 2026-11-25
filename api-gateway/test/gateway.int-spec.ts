import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureGateway } from '../src/bootstrap';
import { StubServer } from './stub-server';

const KEY = process.env.INTERNAL_API_KEY!;
const JTI = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER = '11111111-1111-4111-8111-111111111111';

/**
 * Integración del gateway: aplicación Nest real + servidor HTTP que simula a los microservicios.
 * Verifica enrutamiento, reescritura de rutas, autenticación, aislamiento de cabeceras y fallos.
 */
describe('api-gateway (integración)', () => {
  let app: NestExpressApplication;
  const stub = new StubServer();
  const jwt = new JwtService({ secret: process.env.JWT_SECRET });
  const token = (role = 'CIUDADANO', jti = JTI) =>
    `Bearer ${jwt.sign({ sub: USER, email: 'c@x.co', role, jti }, { expiresIn: 600, issuer: 'greenalert-users' })}`;

  beforeAll(async () => {
    await stub.start(Number(process.env.STUB_PORT ?? 47200));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureGateway(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await stub.stop();
  });

  beforeEach(() => {
    stub.calls.length = 0;
    stub
      .on('GET /internal/auth/revoked/', { status: 200, body: { revoked: false } })
      .on('POST /auth/login', { status: 200, body: { accessToken: 'x' } })
      .on('GET /reports/mine', { status: 200, body: { items: [] } })
      .on('POST /reports', { status: 201, body: { id: 'r1' } })
      .on('POST /evidences', { status: 201, body: [] })
      .on('GET /locations/geojson', { status: 200, body: { type: 'FeatureCollection', features: [] } })
      .on('GET /health', { status: 200, body: { status: 'ok' } });
  });

  const api = () => request(app.getHttpServer());
  const last = () => stub.calls.filter((c) => !c.url.startsWith('/internal/auth/revoked')).at(-1)!;

  it('reenvía una ruta pública quitando /api, inyecta la clave interna y transmite el cuerpo', async () => {
    await api().post('/api/auth/login').send({ email: 'a@b.co', password: 'Clave1234' }).expect(200);
    expect(last()).toMatchObject({
      method: 'POST',
      url: '/auth/login',
      body: { email: 'a@b.co', password: 'Clave1234' },
    });
    expect(last().headers['x-internal-api-key']).toBe(KEY);
    expect(last().headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('el mapa público no requiere token', async () => {
    await api().get('/api/locations/geojson?category=BASURA').expect(200);
    expect(last().url).toBe('/locations/geojson?category=BASURA');
  });

  it('exige token en rutas protegidas (401) y no contacta al servicio', async () => {
    const res = await api().get('/api/reports/mine').expect(401);
    expect(res.body).toMatchObject({ statusCode: 401, message: 'Token de acceso requerido' });
    await api().get('/api/reports/mine').set('Authorization', 'Bearer a.b.c').expect(401);
    expect(stub.callsTo('GET /reports')).toHaveLength(0);
  });

  it('propaga la identidad verificada y elimina el token y las cabeceras falsificadas por el cliente', async () => {
    await api()
      .get('/api/reports/mine')
      .set('Authorization', token())
      .set('x-user-role', 'ADMIN')
      .set('x-user-id', 'atacante')
      .set('x-internal-api-key', 'falsa')
      .expect(200);
    const h = last().headers;
    expect(h['x-user-id']).toBe(USER);
    expect(h['x-user-role']).toBe('CIUDADANO');
    expect(h['x-token-jti']).toBe(JTI);
    expect(h['x-internal-api-key']).toBe(KEY);
    expect(h.authorization).toBeUndefined();
  });

  it('una ruta pública no puede inyectar identidad', async () => {
    await api().post('/api/auth/login').set('x-user-role', 'ADMIN').send({}).expect(200);
    expect(last().headers['x-user-role']).toBeUndefined();
  });

  it.each([
    '/api/reports/internal/r1/access',
    '/api/internal/users',
    '/api/users/%69nternal/x',
    '/api/desconocido',
    '/otra',
  ])('responde 404 a la ruta no expuesta %s', async (url: string) => {
    await api().get(url).set('Authorization', token()).expect(404);
  });

  it('rechaza un token revocado (401) y falla cerrado si users no responde (503)', async () => {
    stub.on('GET /internal/auth/revoked/', { status: 200, body: { revoked: true } });
    await api()
      .get('/api/reports/mine')
      .set('Authorization', token('CIUDADANO', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'))
      .expect(401);
    stub.off('GET /internal/auth/revoked/');
    await api()
      .get('/api/reports/mine')
      .set('Authorization', token('CIUDADANO', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'))
      .expect(503);
  });

  it('reenvía multipart en streaming hacia multimedia', async () => {
    await api()
      .post('/api/evidences')
      .set('Authorization', token())
      .field('reportId', 'r1')
      .attach('files', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), 'foto.jpg')
      .expect(201);
    expect(String(last().headers['content-type'])).toMatch(/^multipart\/form-data; boundary=/);
    expect(String(last().body)).toContain('name="reportId"');
  });

  it('servicio caído → 503 JSON sin afectar a los demás servicios', async () => {
    const res = await api()
      .get('/api/classifications?reportId=x')
      .set('Authorization', token('FUNCIONARIO'))
      .expect(503);
    expect(res.body).toMatchObject({ statusCode: 503, message: 'El servicio ai no está disponible temporalmente' });
    await api().get('/api/reports/mine').set('Authorization', token()).expect(200);
  });

  it('servicio lento → 504 al superar el timeout del proxy', async () => {
    stub.on('GET /reports/mine', { status: 200, body: {}, delayMs: 1500 });
    await api().get('/api/reports/mine').set('Authorization', token()).expect(504);
  });

  it('aplica cabeceras de seguridad (Helmet) y CORS solo para orígenes permitidos', async () => {
    const ok = await api()
      .options('/api/reports')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const bad = await api()
      .options('/api/reports')
      .set('Origin', 'https://malicioso.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
    const res = await api().get('/api/health/live').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('health agregado informa degradación cuando un servicio no responde', async () => {
    const res = await api().get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'degraded', services: { users: 'up', reports: 'up', ai: 'down' } });
  });

  it('documentación pública sin rutas internas', async () => {
    stub.on('GET /docs-json', {
      status: 200,
      body: { openapi: '3.0.0', paths: { '/reports': {}, '/internal/reports/{id}/access': {} } },
    });
    const res = await api().get('/api/docs/services/reports').expect(200);
    expect(Object.keys((res.body as { paths: object }).paths)).toEqual(['/reports']);
    await api().get('/api/docs/services/nope').expect(404);
    await api().get('/api/docs').expect(200);
  });

  it('limita los intentos de inicio de sesión por IP (429)', async () => {
    let status = 0;
    for (let i = 0; i < 8 && status !== 429; i++) {
      status = (await api().post('/api/auth/login').send({})).status;
    }
    expect(status).toBe(429);
  });
});
