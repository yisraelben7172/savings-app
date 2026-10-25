import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { trustedOffer } from '../deals/trust';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const cats = await this.prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { deals: { where: { status: 'ACTIVE', offers: { some: trustedOffer() } } } } } },
    });
    return cats.map((c) => ({ slug: c.slug, name: c.name, color: c.color, dealCount: c._count.deals }));
  }
}
