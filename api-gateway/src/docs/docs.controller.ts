import { Controller, Get, NotFoundException, Param, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { SERVICE_NAMES, type ServiceName, serviceUrls } from '../routing/routes';

interface OpenApiDocument {
  paths?: Record<string, unknown>;
  servers?: { url: string }[];
  [key: string]: unknown;
}

/**
 * Publica la documentación OpenAPI de cada microservicio tal como la ve el frontend:
 * con prefijo /api y SIN las rutas /internal ni /health (que el gateway no expone).
 */
export function toPublicDocument(doc: OpenApiDocument): OpenApiDocument {
  const paths = Object.fromEntries(
    Object.entries(doc.paths ?? {}).filter(([path]) => !path.startsWith('/internal') && !path.startsWith('/health')),
  );
  return { ...doc, servers: [{ url: '/api' }], paths };
}

@ApiExcludeController()
@Controller('api/docs/services')
export class DocsController {
  private readonly urls: Record<ServiceName, string>;
  private readonly internalKey: string;

  constructor(config: ConfigService) {
    this.urls = serviceUrls(process.env);
    this.internalKey = config.getOrThrow<string>('INTERNAL_API_KEY');
  }

  @Get(':service')
  async serviceDoc(@Param('service') service: string): Promise<OpenApiDocument> {
    if (!(SERVICE_NAMES as readonly string[]).includes(service)) throw new NotFoundException('Servicio desconocido');
    try {
      const res = await fetch(`${this.urls[service as ServiceName]}/docs-json`, {
        headers: { 'x-internal-api-key': this.internalKey },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new Error(String(res.status));
      return toPublicDocument((await res.json()) as OpenApiDocument);
    } catch {
      throw new ServiceUnavailableException(`La documentación de ${service} no está disponible`);
    }
  }
}
