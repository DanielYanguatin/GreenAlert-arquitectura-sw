import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

export enum Role {
  ADMIN = 'ADMIN',
  CIUDADANO = 'CIUDADANO',
  FUNCIONARIO = 'FUNCIONARIO',
  GESTOR_AMBIENTAL = 'GESTOR_AMBIENTAL',
}

/** Roles con funciones institucionales (gestión de reportes). */
export const STAFF_ROLES: readonly Role[] = [Role.ADMIN, Role.FUNCIONARIO, Role.GESTOR_AMBIENTAL];

/** Identidad verificada por el API Gateway y propagada mediante cabeceras internas. */
export interface Identity {
  userId: string;
  role: Role;
  email: string;
  jti?: string;
  tokenExp?: number;
}

export interface RequestWithIdentity extends Request {
  identity?: Identity;
}

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const SKIP_INTERNAL_KEY = 'skipInternalKey';

/** La ruta no requiere identidad de usuario (sí requiere clave interna). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
/** La ruta exige alguno de los roles indicados. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
/** La ruta no exige clave interna (solo health checks). */
export const SkipInternalKey = () => SetMetadata(SKIP_INTERNAL_KEY, true);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): Identity => {
  const req = ctx.switchToHttp().getRequest<RequestWithIdentity>();
  if (!req.identity) {
    throw new Error('Identidad no disponible: la ruta debe estar protegida por IdentityGuard');
  }
  return req.identity;
});

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (Object.values(Role) as string[]).includes(value);
}
