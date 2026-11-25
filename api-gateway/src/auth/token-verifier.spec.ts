import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { StubServer } from '../../test/stub-server';
import { toPublicDocument } from '../docs/docs.controller';
import { TokenVerifier } from './token-verifier';

const SECRET = 'unit-test-secret-unit-test-secret-1234';
const PORT = 47201;
const JTI = '99999999-9999-4999-8999-999999999999';

describe('TokenVerifier', () => {
  const jwt = new JwtService({ secret: SECRET });
  const stub = new StubServer();
  let verifier: TokenVerifier;

  const sign = (payload: object, opts: { expiresIn?: number; issuer?: string; secret?: string } = {}) =>
    jwt.sign(
      { sub: 'u1', email: 'a@b.co', role: 'CIUDADANO', jti: JTI, ...payload },
      { expiresIn: opts.expiresIn ?? 600, issuer: opts.issuer ?? 'greenalert-users', secret: opts.secret ?? SECRET },
    );

  beforeAll(() => stub.start(PORT));
  afterAll(() => stub.stop());
  beforeEach(() => {
    stub.calls.length = 0;
    stub.on('GET /internal/auth/revoked/', { status: 200, body: { revoked: false } });
    verifier = new TokenVerifier(
      jwt,
      new ConfigService({
        INTERNAL_API_KEY: 'k'.repeat(24),
        USERS_SERVICE_URL: `http://127.0.0.1:${PORT}`,
        REVOCATION_CACHE_TTL_MS: 60_000,
        HTTP_TIMEOUT_MS: 500,
      }),
    );
  });

  it('acepta un token válido y consulta la revocación con la clave interna', async () => {
    await expect(verifier.verify(`Bearer ${sign({})}`)).resolves.toMatchObject({ sub: 'u1', role: 'CIUDADANO' });
    expect(stub.calls[0].headers['x-internal-api-key']).toBe('k'.repeat(24));
  });

  it('usa la caché de revocación', async () => {
    await verifier.verify(`Bearer ${sign({})}`);
    await verifier.verify(`Bearer ${sign({})}`);
    expect(stub.calls).toHaveLength(1);
    verifier.forget(JTI);
    await verifier.verify(`Bearer ${sign({})}`);
    expect(stub.calls).toHaveLength(2);
  });

  it.each([
    ['sin cabecera', undefined],
    ['esquema incorrecto', 'Basic abc'],
    ['token malformado', 'Bearer abc.def'],
  ])('rechaza %s', async (_n: string, header: string | undefined) => {
    await expect(verifier.verify(header)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza firma, emisor o caducidad inválidos', async () => {
    await expect(
      verifier.verify(`Bearer ${sign({}, { secret: 'otro-secreto-otro-secreto-otro-1234' })}`),
    ).rejects.toThrow('inválido');
    await expect(verifier.verify(`Bearer ${sign({}, { issuer: 'otro' })}`)).rejects.toThrow('inválido');
    await expect(verifier.verify(`Bearer ${sign({}, { expiresIn: -10 })}`)).rejects.toThrow('expirado');
  });

  it('rechaza roles desconocidos en el token', async () => {
    await expect(verifier.verify(`Bearer ${sign({ role: 'ROOT' })}`)).rejects.toThrow('contenido inválido');
  });

  it('rechaza tokens revocados', async () => {
    stub.on('GET /internal/auth/revoked/', { status: 200, body: { revoked: true } });
    await expect(verifier.verify(`Bearer ${sign({})}`)).rejects.toThrow('La sesión fue cerrada');
  });

  it('fail-closed: si users no responde → 503', async () => {
    stub.off('GET /internal/auth/revoked/');
    await expect(verifier.verify(`Bearer ${sign({})}`)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('toPublicDocument', () => {
  it('elimina rutas internas y de health y fija el prefijo /api', () => {
    const doc = toPublicDocument({ paths: { '/reports': {}, '/internal/reports/{id}/access': {}, '/health': {} } });
    expect(Object.keys(doc.paths!)).toEqual(['/reports']);
    expect(doc.servers).toEqual([{ url: '/api' }]);
  });
});
