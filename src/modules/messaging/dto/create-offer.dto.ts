import { IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateNegotiationOfferDto {
  @IsNumber()
  @Min(0.01)
  unitPrice!: number;

  @IsNumber()
  @Min(0.01)
  quantity!: number;

  /** Khi counter, gắn id thẻ đang chờ đối phương phản hồi. */
  @IsOptional()
  @IsUUID()
  parentOfferId?: string;
}
