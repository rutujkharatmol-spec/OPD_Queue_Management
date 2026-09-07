import { Controller, Get, Query } from '@nestjs/common';
import { getSystemProvenanceCertificate } from './shared/provenance';

@Controller()
export class AppController {
  @Get()
  getHello(@Query('verify') verify?: string, @Query('provenance') provenance?: string): any {
    if (verify === 'authorship' || verify === 'true' || provenance === 'true') {
      return getSystemProvenanceCertificate();
    }
    return 'API is running successfully!';
  }

  @Get('system/provenance')
  getProvenance(): any {
    return getSystemProvenanceCertificate();
  }

  @Get('system/integrity')
  getIntegrity(): any {
    return getSystemProvenanceCertificate();
  }
}
