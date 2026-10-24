import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateProductDto {
  @IsString() sku!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsNumber() @Min(0) price!: number;
  @IsOptional() @IsInt() @Min(0) stock?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}
