import { Controller, Get } from '@nestjs/common';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  /** Lets the settings screen show whether the cloud mirror is keeping up. */
  @Get('status')
  getStatus() {
    return this.syncService.getStatus();
  }
}
