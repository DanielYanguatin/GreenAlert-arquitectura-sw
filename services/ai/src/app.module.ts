import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassificationController, InternalClassificationController } from './classification/classification.controller';
import { Classification } from './classification/classification.entity';
import { ClassificationService } from './classification/classification.service';
import { IMAGE_CLASSIFIER } from './classifiers/classifier.port';
import { HeuristicKeywordClassifier } from './classifiers/heuristic.classifier';
import { HttpVisionClassifier } from './classifiers/http-vision.classifier';
import { IdentityGuard, InternalApiKeyGuard } from './common/guards';
import { validateEnv } from './config/env.validation';
import { buildDataSourceOptions } from './database/typeorm.options';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({ useFactory: () => buildDataSourceOptions(process.env) }),
    TypeOrmModule.forFeature([Classification]),
  ],
  controllers: [HealthController, ClassificationController, InternalClassificationController],
  providers: [
    ClassificationService,
    HeuristicKeywordClassifier,
    HttpVisionClassifier,
    {
      // Selección del proveedor por configuración (AI_PROVIDER=heuristic|http): cambiar de modelo no requiere código.
      provide: IMAGE_CLASSIFIER,
      inject: [ConfigService, HeuristicKeywordClassifier, HttpVisionClassifier],
      useFactory: (config: ConfigService, heuristic: HeuristicKeywordClassifier, http: HttpVisionClassifier) =>
        config.get<string>('AI_PROVIDER') === 'http' ? http : heuristic,
    },
    { provide: APP_GUARD, useClass: InternalApiKeyGuard },
    { provide: APP_GUARD, useClass: IdentityGuard },
  ],
})
export class AppModule {}
