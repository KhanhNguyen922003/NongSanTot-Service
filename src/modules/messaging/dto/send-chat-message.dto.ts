import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendChatMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content!: string;
}
