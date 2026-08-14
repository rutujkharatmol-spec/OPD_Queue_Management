import { Controller, Patch, Param, Body, Get, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { QueueService } from './queue.service';
import { MarkTokenActionDto } from './dto/mark-token-action.dto';

@ApiTags('Queue')
@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Patch('next/:departmentId')
  @ApiOperation({ summary: 'Call the next patient in the queue for a department' })
  @ApiResponse({ status: 200, description: 'Returns the called token or null if queue is empty.' })
  async callNextPatient(
    @Param('departmentId') departmentId: string,
    @Body('roomNumber') roomNumber: string
  ) {
    if (!roomNumber) throw new BadRequestException('roomNumber is required');
    return this.queueService.callNextPatient(departmentId, roomNumber);
  }

  @Patch('recall/:departmentId')
  @ApiOperation({ summary: 'Recall / re-announce the active patient in a room' })
  @ApiResponse({ status: 200, description: 'Returns the recalled token or null.' })
  async recallPatient(
    @Param('departmentId') departmentId: string,
    @Body('roomNumber') roomNumber: string
  ) {
    if (!roomNumber) throw new BadRequestException('roomNumber is required');
    return this.queueService.recallPatient(departmentId, roomNumber);
  }

  @Patch('action/:tokenId')
  @ApiOperation({ summary: 'Mark a token action (SKIP, ABSENT, NOT_AVAILABLE, COMPLETE)' })
  @ApiResponse({ status: 200, description: 'The token action has been recorded.' })
  @ApiResponse({ status: 404, description: 'Token not found.' })
  async markTokenAction(
    @Param('tokenId') tokenId: string,
    @Body() dto: MarkTokenActionDto,
  ) {
    return this.queueService.markTokenAction(tokenId, dto.action as 'SKIP' | 'ABSENT' | 'NOT_AVAILABLE' | 'COMPLETE');
  }

  @Get('live/:departmentId')
  @ApiOperation({ summary: 'Get the live queue status for a department' })
  @ApiResponse({ status: 200, description: 'Returns the live queue status.' })
  async getLiveQueue(@Param('departmentId') departmentId: string) {
    return this.queueService.getLiveQueueByDepartment(departmentId);
  }

  @Get('analytics/:departmentId')
  @ApiOperation({ summary: 'Get daily analytics for a department' })
  @ApiResponse({ status: 200, description: 'Returns department analytics for today.' })
  async getAnalytics(@Param('departmentId') departmentId: string) {
    return this.queueService.getDepartmentAnalytics(departmentId);
  }
}

