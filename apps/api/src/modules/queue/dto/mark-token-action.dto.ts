import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum TokenAction {
  SKIP = 'SKIP',
  ABSENT = 'ABSENT',
  NOT_AVAILABLE = 'NOT_AVAILABLE',
  COMPLETE = 'COMPLETE',
  RETURN_TO_QUEUE = 'RETURN_TO_QUEUE',
  RESET_TO_WAITING = 'RESET_TO_WAITING',
  WAITING = 'WAITING',
}

export class MarkTokenActionDto {
  @ApiProperty({ enum: TokenAction, description: 'Action to perform on the token' })
  @IsNotEmpty()
  @IsEnum(TokenAction)
  action: TokenAction;
}
