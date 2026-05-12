import { IsNotEmpty, IsUUID } from 'class-validator';

export class OpenProductConversationDto {
  @IsUUID()
  productId!: string;
}
