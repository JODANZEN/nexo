import { Module } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { ConjuntosController } from './conjuntos.controller';
import { UsersController } from './users.controller';
import { UnitsController } from './units.controller';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';

@Module({
  controllers: [ConjuntosController, UsersController, UnitsController, InvitesController],
  providers: [OnboardingService, InvitesService],
})
export class OnboardingModule {}
