import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { AnunciosService, type CreateAnnouncementDto } from './anuncios.service';

@Controller('anuncios')
@UseGuards(ClerkAuthGuard)
export class AnunciosController {
  constructor(private readonly anuncios: AnunciosService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('take') take?: string) {
    return this.anuncios.list(user, take ? Number(take) : undefined);
  }

  @Post()
  create(@Body() dto: CreateAnnouncementDto, @CurrentUser() user: AuthUser) {
    return this.anuncios.create(user, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.anuncios.remove(user, id);
  }
}
