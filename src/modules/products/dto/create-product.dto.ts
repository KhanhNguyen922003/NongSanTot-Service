import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const shippingMethods = ['GHTK', 'SELF_DELIVERY'] as const;

class GrowthDiaryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  stageName!: string;

  @IsDateString()
  logDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({ require_tld: false }, { each: true })
  images!: string[];
}

class PickupAddressDto {
  @IsString()
  @IsNotEmpty()
  displayAddress!: string;

  @IsString()
  @IsNotEmpty()
  receiverName!: string;

  @IsString()
  @IsNotEmpty()
  receiverPhone!: string;
}

export class CreateProductDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  description!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  origin!: string;

  @IsNumber()
  @Min(1)
  price!: number;

  @IsNumber()
  @Min(0)
  stock!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  unit!: string;

  @IsArray()
  @ArrayMaxSize(8)
  @IsUrl({ require_tld: false }, { each: true })
  images!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsUrl({ require_tld: false }, { each: true })
  videos?: string[];

  @IsArray()
  @IsIn(shippingMethods, { each: true })
  shippingMethods!: Array<(typeof shippingMethods)[number]>;

  @IsOptional()
  @ValidateNested()
  @Type(() => PickupAddressDto)
  pickupAddress?: PickupAddressDto;

  @IsOptional()
  @IsNumber()
  @Min(1)
  preferredShippingServiceId?: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => GrowthDiaryDto)
  growthDiary?: GrowthDiaryDto[];
}
