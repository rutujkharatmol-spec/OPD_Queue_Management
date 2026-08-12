import { Controller, Patch, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { QueueService } from './queue.service';
import { MarkTokenActionDto } from './dto/mark-token-action.dto';

@ApiTags('Queue')
@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Patch('next/:doctorId')
  @ApiOperation({ summary: 'Call the next patient in the queue for a doctor' })
  @ApiResponse({ status: 200, description: 'Returns the called token or null if queue is empty.' })
  async callNextPatient(@Param('doctorId') doctorId: string) {
    return this.queueService.callNextPatient(doctorId);
  }

  @Patch('action/:tokenId')
  @ApiOperation({ summary: 'Mark a token action (SKIP, ABSENT, COMPLETE)' })
  @ApiResponse({ status: 200, description: 'The token action has been recorded.' })
  @ApiResponse({ status: 404, description: 'Token not found.' })
  async markTokenAction(
    @Param('tokenId') tokenId: string,
    @Body() dto: MarkTokenActionDto,
  ) {
    return this.queueService.markTokenAction(tokenId, dto.action as 'SKIP' | 'ABSENT' | 'COMPLETE');
  }
}
