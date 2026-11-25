import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController, InternalAuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { PasswordHasher } from './auth/password-hasher';
import { RevokedToken } from './auth/revoked-token.entity';
import { HttpNotificationsClient, NOTIFICATIONS_CLIENT } from './clients/notifications.client';
import { IdentityGuard, InternalApiKeyGuard } from './common/guards';
import { validateEnv } from './config/env.validation';
import { buildDataSourceOptions } from './database/typeorm.options';
import { HealthController } from './health/health.controller';
import { User } from './users/user.entity';
import { InternalUsersController, UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: () => buildDataSourceOptions(process.env),
    }),
    TypeOrmModule.forFeature([User, RevokedToken]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: Number(config.get('JWT_EXPIRES_IN_SECONDS') ?? 3600),
          issuer: 'greenalert-users',
        },
      }),
    }),
  ],
  controllers: [HealthController, AuthController, InternalAuthController, UsersController, InternalUsersController],
  providers: [
    AuthService,
    UsersService,
    PasswordHasher,
    { provide: NOTIFICATIONS_CLIENT, useClass: HttpNotificationsClient },
    // Orden: primero la clave interna, después identidad/roles.
    { provide: APP_GUARD, useClass: InternalApiKeyGuard },
    { provide: APP_GUARD, useClass: IdentityGuard },
  ],
})
export class AppModule {}
