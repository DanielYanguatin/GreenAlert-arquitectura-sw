import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

const ROLES = ['ADMIN', 'CIUDADANO', 'FUNCIONARIO', 'GESTOR_AMBIENTAL'];

export interface VerifiedToken {
  sub: string;
  email: string;
  role: string;
  jti: string;
  exp: number;
}

interface CacheEntry {
  revoked: boolean;
  until: number;
}

/**
 * Verifica el JWT localmente (firma HS256, emisor, caducidad) y consulta la revocación en users
 * con una caché de TTL corto. Si users no responde se rechaza la solicitud (fail-closed): se prefiere
 * seguridad frente a disponibilidad en este punto (ver ATAM, punto de compromiso PC-01).
 */
@Injectable()
export class TokenVerifier {
  private readonly logger = new Logger(TokenVerifier.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheTtlMs: number;
  private readonly usersUrl: string;
  private readonly internalKey: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.cacheTtlMs = Number(config.get('REVOCATION_CACHE_TTL_MS') ?? 30_000);
    this.usersUrl = config.get<string>('USERS_SERVICE_URL') ?? 'http://users:3001';
    this.internalKey = config.getOrThrow<string>('INTERNAL_API_KEY');
    this.timeoutMs = Number(config.get('HTTP_TIMEOUT_MS') ?? 3000);
  }

  async verify(authorization: string | undefined): Promise<VerifiedToken> {
    const match = /^Bearer\s+([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)$/.exec(authorization ?? '');
    if (!match) throw new UnauthorizedException('Token de acceso requerido');

    let payload: VerifiedToken;
    try {
      payload = await this.jwt.verifyAsync<VerifiedToken>(match[1], {
        algorithms: ['HS256'],
        issuer: 'greenalert-users',
      });
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    if (!payload.sub || !payload.jti || !ROLES.includes(payload.role)) {
      throw new UnauthorizedException('Token con contenido inválido');
    }
    if (await this.isRevoked(payload.jti)) throw new UnauthorizedException('La sesión fue cerrada');
    return payload;
  }

  /** Invalida la entrada de caché (se llama tras un logout que pasa por el gateway). */
  forget(jti: string): void {
    this.cache.delete(jti);
  }

  private async isRevoked(jti: string): Promise<boolean> {
    const now = Date.now();
    const cached = this.cache.get(jti);
    if (cached && cached.until > now) return cached.revoked;

    let revoked: boolean;
    try {
      const res = await fetch(`${this.usersUrl}/internal/auth/revoked/${encodeURIComponent(jti)}`, {
        headers: { 'x-internal-api-key': this.internalKey },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) throw new Error(`users respondió ${res.status}`);
      revoked = ((await res.json()) as { revoked: boolean }).revoked === true;
    } catch (e) {
      this.logger.warn(`No se pudo verificar la revocación: ${(e as Error).message}`);
      throw new ServiceUnavailableException('Servicio de autenticación no disponible');
    }
    this.cache.set(jti, { revoked, until: now + this.cacheTtlMs });
    if (this.cache.size > 50_000) this.evictExpired(now);
    return revoked;
  }

  private evictExpired(now: number): void {
    for (const [key, entry] of this.cache) if (entry.until <= now) this.cache.delete(key);
  }
}
