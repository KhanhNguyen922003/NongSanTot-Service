import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}

export class ApproveProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
