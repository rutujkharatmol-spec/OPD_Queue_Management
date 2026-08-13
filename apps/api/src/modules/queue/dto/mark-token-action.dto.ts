import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum TokenAction {
  SKIP = 'SKIP',
  ABSENT = 'ABSENT',
  NOT_AVAILABLE = 'NOT_AVAILABLE',
  COMPLETE = 'COMPLETE',
}

export class MarkTokenActionDto {
  @ApiProperty({ enum: TokenAction, description: 'Action to perform on the token' })
  @IsNotEmpty()
  @IsEnum(TokenAction)
  action: TokenAction;
}
