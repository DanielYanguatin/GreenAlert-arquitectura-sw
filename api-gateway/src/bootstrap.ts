import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { TokenVerifier } from './auth/token-verifier';
import { authenticate, type GatewayOptions, proxy, rateLimiters, requestId } from './gateway/gateway.middleware';
import { SERVICE_NAMES, serviceUrls } from './routing/routes';

/**
 * Cadena de middlewares del gateway (el orden importa):
 * cabeceras de seguridad → CORS → id de solicitud → límite de solicitudes → autenticación → proxy.
 */
export function configureGateway(app: NestExpressApplication): NestExpressApplication {
  const config = app.get(ConfigService);
  const options: GatewayOptions = {
    serviceUrls: serviceUrls(process.env),
    internalApiKey: config.getOrThrow<string>('INTERNAL_API_KEY'),
    verifier: app.get(TokenVerifier),
    proxyTimeoutMs: Number(config.get('PROXY_TIMEOUT_MS') ?? 15000),
    rateLimit: {
      windowMs: Number(config.get('RATE_LIMIT_WINDOW_MS') ?? 60_000),
      max: Number(config.get('RATE_LIMIT_MAX') ?? 300),
      authMax: Number(config.get('RATE_LIMIT_AUTH_MAX') ?? 20),
    },
  };

  const trustProxy = config.get<string>('TRUST_PROXY');
  if (trustProxy) app.set('trust proxy', Number.isNaN(Number(trustProxy)) ? trustProxy : Number(trustProxy));
  app.disable('x-powered-by');

  const strict = helmet();
  const docs = helmet({ contentSecurityPolicy: false }); // Swagger UI usa scripts en línea
  app.use((req: { path: string }, res: unknown, next: () => void) =>
    (req.path.startsWith('/api/docs') ? docs : strict)(req as never, res as never, next),
  );

  const origins = (config.get<string>('CORS_ORIGINS') ?? 'http://localhost:5173,http://localhost:8080')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy'],
    credentials: false,
    maxAge: 600,
  });

  app.use(requestId());
  for (const limiter of rateLimiters(options.rateLimit)) app.use(limiter);
  app.use(authenticate(options));
  app.use(proxy(options));

  const gatewayDoc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('GreenAlert · API Gateway')
      .setDescription(
        'Punto de entrada único. Seleccione un servicio en la barra superior para ver sus rutas públicas ' +
          '(prefijo /api). Las rutas /internal no se exponen.',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, gatewayDoc, {
    jsonDocumentUrl: 'api/docs/gateway-json',
    explorer: true,
    swaggerOptions: {
      urls: [
        { url: '/api/docs/gateway-json', name: 'gateway' },
        ...SERVICE_NAMES.map((name) => ({ url: `/api/docs/services/${name}`, name })),
      ],
      persistAuthorization: true,
    },
  });
  app.enableShutdownHooks();
  return app;
}
