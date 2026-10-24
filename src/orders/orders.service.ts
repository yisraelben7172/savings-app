import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/order.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.order.findMany({
      include: { customer: true, items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { customer: true, rep: true, items: { include: { product: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async create(dto: CreateOrderDto) {
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds }, active: true } });
    const byId = new Map(products.map((p) => [p.id, p]));

    let total = new Prisma.Decimal(0);
    const items = dto.items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) throw new BadRequestException(`Product ${item.productId} not found or inactive`);
      total = total.add(product.price.mul(item.quantity));
      return { productId: product.id, quantity: item.quantity, unitPrice: product.price };
    });

    return this.prisma.order.create({
      data: {
        customerId: dto.customerId,
        repId: dto.repId,
        total,
        status: 'PENDING',
        items: { create: items },
      },
      include: { items: true },
    });
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto) {
    await this.findOne(id);
    return this.prisma.order.update({ where: { id }, data: { status: dto.status } });
  }
}
