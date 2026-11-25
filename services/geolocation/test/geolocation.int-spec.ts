import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { resetTestDatabase } from './test-db';

const KEY = process.env.INTERNAL_API_KEY!;
const internal = { 'x-internal-api-key': KEY };
const admin = { ...internal, 'x-user-id': 'a1', 'x-user-role': 'ADMIN' };
const officer = { ...internal, 'x-user-id': 'f1', 'x-user-role': 'FUNCIONARIO' };
const citizen = { ...internal, 'x-user-id': 'c1', 'x-user-role': 'CIUDADANO' };
const R1 = '55555555-5555-4555-8555-555555555555';
const R2 = '66666666-6666-4666-8666-666666666666';
const projection = { category: 'BASURA', status: 'PENDIENTE', title: 'Basura', reportedAt: '2026-11-20T10:00:00.000Z' };

describe('geolocation (integración)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    await resetTestDatabase('greenalert_geolocation_test');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication()) as INestApplication<App>;
    await app.init();
  });

  afterAll(() => app?.close());
  const api = () => request(app.getHttpServer());

  it('carga los 13 municipios del Putumayo; solo Mocoa habilitado', async () => {
    const res = await api().get('/municipalities').set(internal).expect(200);
    const list = res.body as { code: string; enabled: boolean }[];
    expect(list).toHaveLength(13);
    expect(list.filter((m) => m.enabled).map((m) => m.code)).toEqual(['86001']);
  });

  it('valida coordenadas dentro de Mocoa', async () => {
    await api()
      .post('/internal/locations/validate')
      .set(internal)
      .send({ latitude: 1.148, longitude: -76.646 })
      .expect(200, { municipalityCode: '86001', municipalityName: 'Mocoa' });
  });

  it.each([
    [{ latitude: 4.711, longitude: -74.072 }, 422, 'Bogotá, fuera de cobertura'],
    [{ latitude: 95, longitude: -76.6 }, 400, 'latitud inválida'],
    [{ latitude: 1.1, longitude: 'abc' }, 400, 'longitud no numérica'],
    [{ latitude: 1.1 }, 400, 'longitud faltante'],
  ])('valida %j → %i (%s)', async (body: object, status: number, _reason: string) => {
    await api().post('/internal/locations/validate').set(internal).send(body).expect(status);
  });

  it('registra y actualiza la proyección (idempotente por reportId)', async () => {
    const at = (latitude: number, longitude: number, extra: object = {}) => ({
      latitude,
      longitude,
      ...projection,
      ...extra,
    });
    await api().put(`/internal/locations/${R1}`).set(internal).send(at(1.15, -76.65)).expect(200);
    await api()
      .put(`/internal/locations/${R1}`)
      .set(internal)
      .send(at(1.15, -76.65, { status: 'EN_PROCESO' }))
      .expect(200);
    await api()
      .put(`/internal/locations/${R2}`)
      .set(internal)
      .send(at(1.2, -76.6, { category: 'DEFORESTACION' }))
      .expect(200);
    await api().put(`/internal/locations/${R2}`).set(internal).send(at(4.7, -74.07)).expect(422);
  });

  it('GeoJSON público filtrable, con coordenadas [lng, lat] y sin datos personales', async () => {
    const res = await api().get('/locations/geojson?municipality=86001').set(internal).expect(200);
    const fc = res.body as { features: { geometry: { coordinates: number[] }; properties: Record<string, unknown> }[] };
    expect(fc.features).toHaveLength(2);
    const r1 = fc.features.find((f) => f.properties.reportId === R1)!;
    expect(r1.geometry.coordinates).toEqual([-76.65, 1.15]);
    expect(r1.properties).toMatchObject({ status: 'EN_PROCESO', municipality: 'Mocoa' });
    expect(r1.properties).not.toHaveProperty('userId');

    const byCat = await api().get('/locations/geojson?category=DEFORESTACION').set(internal).expect(200);
    expect((byCat.body as { features: unknown[] }).features).toHaveLength(1);
    const byBox = await api().get('/locations/geojson?bbox=-76.66,1.14,-76.64,1.16').set(internal).expect(200);
    expect((byBox.body as { features: unknown[] }).features).toHaveLength(1);
    await api().get('/locations/geojson?bbox=texto').set(internal).expect(400);
  });

  it('consulta por radio (personal institucional)', async () => {
    const res = await api().get('/locations/near?latitude=1.15&longitude=-76.65&radiusKm=1').set(officer).expect(200);
    expect((res.body as { reportId: string }[]).map((r) => r.reportId)).toEqual([R1]);
    await api().get('/locations/near?latitude=1.15&longitude=-76.65').set(citizen).expect(403);
    await api().get('/locations/near?latitude=1.15&longitude=-76.65&radiusKm=500').set(officer).expect(400);
  });

  it('amplía la cobertura a otro municipio sin cambiar código (ADMIN)', async () => {
    const box = { enabled: true, minLat: 0.95, maxLat: 1.1, minLng: -76.75, maxLng: -76.55 };
    await api().patch('/municipalities/86885').set(officer).send(box).expect(403);
    await api().patch('/municipalities/86885').set(admin).send(box).expect(200);
    // El punto pertenece a ambos rectángulos aproximados; gana el más específico.
    await api()
      .post('/internal/locations/validate')
      .set(internal)
      .send({ latitude: 1.0, longitude: -76.6 })
      .expect(200, { municipalityCode: '86885', municipalityName: 'Villagarzón' });
  });

  it('rechaza solicitudes sin clave interna', async () => {
    await api().post('/internal/locations/validate').send({ latitude: 1.1, longitude: -76.6 }).expect(401);
  });
});
