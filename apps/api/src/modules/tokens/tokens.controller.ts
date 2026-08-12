import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TokensService } from './tokens.service';
import { GenerateTokenDto } from './dto/generate-token.dto';

@ApiTags('Tokens')
@Controller('tokens')
export class TokensController {
  constructor(private readonly tokensService: TokensService) {}

  @Post()
  @ApiOperation({ summary: 'Generate a new token for a patient' })
  @ApiResponse({ status: 201, description: 'The token has been successfully generated.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  async generateToken(@Body() dto: GenerateTokenDto) {
    return this.tokensService.generateToken(
      dto.patientId,
      dto.departmentId,
      dto.doctorId,
      dto.priority,
    );
  }

  @Get('doctor/:doctorId')
  @ApiOperation({ summary: 'Get the waiting queue for a specific doctor' })
  async getDoctorQueue(@Param('doctorId') doctorId: string) {
    return this.tokensService.getDoctorQueue(doctorId);
  }
}
