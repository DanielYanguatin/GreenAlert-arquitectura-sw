import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityGuard, InternalApiKeyGuard } from './common/guards';
import { validateEnv } from './config/env.validation';
import { buildDataSourceOptions } from './database/typeorm.options';
import { HealthController } from './health/health.controller';
import {
  InternalLocationsController,
  LocationsController,
  MunicipalitiesController,
} from './locations/geolocation.controller';
import { GeolocationService } from './locations/geolocation.service';
import { ReportLocation } from './locations/report-location.entity';
import { Municipality } from './municipalities/municipality.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({ useFactory: () => buildDataSourceOptions(process.env) }),
    TypeOrmModule.forFeature([Municipality, ReportLocation]),
  ],
  controllers: [HealthController, MunicipalitiesController, LocationsController, InternalLocationsController],
  providers: [
    GeolocationService,
    { provide: APP_GUARD, useClass: InternalApiKeyGuard },
    { provide: APP_GUARD, useClass: IdentityGuard },
  ],
})
export class AppModule {}
