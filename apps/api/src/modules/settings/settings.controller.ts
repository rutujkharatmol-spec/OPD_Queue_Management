import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) { }

  @Get('rooms')
  async getRooms(@Query('departmentId') departmentId?: string) {
    return this.settingsService.findAllRooms(departmentId);
  }

  @Post('rooms')
  async createRoom(@Body() body: { roomNumber: string; isActive?: boolean; departmentId?: string }) {
    return this.settingsService.createRoom(body.roomNumber, body.isActive, body.departmentId);
  }

  @Put('rooms/:id')
  async updateRoom(
    @Param('id') id: string,
    @Body() body: { roomNumber?: string; isActive?: boolean },
  ) {
    return this.settingsService.updateRoom(id, body.roomNumber, body.isActive);
  }

  @Delete('rooms/:id')
  async deleteRoom(@Param('id') id: string) {
    await this.settingsService.deleteRoom(id);
    return { success: true };
  }
}
