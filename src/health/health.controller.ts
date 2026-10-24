import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Set by prisma/seed.ts; cleared once real, authorized sources replace the demo catalog. */
export const DEMO_FLAG = 'catalog:demo';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', db: 'up', time: new Date().toISOString() };
  }

  /** Public facts the website needs, e.g. whether the catalog is sample data (so it can say so). */
  @Get('meta')
  async meta() {
    const flag = await this.prisma.setting.findUnique({ where: { key: DEMO_FLAG } });
    return { demoData: flag?.value === 'true' };
  }
}
