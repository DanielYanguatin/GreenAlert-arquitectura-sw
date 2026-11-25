import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SERVICE_NAMES, type ServiceName, serviceUrls } from '../routing/routes';

type ServiceState = 'up' | 'down';

@ApiTags('health')
@Controller('api/health')
export class HealthController {
  private readonly urls: Record<ServiceName, string> = serviceUrls(process.env);

  @Get('live')
  @ApiOperation({ summary: 'El gateway está en ejecución (usado por el health check del contenedor)' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get()
  @ApiOperation({ summary: 'Estado agregado de la plataforma (degradado si algún servicio no responde)' })
  async check(): Promise<{ status: 'ok' | 'degraded'; services: Record<ServiceName, ServiceState> }> {
    const entries = await Promise.all(
      SERVICE_NAMES.map(async (name): Promise<[ServiceName, ServiceState]> => {
        try {
          const res = await fetch(`${this.urls[name]}/health`, { signal: AbortSignal.timeout(2000) });
          return [name, res.ok ? 'up' : 'down'];
        } catch {
          return [name, 'down'];
        }
      }),
    );
    const services = Object.fromEntries(entries) as Record<ServiceName, ServiceState>;
    return { status: entries.every(([, s]) => s === 'up') ? 'ok' : 'degraded', services };
  }
}
