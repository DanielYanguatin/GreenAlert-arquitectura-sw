import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IdentityGuard, InternalApiKeyGuard } from './guards';
import { IS_PUBLIC_KEY, Role, ROLES_KEY, SKIP_INTERNAL_KEY, type RequestWithIdentity } from './identity';

const KEY = 'internal-key-internal-key-123456';

function ctx(headers: Record<string, string>): { context: ExecutionContext; req: RequestWithIdentity } {
  const req = { headers } as unknown as RequestWithIdentity;
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { context, req };
}

function reflectorWith(meta: Record<string, unknown>): Reflector {
  const r = new Reflector();
  jest.spyOn(r, 'getAllAndOverride').mockImplementation((key: unknown) => meta[key as string]);
  return r;
}

describe('InternalApiKeyGuard', () => {
  const config = new ConfigService({ INTERNAL_API_KEY: KEY });

  it('acepta la clave interna correcta', () => {
    const guard = new InternalApiKeyGuard(reflectorWith({}), config);
    expect(guard.canActivate(ctx({ 'x-internal-api-key': KEY }).context)).toBe(true);
  });

  it('rechaza clave ausente o incorrecta', () => {
    const guard = new InternalApiKeyGuard(reflectorWith({}), config);
    expect(() => guard.canActivate(ctx({}).context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx({ 'x-internal-api-key': 'otra' }).context)).toThrow(UnauthorizedException);
  });

  it('permite rutas marcadas como health', () => {
    const guard = new InternalApiKeyGuard(reflectorWith({ [SKIP_INTERNAL_KEY]: true }), config);
    expect(guard.canActivate(ctx({}).context)).toBe(true);
  });
});

describe('IdentityGuard', () => {
  const headers = { 'x-user-id': 'u1', 'x-user-role': Role.CIUDADANO, 'x-user-email': 'a@b.co', 'x-token-exp': '99' };

  it('construye la identidad desde las cabeceras del gateway', () => {
    const { context, req } = ctx(headers);
    expect(new IdentityGuard(reflectorWith({})).canActivate(context)).toBe(true);
    expect(req.identity).toEqual({ userId: 'u1', role: Role.CIUDADANO, email: 'a@b.co', jti: undefined, tokenExp: 99 });
  });

  it('rechaza rutas protegidas sin identidad', () => {
    expect(() => new IdentityGuard(reflectorWith({})).canActivate(ctx({}).context)).toThrow(UnauthorizedException);
  });

  it('ignora roles desconocidos', () => {
    const { context } = ctx({ 'x-user-id': 'u1', 'x-user-role': 'SUPERUSER' });
    expect(() => new IdentityGuard(reflectorWith({})).canActivate(context)).toThrow(UnauthorizedException);
  });

  it('permite rutas públicas sin identidad', () => {
    expect(new IdentityGuard(reflectorWith({ [IS_PUBLIC_KEY]: true })).canActivate(ctx({}).context)).toBe(true);
  });

  it('aplica el control de roles', () => {
    const guard = new IdentityGuard(reflectorWith({ [ROLES_KEY]: [Role.ADMIN] }));
    expect(() => guard.canActivate(ctx(headers).context)).toThrow(ForbiddenException);
    expect(guard.canActivate(ctx({ ...headers, 'x-user-role': Role.ADMIN }).context)).toBe(true);
  });
});
