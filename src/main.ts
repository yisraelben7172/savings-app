import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { text } from 'express';
import { requireAdminKeyEarly } from './admin/admin.guard';
import { AppModule } from './app.module';
import { corsOrigin, securityHeaders } from './http';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  // Render runs one proxy in front of us; trust exactly one hop so req.ip is the real client (used by rate limits).
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  // CSV uploads (product feeds, commission reports; up to 5 MB) only on their admin import routes,
  // and only after the admin key checks out.
  app.use(
    /^\/api\/admin\/(?:sources\/[^/]+\/import|programs\/[^/]+\/commissions\/import)$/,
    requireAdminKeyEarly,
    text({ type: ['text/csv', 'text/plain'], limit: '5mb' }),
  );
  app.useBodyParser('json', { limit: '64kb' });
  app.useBodyParser('urlencoded', { extended: false, limit: '16kb' });
  app.use(securityHeaders);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: corsOrigin(process.env.CORS_ORIGIN ?? 'http://localhost:3001') });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API running on http://localhost:${port}/api`);
}
bootstrap();
