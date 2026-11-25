import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { resetTestDatabase } from './test-db';

const KEY = 'integration-internal-key-0123456789';
const ADMIN = { email: 'admin@greenalert.test', password: 'Admin12345' };

/**
 * Pruebas de integración: aplicación Nest completa + MySQL real + servicio de notificaciones simulado
 * mediante un servidor HTTP local (verifica la comunicación entre servicios).
 */
describe('users (integración)', () => {
  let app: INestApplication<App>;
  let notifServer: Server;
  const notifCalls: unknown[] = [];
  let notifStatus = 202;

  beforeAll(async () => {
    notifServer = createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        notifCalls.push({ url: req.url, key: req.headers['x-internal-api-key'], body: JSON.parse(body) as unknown });
        res.statusCode = notifStatus;
        res.end('{}');
      });
    });
    await new Promise<void>((r) => notifServer.listen(0, r));

    await resetTestDatabase('greenalert_users_test');
    Object.assign(process.env, {
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      NOTIFICATIONS_SERVICE_URL: `http://127.0.0.1:${(notifServer.address() as AddressInfo).port}`,
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication()) as INestApplication<App>;
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await new Promise<void>((r) => notifServer.close(() => r()));
  });

  const api = () => request(app.getHttpServer());
  const asUser = (id: string, role: string) => ({
    'x-internal-api-key': KEY,
    'x-user-id': id,
    'x-user-role': role,
    'x-user-email': 'x@y.co',
  });

  let citizenId = '';

  it('aplica las migraciones (tablas creadas)', async () => {
    const tables = await app
      .get(DataSource)
      .query<{ t: string }[]>(
        "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'greenalert_users_test'",
      );
    expect(tables.map((r) => r.t)).toEqual(expect.arrayContaining(['users', 'revoked_tokens', 'migrations']));
  });

  it('GET /health responde sin clave interna', async () => {
    await api().get('/health').expect(200, { status: 'ok', service: 'users', database: 'up' });
  });

  it('rechaza solicitudes sin clave interna (401)', async () => {
    await api().post('/auth/login').send(ADMIN).expect(401);
  });

  it('registra un ciudadano y notifica al servicio de notificaciones', async () => {
    const res = await api()
      .post('/auth/register')
      .set('x-internal-api-key', KEY)
      .send({ email: 'Ciudadano@Example.com', password: 'Clave1234', fullName: 'Carlos Díaz' })
      .expect(201);
    const body = res.body as { id: string; email: string; role: string };
    citizenId = body.id;
    expect(body.email).toBe('ciudadano@example.com');
    expect(body.role).toBe('CIUDADANO');
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(notifCalls).toHaveLength(1);
    expect(notifCalls[0]).toMatchObject({ url: '/internal/notifications', key: KEY, body: { type: 'REGISTRO' } });
  });

  it('el registro funciona aunque notifications responda con error', async () => {
    notifStatus = 503;
    await api()
      .post('/auth/register')
      .set('x-internal-api-key', KEY)
      .send({ email: 'otra@example.com', password: 'Clave1234', fullName: 'Otra Persona' })
      .expect(201);
    notifStatus = 202;
  });

  it('rechaza correo duplicado (409)', async () => {
    await api()
      .post('/auth/register')
      .set('x-internal-api-key', KEY)
      .send({ email: 'ciudadano@example.com', password: 'Clave1234', fullName: 'Carlos Díaz' })
      .expect(409);
  });

  it.each([
    [{ email: 'no-es-correo', password: 'Clave1234', fullName: 'Nombre' }, 'correo inválido'],
    [{ email: 'a@b.co', password: 'debil', fullName: 'Nombre' }, 'contraseña débil'],
    [{ email: 'a@b.co', password: 'Clave1234' }, 'nombre faltante'],
    [{ email: 'a@b.co', password: 'Clave1234', fullName: 'Nombre', role: 'ADMIN' }, 'campo no permitido (role)'],
  ])('valida datos de registro: %j (%s) → 400', async (payload: object, _reason: string) => {
    await api().post('/auth/register').set('x-internal-api-key', KEY).send(payload).expect(400);
  });

  it('almacena la contraseña cifrada con bcrypt', async () => {
    const rows = await app
      .get(DataSource)
      .query<{ password_hash: string }[]>('SELECT password_hash FROM users WHERE email = ?', ['ciudadano@example.com']);
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$10\$/);
  });

  let token = '';
  let jti = '';

  it('inicia sesión y devuelve un JWT', async () => {
    const res = await api()
      .post('/auth/login')
      .set('x-internal-api-key', KEY)
      .send({ email: 'ciudadano@example.com', password: 'Clave1234' })
      .expect(200);
    token = (res.body as { accessToken: string }).accessToken;
    jti = (JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { jti: string }).jti;
    expect(token.split('.')).toHaveLength(3);
  });

  it('rechaza credenciales incorrectas (401)', async () => {
    await api()
      .post('/auth/login')
      .set('x-internal-api-key', KEY)
      .send({ email: 'ciudadano@example.com', password: 'Incorrecta1' })
      .expect(401);
  });

  it('GET /auth/me exige identidad y devuelve el perfil', async () => {
    await api().get('/auth/me').set('x-internal-api-key', KEY).expect(401);
    const res = await api().get('/auth/me').set(asUser(citizenId, 'CIUDADANO')).expect(200);
    expect(res.body).toMatchObject({ id: citizenId, fullName: 'Carlos Díaz' });
  });

  it('PATCH /users/me actualiza el perfil', async () => {
    const res = await api()
      .patch('/users/me')
      .set(asUser(citizenId, 'CIUDADANO'))
      .send({ phone: '3101234567' })
      .expect(200);
    expect(res.body).toHaveProperty('phone', '3101234567');
  });

  it('un ciudadano no puede listar usuarios (403)', async () => {
    await api().get('/users').set(asUser(citizenId, 'CIUDADANO')).expect(403);
  });

  it('el administrador inicial puede cambiar roles', async () => {
    const login = await api().post('/auth/login').set('x-internal-api-key', KEY).send(ADMIN).expect(200);
    const adminId = (login.body as { user: { id: string } }).user.id;
    const list = await api().get('/users?limit=50').set(asUser(adminId, 'ADMIN')).expect(200);
    expect((list.body as { total: number }).total).toBeGreaterThanOrEqual(3);

    await api()
      .patch(`/users/${citizenId}/role`)
      .set(asUser(adminId, 'ADMIN'))
      .send({ role: 'FUNCIONARIO', entity: 'CORPOAMAZONIA' })
      .expect(200);
    const staff = await api().get('/internal/users?roles=FUNCIONARIO').set('x-internal-api-key', KEY).expect(200);
    expect((staff.body as { id: string }[]).map((u) => u.id)).toContain(citizenId);
  });

  it('cierra sesión y la revocación es consultable por el gateway', async () => {
    await api().get(`/internal/auth/revoked/${jti}`).set('x-internal-api-key', KEY).expect(200, { revoked: false });
    await api()
      .post('/auth/logout')
      .set({
        ...asUser(citizenId, 'FUNCIONARIO'),
        'x-token-jti': jti,
        'x-token-exp': String(Math.floor(Date.now() / 1000) + 600),
      })
      .expect(204);
    await api().get(`/internal/auth/revoked/${jti}`).set('x-internal-api-key', KEY).expect(200, { revoked: true });
  });

  it('expone la documentación OpenAPI', async () => {
    const res = await api().get('/docs-json').expect(200);
    expect(Object.keys((res.body as { paths: object }).paths)).toEqual(
      expect.arrayContaining(['/auth/register', '/auth/login']),
    );
  });
});
