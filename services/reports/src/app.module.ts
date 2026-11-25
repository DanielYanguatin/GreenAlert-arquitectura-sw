import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AI_CLIENT,
  GEOLOCATION_CLIENT,
  HttpAiClient,
  HttpGeolocationClient,
  HttpMultimediaClient,
  HttpNotificationsClient,
  HttpUsersClient,
  MULTIMEDIA_CLIENT,
  NOTIFICATIONS_CLIENT,
  USERS_CLIENT,
} from './clients/clients';
import { IdentityGuard, InternalApiKeyGuard } from './common/guards';
import { validateEnv } from './config/env.validation';
import { buildDataSourceOptions } from './database/typeorm.options';
import { HealthController } from './health/health.controller';
import { OutboxEvent } from './outbox/outbox-event.entity';
import { OutboxService } from './outbox/outbox.service';
import { Report, ReportHistory, ReportObservation } from './reports/entities';
import { InternalReportsController, ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({ useFactory: () => buildDataSourceOptions(process.env) }),
    TypeOrmModule.forFeature([Report, ReportHistory, ReportObservation, OutboxEvent]),
  ],
  controllers: [HealthController, ReportsController, InternalReportsController],
  providers: [
    ReportsService,
    OutboxService,
    { provide: GEOLOCATION_CLIENT, useClass: HttpGeolocationClient },
    { provide: NOTIFICATIONS_CLIENT, useClass: HttpNotificationsClient },
    { provide: MULTIMEDIA_CLIENT, useClass: HttpMultimediaClient },
    { provide: AI_CLIENT, useClass: HttpAiClient },
    { provide: USERS_CLIENT, useClass: HttpUsersClient },
    { provide: APP_GUARD, useClass: InternalApiKeyGuard },
    { provide: APP_GUARD, useClass: IdentityGuard },
  ],
})
export class AppModule {}
