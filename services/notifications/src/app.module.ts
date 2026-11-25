import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InMemoryChannel, NOTIFICATION_CHANNEL, SmtpEmailChannel } from './channels/channels';
import { HttpUsersClient, USERS_CLIENT } from './clients/users.client';
import { IdentityGuard, InternalApiKeyGuard } from './common/guards';
import { validateEnv } from './config/env.validation';
import { buildDataSourceOptions } from './database/typeorm.options';
import { HealthController } from './health/health.controller';
import { Notification } from './notifications/notification.entity';
import { InternalNotificationsController, NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({ useFactory: () => buildDataSourceOptions(process.env) }),
    TypeOrmModule.forFeature([Notification]),
  ],
  controllers: [HealthController, NotificationsController, InternalNotificationsController],
  providers: [
    NotificationsService,
    InMemoryChannel,
    { provide: USERS_CLIENT, useClass: HttpUsersClient },
    {
      // EMAIL_TRANSPORT=smtp (por defecto) | memory (solo pruebas automatizadas)
      provide: NOTIFICATION_CHANNEL,
      inject: [ConfigService, InMemoryChannel],
      useFactory: (config: ConfigService, memory: InMemoryChannel) =>
        config.get<string>('EMAIL_TRANSPORT') === 'memory' ? memory : new SmtpEmailChannel(config),
    },
    { provide: APP_GUARD, useClass: InternalApiKeyGuard },
    { provide: APP_GUARD, useClass: IdentityGuard },
  ],
})
export class AppModule {}
