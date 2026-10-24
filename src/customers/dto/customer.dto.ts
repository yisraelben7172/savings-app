import { PartialType } from '@nestjs/mapped-types';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateCustomerDto {
  @IsString() name!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() ownerId?: string;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}
