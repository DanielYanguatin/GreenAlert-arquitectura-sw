import { ConfigService } from '@nestjs/config';
import { StubServer } from '../../test/stub-server';
import { UpstreamError } from '../common/http-client';
import { UNDETERMINED } from './classifier.port';
import { HeuristicKeywordClassifier, normalize } from './heuristic.classifier';
import { HttpVisionClassifier } from './http-vision.classifier';

const evidence = (name = 'foto.jpg', url = 'http://127.0.0.1:1/x') => ({
  id: '11111111-1111-4111-8111-111111111111',
  url,
  mimeType: 'image/jpeg',
  originalName: name,
});

describe('HeuristicKeywordClassifier (prueba, no entrenado)', () => {
  const classifier = new HeuristicKeywordClassifier();
  const run = (text: string, file?: string) =>
    classifier.classify({ reportId: 'r', text, evidences: [evidence(file)] });

  it('normaliza tildes y signos', () => {
    expect(normalize('Quebrada Taruca: ¡Peces muertos!')).toBe('quebrada taruca   peces muertos ');
  });

  it.each([
    ['Montón de basura y bolsas plásticas en la calle', 'BASURA'],
    ['Tala de árboles con motosierra en el bosque', 'DEFORESTACION'],
    ['Humo negro por quema de llantas', 'HUMO_QUEMAS'],
    ['Draga y mercurio en el río, minería sin permiso', 'MINERIA_ILEGAL'],
    ['Vertimiento de aguas residuales desde una tubería', 'VERTIMIENTOS'],
    ['Espuma y peces muertos en la quebrada', 'CONTAMINACION_HIDRICA'],
  ])('sugiere una categoría para "%s"', async (text: string, expected: string) => {
    const res = await run(text);
    expect(res.suggestedCategory).toBe(expected);
    expect(res.confidence).toBeGreaterThan(0);
  });

  it('nunca supera la confianza máxima declarada (0.6)', async () => {
    const res = await run('basura basura residuos desechos escombros botadero bolsas');
    expect(res.confidence).toBeLessThanOrEqual(0.6);
  });

  it('devuelve SIN_DETERMINAR con confianza 0 si no hay evidencia textual', async () => {
    await expect(run('Situación extraña en el barrio')).resolves.toMatchObject({
      suggestedCategory: UNDETERMINED,
      confidence: 0,
    });
  });

  it('devuelve SIN_DETERMINAR ante empate', async () => {
    await expect(run('humo y basura')).resolves.toMatchObject({ suggestedCategory: UNDETERMINED });
  });

  it('usa el nombre del archivo como pista y evita falsos positivos por subcadenas', async () => {
    await expect(run('Reporte', 'incendio_forestal.jpg')).resolves.toHaveProperty('suggestedCategory', 'HUMO_QUEMAS');
    await expect(run('El deterioro del parque')).resolves.toHaveProperty('suggestedCategory', UNDETERMINED);
  });

  it('identifica el proveedor como prueba', async () => {
    const res = await run('basura');
    expect(res.provider).toBe('heuristic-keywords');
    expect(res.modelVersion).toContain('no-entrenado');
  });
});

describe('HttpVisionClassifier (adaptador para un modelo futuro)', () => {
  const stub = new StubServer();
  const port = 47105;
  const base = `http://127.0.0.1:${port}`;
  const build = (extra: Record<string, unknown> = {}) =>
    new HttpVisionClassifier(
      new ConfigService({
        INTERNAL_API_KEY: 'k'.repeat(24),
        AI_MODEL_URL: `${base}/model`,
        AI_MODEL_TIMEOUT_MS: 500,
        ...extra,
      }),
    );
  const input = { reportId: 'r', text: 'texto', evidences: [evidence('a.jpg', `${base}/img/1`)] };

  beforeAll(() => stub.start(port));
  afterAll(() => stub.stop());
  beforeEach(() => {
    stub.calls.length = 0;
    stub.on('GET /img/', { status: 200, body: 'binario' });
  });

  it('descarga la evidencia con clave interna y valida la respuesta del modelo', async () => {
    stub.on('POST /model', {
      status: 200,
      body: { category: 'DEFORESTACION', confidence: 0.83, scores: { DEFORESTACION: 0.83, X: 1 }, modelVersion: 'm1' },
    });
    const res = await build().classify(input);
    expect(res).toMatchObject({
      suggestedCategory: 'DEFORESTACION',
      confidence: 0.83,
      provider: 'http-vision',
      modelVersion: 'm1',
    });
    expect(res.scores).toEqual({ DEFORESTACION: 0.83 });
    expect(stub.callsTo('GET /img/1')[0].headers['x-internal-api-key']).toBe('k'.repeat(24));
    const body = stub.callsTo('POST /model')[0].body as { images: { base64: string }[] };
    expect(body.images[0].base64).toBe(Buffer.from('"binario"').toString('base64'));
  });

  it('categorías desconocidas → SIN_DETERMINAR', async () => {
    stub.on('POST /model', { status: 200, body: { category: 'VOLCAN', confidence: 0.9 } });
    await expect(build().classify(input)).resolves.toMatchObject({ suggestedCategory: UNDETERMINED, confidence: 0 });
  });

  it('rechaza confianzas fuera de [0, 1]', async () => {
    stub.on('POST /model', { status: 200, body: { category: 'BASURA', confidence: 7 } });
    await expect(build().classify(input)).rejects.toBeInstanceOf(UpstreamError);
  });

  it('falla de forma controlada si el modelo no está configurado o no responde', async () => {
    await expect(build({ AI_MODEL_URL: '' }).classify(input)).rejects.toThrow('AI_MODEL_URL');
    stub.off('POST /model');
    await expect(build().classify(input)).rejects.toBeInstanceOf(UpstreamError);
    await expect(build({ AI_MODEL_URL: 'http://127.0.0.1:1/model' }).classify(input)).rejects.toThrow(
      'Modelo no disponible',
    );
  });

  it('falla si la evidencia no se puede descargar', async () => {
    stub.on('GET /img/', { status: 404, body: {} });
    await expect(build().classify(input)).rejects.toThrow('multimedia respondió 404');
  });
});
