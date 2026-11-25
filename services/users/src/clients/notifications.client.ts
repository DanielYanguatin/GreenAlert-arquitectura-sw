import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalHttpClient } from '../common/http-client';

export const NOTIFICATIONS_CLIENT = Symbol('NOTIFICATIONS_CLIENT');

export interface NotificationsPort {
  /** Nunca lanza: una falla de notificaciones no debe interrumpir el registro. */
  notifyRegistration(user: { id: string; email: string; fullName: string }): Promise<boolean>;
}

@Injectable()
export class HttpNotificationsClient implements NotificationsPort {
  private readonly logger = new Logger(HttpNotificationsClient.name);
  private readonly http: InternalHttpClient;

  constructor(config: ConfigService) {
    this.http = new InternalHttpClient({
      baseUrl: config.get<string>('NOTIFICATIONS_SERVICE_URL') ?? 'http://notifications:3006',
      internalApiKey: config.getOrThrow<string>('INTERNAL_API_KEY'),
      timeoutMs: Number(config.get('HTTP_TIMEOUT_MS') ?? 3000),
    });
  }

  async notifyRegistration(user: { id: string; email: string; fullName: string }): Promise<boolean> {
    try {
      await this.http.request('POST', '/internal/notifications', {
        type: 'REGISTRO',
        recipientUserId: user.id,
        recipientEmail: user.email,
        data: { fullName: user.fullName },
      });
      return true;
    } catch (e) {
      this.logger.warn(`No se pudo notificar el registro de ${user.id}: ${(e as Error).message}`);
      return false;
    }
  }
}
