import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class ConfirmOrderDto {
  @IsOptional()
  @IsUUID()
  actualPickAddressId?: string;

  @IsOptional()
  @IsBoolean()
  fastShipping?: boolean;
}
