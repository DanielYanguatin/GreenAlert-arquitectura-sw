import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readdir, rm } from 'node:fs/promises';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { FAKE_EXE, JPEG, PNG, SVG_XSS } from './fixtures';
import { StubServer } from './stub-server';
import { resetTestDatabase } from './test-db';

const KEY = process.env.INTERNAL_API_KEY!;
const REPORT = '44444444-4444-4444-8444-444444444444';
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const as = (id: string, role = 'CIUDADANO') => ({ 'x-internal-api-key': KEY, 'x-user-id': id, 'x-user-role': role });

describe('multimedia (integración)', () => {
  let app: INestApplication<App>;
  const stub = new StubServer();
  const uploadDir = process.env.UPLOAD_DIR!;

  beforeAll(async () => {
    await rm(uploadDir, { recursive: true, force: true });
    await stub.start(Number(process.env.STUB_PORT ?? 47003));
    await resetTestDatabase('greenalert_multimedia_test');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication()) as INestApplication<App>;
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await stub.stop();
  });

  beforeEach(() => {
    stub.on(`GET /internal/reports/${REPORT}/access`, {
      status: 200,
      body: { id: REPORT, ownerId: OWNER, status: 'PENDIENTE' },
    });
  });

  const api = () => request(app.getHttpServer());
  let evidenceId = '';

  it('sube fotografías válidas: archivo en disco y metadatos en MySQL', async () => {
    const res = await api()
      .post('/evidences')
      .set(as(OWNER))
      .field('reportId', REPORT)
      .attach('files', JPEG, { filename: 'basura.jpg', contentType: 'image/jpeg' })
      .attach('files', PNG, { filename: 'rio.png', contentType: 'image/png' })
      .expect(201);
    const body = res.body as { id: string; mimeType: string }[];
    evidenceId = body[0].id;
    expect(body.map((e) => e.mimeType)).toEqual(['image/jpeg', 'image/png']);
    expect(await readdir(uploadDir)).toHaveLength(2);
    expect(stub.callsTo(`GET /internal/reports/${REPORT}/access`)[0].headers['x-internal-api-key']).toBe(KEY);
  });

  it('rechaza con 415 un ejecutable disfrazado de JPEG y no escribe en disco', async () => {
    await api()
      .post('/evidences')
      .set(as(OWNER))
      .field('reportId', REPORT)
      .attach('files', FAKE_EXE, { filename: 'foto.jpg', contentType: 'image/jpeg' })
      .expect(415);
    expect(await readdir(uploadDir)).toHaveLength(2);
  });

  it('rechaza SVG (posible XSS) con 415', async () => {
    await api()
      .post('/evidences')
      .set(as(OWNER))
      .field('reportId', REPORT)
      .attach('files', SVG_XSS, { filename: 'mapa.svg', contentType: 'image/svg+xml' })
      .expect(415);
  });

  it('rechaza archivos mayores al límite con 413', async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(1024 * 1024 + 10)]);
    await api()
      .post('/evidences')
      .set(as(OWNER))
      .field('reportId', REPORT)
      .attach('files', big, { filename: 'grande.jpg', contentType: 'image/jpeg' })
      .expect(413);
  });

  it('valida reportId (400) y la autenticación (401)', async () => {
    await api()
      .post('/evidences')
      .set(as(OWNER))
      .field('reportId', 'no-uuid')
      .attach('files', JPEG, 'a.jpg')
      .expect(400);
    await api()
      .post('/evidences')
      .set('x-internal-api-key', KEY)
      .field('reportId', REPORT)
      .attach('files', JPEG, 'a.jpg')
      .expect(401);
  });

  it('un tercero no puede adjuntar (403) ni listar (404)', async () => {
    await api().post('/evidences').set(as(OTHER)).field('reportId', REPORT).attach('files', JPEG, 'a.jpg').expect(403);
    await api().get(`/evidences?reportId=${REPORT}`).set(as(OTHER)).expect(404);
  });

  it('reports caído → 503 al subir', async () => {
    stub.off(`GET /internal/reports/${REPORT}/access`);
    await api().post('/evidences').set(as(OWNER)).field('reportId', REPORT).attach('files', JPEG, 'a.jpg').expect(503);
  });

  it('respeta el máximo de evidencias por reporte (3)', async () => {
    await api().post('/evidences').set(as(OWNER)).field('reportId', REPORT).attach('files', JPEG, 'a.jpg').expect(201);
    await api().post('/evidences').set(as(OWNER)).field('reportId', REPORT).attach('files', JPEG, 'b.jpg').expect(400);
  });

  it('lista y descarga con cabeceras seguras', async () => {
    const list = await api().get(`/evidences?reportId=${REPORT}`).set(as(OWNER)).expect(200);
    expect(list.body).toHaveLength(3);
    const file = await api().get(`/evidences/${evidenceId}/file`).set(as(OWNER)).expect(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(file.body as Buffer, JPEG)).toBe(0);
  });

  it('endpoints internos para reports/ai', async () => {
    const list = await api().get(`/internal/evidences?reportId=${REPORT}`).set('x-internal-api-key', KEY).expect(200);
    expect(list.body).toHaveLength(3);
    await api().get(`/internal/evidences/${evidenceId}/file`).set('x-internal-api-key', KEY).expect(200);
    await api().get(`/internal/evidences/${evidenceId}/file`).expect(401);
  });

  it('elimina evidencia (autor) y su archivo', async () => {
    await api().delete(`/evidences/${evidenceId}`).set(as(OTHER)).expect(403);
    await api().delete(`/evidences/${evidenceId}`).set(as(OWNER)).expect(204);
    expect(await readdir(uploadDir)).toHaveLength(2);
    await api().get(`/evidences/${evidenceId}/file`).set(as(OWNER)).expect(404);
  });
});
