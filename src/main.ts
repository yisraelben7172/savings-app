import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/** Allows exact origins plus simple wildcards like https://*.vercel.app */
function corsOrigin(list: string) {
  const rules = list.split(',').map((s) => s.trim()).filter(Boolean);
  return (origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) => {
    if (!origin) return cb(null, true);
    const ok = rules.some((r) =>
      r.includes('*') ? new RegExp('^' + r.replace(/[.]/g, '\\.').replace('*', '[a-z0-9-]+') + '$', 'i').test(origin) : r === origin,
    );
    cb(null, ok);
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: corsOrigin(process.env.CORS_ORIGIN ?? 'http://localhost:3001') });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API running on http://localhost:${port}/api`);
}
bootstrap();
