import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreateShopDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(1000)
  logo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  receiverName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  receiverPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ward?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  detail?: string;
}
