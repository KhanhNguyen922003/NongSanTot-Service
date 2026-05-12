import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class BuyerConfirmNegotiationOrderDto {
  @IsUUID()
  shippingAddressId!: string;

  @IsOptional()
  @IsBoolean()
  fastShipping?: boolean;
}
