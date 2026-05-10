import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CheckoutOrdersDto {
  @IsUUID()
  shippingAddressId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsBoolean()
  fastShipping?: boolean;
}
