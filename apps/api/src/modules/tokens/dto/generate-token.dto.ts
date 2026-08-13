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

  @ApiPropertyOptional({ description: 'First name of the patient (for new registration)' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name of the patient (for new registration)' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ description: 'Phone number of the patient (for new registration)' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'UHID of the patient' })
  @IsOptional()
  @IsString()
  uhid?: string;
}
