import { Type } from 'class-transformer';
import { ArrayMinSize, IsEnum, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class OrderItemDto {
  @IsString() productId!: string;
  @IsInt() @Min(1) quantity!: number;
}

export class CreateOrderDto {
  @IsString() customerId!: string;
  @IsOptional() @IsString() repId?: string;
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  @ArrayMinSize(1)
  items!: OrderItemDto[];
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus) status!: OrderStatus;
}
