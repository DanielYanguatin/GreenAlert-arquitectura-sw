import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpReportsClient, REPORTS_CLIENT } from './clients/reports.client';
import { IdentityGuard, InternalApiKeyGuard } from './common/guards';
import { validateEnv } from './config/env.validation';
import { buildDataSourceOptions } from './database/typeorm.options';
import { Evidence } from './evidences/evidence.entity';
import { EvidencesController, InternalEvidencesController } from './evidences/evidences.controller';
import { EvidencesService } from './evidences/evidences.service';
import { HealthController } from './health/health.controller';
import { LocalDiskStorage, STORAGE } from './storage/storage';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({ useFactory: () => buildDataSourceOptions(process.env) }),
    TypeOrmModule.forFeature([Evidence]),
  ],
  controllers: [HealthController, EvidencesController, InternalEvidencesController],
  providers: [
    EvidencesService,
    { provide: STORAGE, useClass: LocalDiskStorage },
    { provide: REPORTS_CLIENT, useClass: HttpReportsClient },
    { provide: APP_GUARD, useClass: InternalApiKeyGuard },
    { provide: APP_GUARD, useClass: IdentityGuard },
  ],
})
export class AppModule {}
