import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureGateway } from './bootstrap';

async function bootstrap(): Promise<void> {
  // Sin bodyParser: los cuerpos (JSON y multipart) se reenvían en streaming sin re-serializar.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configureGateway(app);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`api-gateway escuchando en :${port}`, 'Bootstrap');
}

void bootstrap();
