import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import { IS_PUBLIC_KEY, isRole, type RequestWithIdentity, type Role, ROLES_KEY, SKIP_INTERNAL_KEY } from './identity';

function header(req: RequestWithIdentity, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Exige la clave interna compartida. Garantiza que solo el gateway u otros servicios
 * de la plataforma puedan invocar este microservicio (defensa en profundidad).
 */
@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_INTERNAL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;
    const req = context.switchToHttp().getRequest<RequestWithIdentity>();
    const provided = header(req, 'x-internal-api-key');
    const expected = this.config.getOrThrow<string>('INTERNAL_API_KEY');
    if (!provided || !safeEqual(provided, expected)) {
      throw new UnauthorizedException('Clave interna inválida');
    }
    return true;
  }
}

/** Construye la identidad desde las cabeceras del gateway y aplica el control de roles. */
@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const req = context.switchToHttp().getRequest<RequestWithIdentity>();
    const userId = header(req, 'x-user-id');
    const role = header(req, 'x-user-role');
    if (userId && isRole(role)) {
      const exp = Number(header(req, 'x-token-exp'));
      req.identity = {
        userId,
        role,
        email: header(req, 'x-user-email') ?? '',
        jti: header(req, 'x-token-jti'),
        tokenExp: Number.isFinite(exp) ? exp : undefined,
      };
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
    if (isPublic) return true;
    if (!req.identity) throw new UnauthorizedException('Autenticación requerida');

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (roles && roles.length > 0 && !roles.includes(req.identity.role)) {
      throw new ForbiddenException('No tiene permisos para esta operación');
    }
    return true;
  }
}
