import { HttpException, Logger } from '@nestjs/common';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { ClientRequest, IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { Socket } from 'node:net';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { TokenVerifier, VerifiedToken } from '../auth/token-verifier';
import { isInternalPath, isPublicRoute, pathOf, resolveService, type ServiceName } from '../routing/routes';

const logger = new Logger('Gateway');

/** Cabeceras que solo el gateway puede establecer: se eliminan siempre de la solicitud del cliente. */
export const TRUSTED_HEADERS = [
  'x-internal-api-key',
  'x-user-id',
  'x-user-role',
  'x-user-email',
  'x-token-jti',
  'x-token-exp',
];

export interface GatewayRequest extends Request {
  requestId?: string;
  identity?: VerifiedToken;
}

export interface GatewayOptions {
  serviceUrls: Record<ServiceName, string>;
  internalApiKey: string;
  verifier: TokenVerifier;
  proxyTimeoutMs: number;
  rateLimit: { windowMs: number; max: number; authMax: number };
}

/** Rutas atendidas por el propio gateway (no se reenvían). */
const LOCAL_PREFIXES = ['/api/health', '/api/docs'];

export function sendError(res: Response | ServerResponse, status: number, message: string, req?: GatewayRequest): void {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(
    JSON.stringify({
      statusCode: status,
      error: status >= 500 ? 'UPSTREAM_ERROR' : 'REQUEST_ERROR',
      message,
      path: req ? pathOf(req.originalUrl ?? req.url) : undefined,
      requestId: req?.requestId,
    }),
  );
}

export function requestId(): RequestHandler {
  return (req: GatewayRequest, res, next) => {
    const incoming = req.headers['x-request-id'];
    const valid = typeof incoming === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(incoming);
    req.requestId = valid ? incoming : randomUUID();
    req.headers['x-request-id'] = req.requestId;
    res.setHeader('x-request-id', req.requestId);
    next();
  };
}

function isLocal(req: Request): boolean {
  const path = pathOf(req.originalUrl ?? req.url);
  return LOCAL_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Limitación de solicitudes por IP: general y estricta para login/registro (fuerza bruta). */
export function rateLimiters(options: GatewayOptions['rateLimit']): RequestHandler[] {
  const handler = (req: Request, res: Response) =>
    sendError(res, 429, 'Demasiadas solicitudes; intente de nuevo más tarde', req as GatewayRequest);
  const general = rateLimit({
    windowMs: options.windowMs,
    limit: options.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler,
    skip: (req) => isLocal(req),
  });
  const auth = rateLimit({
    windowMs: options.windowMs,
    limit: options.authMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler,
    skip: (req) => req.method !== 'POST' || !/^\/api\/auth\/(login|register)\/?$/.test(pathOf(req.originalUrl)),
  });
  return [general, auth];
}

/** Bloquea /internal, elimina cabeceras de confianza y autentica las rutas protegidas. */
export function authenticate(options: GatewayOptions): RequestHandler {
  return (req: GatewayRequest, res: Response, next: NextFunction) => {
    for (const h of TRUSTED_HEADERS) delete req.headers[h];
    if (isLocal(req)) return next();

    const url = req.originalUrl ?? req.url;
    if (!pathOf(url).startsWith('/api/') || isInternalPath(url) || !resolveService(url)) {
      return sendError(res, 404, 'Recurso no encontrado', req);
    }
    if (isPublicRoute(req.method, url)) return next();

    options.verifier
      .verify(req.headers.authorization)
      .then((identity) => {
        req.identity = identity;
        next();
      })
      .catch((e: unknown) => {
        const status = e instanceof HttpException ? e.getStatus() : 401;
        const message = e instanceof Error ? e.message : 'No autorizado';
        sendError(res, status, message, req);
      });
  };
}

/** Reenvío en streaming (incluye multipart) al microservicio propietario de la ruta. */
export function proxy(options: GatewayOptions): RequestHandler {
  const middleware = createProxyMiddleware<GatewayRequest, Response>({
    router: (req) => options.serviceUrls[resolveService(req.originalUrl ?? req.url)!],
    changeOrigin: true,
    xfwd: true,
    proxyTimeout: options.proxyTimeoutMs,
    pathRewrite: (path) => path.replace(/^\/api/, ''),
    on: {
      proxyReq: (proxyReq: ClientRequest, req: GatewayRequest) => {
        proxyReq.setHeader('x-internal-api-key', options.internalApiKey);
        if (req.requestId) proxyReq.setHeader('x-request-id', req.requestId);
        if (req.identity) {
          proxyReq.setHeader('x-user-id', req.identity.sub);
          proxyReq.setHeader('x-user-role', req.identity.role);
          proxyReq.setHeader('x-user-email', req.identity.email ?? '');
          proxyReq.setHeader('x-token-jti', req.identity.jti);
          proxyReq.setHeader('x-token-exp', String(req.identity.exp));
        }
        // El token del cliente no viaja a los servicios internos: la identidad ya fue verificada.
        proxyReq.removeHeader('authorization');
      },
      proxyRes: (proxyRes: IncomingMessage, req: GatewayRequest) => {
        if (req.identity && proxyRes.statusCode === 204 && /^\/api\/auth\/logout\/?$/.test(pathOf(req.originalUrl))) {
          options.verifier.forget(req.identity.jti);
        }
      },
      error: (err: Error, req: GatewayRequest, res: Response | Socket) => {
        const service = resolveService(req.originalUrl ?? req.url) ?? 'desconocido';
        const timeout =
          /timeout|ETIMEDOUT|ESOCKETTIMEDOUT/i.test(err.message) || (err as { code?: string }).code === 'ECONNRESET';
        logger.warn(`[${req.requestId}] ${req.method} ${req.originalUrl} → ${service}: ${err.message}`);
        if ('setHeader' in res) {
          sendError(res, timeout ? 504 : 503, `El servicio ${service} no está disponible temporalmente`, req);
        } else {
          res.destroy();
        }
      },
    },
  });
  return (req: GatewayRequest, res: Response, next: NextFunction) =>
    isLocal(req) ? next() : middleware(req, res, next);
}
