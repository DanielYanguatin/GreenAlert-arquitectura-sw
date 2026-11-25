import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { escapeHtml } from '../notifications/templates';

export const NOTIFICATION_CHANNEL = Symbol('NOTIFICATION_CHANNEL');

export interface OutgoingMessage {
  to: string;
  subject: string;
  body: string;
}

/**
 * Puerto de canal de entrega. Agregar SMS/WhatsApp/push = nueva implementación de esta interfaz
 * (SAAM S-04), sin tocar la cola, los reintentos ni otros microservicios.
 */
export interface NotificationChannel {
  readonly name: string;
  send(message: OutgoingMessage): Promise<void>;
}

/** Canal de correo electrónico vía SMTP (Mailpit en desarrollo, un proveedor SMTP real en producción). */
@Injectable()
export class SmtpEmailChannel implements NotificationChannel {
  readonly name = 'smtp';
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    const user = config.get<string>('SMTP_USER');
    this.transporter = createTransport({
      host: config.get<string>('SMTP_HOST') ?? 'mailpit',
      port: Number(config.get('SMTP_PORT') ?? 1025),
      secure: config.get<string>('SMTP_SECURE') === 'true',
      auth: user ? { user, pass: config.get<string>('SMTP_PASSWORD') ?? '' } : undefined,
      connectionTimeout: 5000,
      socketTimeout: 10000,
    });
    this.from = config.get<string>('SMTP_FROM') ?? 'GreenAlert <no-reply@greenalert.local>';
  }

  async send(message: OutgoingMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.body,
      html: `<pre style="font-family:sans-serif;white-space:pre-wrap">${escapeHtml(message.body)}</pre>`,
    });
  }
}

/** Canal en memoria para pruebas automatizadas (EMAIL_TRANSPORT=memory). Nunca se usa en producción. */
@Injectable()
export class InMemoryChannel implements NotificationChannel {
  readonly name = 'memory';
  readonly sent: OutgoingMessage[] = [];
  failNext = 0;
  private readonly logger = new Logger(InMemoryChannel.name);

  send(message: OutgoingMessage): Promise<void> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      return Promise.reject(new Error('Fallo simulado del canal'));
    }
    this.sent.push(message);
    this.logger.debug(`Mensaje simulado para ${message.to}: ${message.subject}`);
    return Promise.resolve();
  }
}
