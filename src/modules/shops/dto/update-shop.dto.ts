import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateShopDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  logo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayAddress?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
