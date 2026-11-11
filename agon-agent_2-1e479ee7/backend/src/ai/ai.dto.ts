import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export const MAX_MESSAGE_LENGTH = 2000;

export class ChatDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'message must not be empty' })
  @MaxLength(MAX_MESSAGE_LENGTH)
  message!: string;

  /** Omit to start a new conversation. */
  @IsOptional()
  @IsUUID()
  conversationId?: string;
}
