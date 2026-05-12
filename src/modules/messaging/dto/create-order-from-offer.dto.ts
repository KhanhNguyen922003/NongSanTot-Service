import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOrderFromNegotiationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsBoolean()
  fastShipping?: boolean;
}
