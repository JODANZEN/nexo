import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { ConfiguracionService, type UpdateConfigDto } from './configuracion.service';

@Controller('configuracion')
@UseGuards(ClerkAuthGuard)
export class ConfiguracionController {
  constructor(private readonly configuracion: ConfiguracionService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.configuracion.get(user);
  }

  @Patch()
  update(@Body() dto: UpdateConfigDto, @CurrentUser() user: AuthUser) {
    return this.configuracion.update(user, dto);
  }
}
