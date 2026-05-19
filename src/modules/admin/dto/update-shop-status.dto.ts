import { IsBoolean } from 'class-validator';

export class UpdateShopStatusDto {
  @IsBoolean()
  isActive!: boolean;
}