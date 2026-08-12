import { IsString, IsUUID, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TokenPriority } from '../entities/token.entity';

export class GenerateTokenDto {
  @ApiProperty({ description: 'The UUID of the patient' })
  @IsUUID()
  patientId: string;

  @ApiProperty({ description: 'The UUID of the department' })
  @IsUUID()
  departmentId: string;

  @ApiProperty({ description: 'The UUID of the doctor' })
  @IsUUID()
  doctorId: string;

  @ApiPropertyOptional({ enum: TokenPriority, default: TokenPriority.NORMAL })
  @IsOptional()
  @IsEnum(TokenPriority)
  priority?: TokenPriority;
}
