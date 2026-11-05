import { Global, Module } from '@nestjs/common';
import { TwilioService } from './twilio.service';
import { HubspotService } from './hubspot.service';
import { SiigoService } from './siigo.service';
import { DocusignService } from './docusign.service';

// Global so any module (notifications, onboarding, billing, …) can inject a
// provider adapter. Each adapter is a graceful no-op until its env keys exist.
@Global()
@Module({
  providers: [TwilioService, HubspotService, SiigoService, DocusignService],
  exports: [TwilioService, HubspotService, SiigoService, DocusignService],
})
export class IntegrationsModule {}
