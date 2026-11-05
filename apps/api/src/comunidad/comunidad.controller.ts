import { Controller, Get, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { ComunidadService } from './comunidad.service';

@Controller('comunidad')
@UseGuards(ClerkAuthGuard)
export class ComunidadController {
  constructor(private readonly comunidad: ComunidadService) {}

  @Get('directory')
  directory(@CurrentUser() user: AuthUser) {
    return this.comunidad.directory(user);
  }
}
