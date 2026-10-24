import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/order.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Get() findAll() { return this.service.findAll(); }
  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }
  @Post() create(@Body() dto: CreateOrderDto) { return this.service.create(dto); }
  @Patch(':id/status') updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.service.updateStatus(id, dto);
  }
}
