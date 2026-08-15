import { Controller, Patch, Param, Body, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { QueueService } from './queue.service';
import { MarkTokenActionDto } from './dto/mark-token-action.dto';

@ApiTags('Queue')
@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) { }

  @Patch('next/:departmentId')
  @ApiOperation({ summary: 'Call the next patient in the queue for a department' })
  @ApiResponse({ status: 200, description: 'Returns the called token or null if queue is empty.' })
  async callNextPatient(
    @Param('departmentId') departmentId: string,
    @Body('roomNumber') roomNumber: string
  ) {
    if (!roomNumber) throw new Error('roomNumber is required');
    return this.queueService.callNextPatient(departmentId, roomNumber);
  }

  @Patch('recall/:departmentId')
  @ApiOperation({ summary: 'Recall / Ring again the currently active patient in a room' })
  @ApiResponse({ status: 200, description: 'Returns the recalled token.' })
  async recallPatient(
    @Param('departmentId') departmentId: string,
    @Body('roomNumber') roomNumber: string
  ) {
    if (!roomNumber) throw new Error('roomNumber is required');
    return this.queueService.recallPatient(departmentId, roomNumber);
  }

  @Patch('action/:tokenId')
  @ApiOperation({ summary: 'Mark a token action (SKIP, ABSENT, COMPLETE)' })
  @ApiResponse({ status: 200, description: 'The token action has been recorded.' })
  @ApiResponse({ status: 404, description: 'Token not found.' })
  async markTokenAction(
    @Param('tokenId') tokenId: string,
    @Body() dto: MarkTokenActionDto,
  ) {
    return this.queueService.markTokenAction(tokenId, dto.action as 'SKIP' | 'ABSENT' | 'NOT_AVAILABLE' | 'COMPLETE');
  }

  @Get('analytics/:departmentId')
  @ApiOperation({ summary: 'Get OPD analytics for a department' })
  @ApiResponse({ status: 200, description: 'Returns department analytics metrics.' })
  async getDepartmentAnalytics(
    @Param('departmentId') departmentId: string,
    @Query('date') date?: string
  ) {
    return this.queueService.getDepartmentAnalytics(departmentId, date);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get overall OPD analytics' })
  @ApiResponse({ status: 200, description: 'Returns overall analytics metrics.' })
  async getOverallAnalytics(
    @Query('date') date?: string
  ) {
    return this.queueService.getDepartmentAnalytics(undefined, date);
  }

  @Get('live/:departmentId')
  @ApiOperation({ summary: 'Get the live queue status for a department' })
  @ApiResponse({ status: 200, description: 'Returns the live queue status.' })
  async getLiveQueue(@Param('departmentId') departmentId: string) {
    return this.queueService.getLiveQueueByDepartment(departmentId);
  }
}
