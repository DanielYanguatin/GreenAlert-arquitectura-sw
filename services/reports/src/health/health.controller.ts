import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Public, SkipInternalKey } from '../common/identity';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @Public()
  @SkipInternalKey()
  @ApiOperation({ summary: 'Estado del servicio y de su base de datos' })
  async check(): Promise<{ status: string; service: string; database: string }> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({ status: 'error', service: 'reports', database: 'down' });
    }
    return { status: 'ok', service: 'reports', database: 'up' };
  }
}
