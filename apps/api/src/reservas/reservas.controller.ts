import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import {
  ReservasService,
  type CreateAmenityDto,
  type CreateReservationDto,
} from './reservas.service';

@Controller('reservas')
@UseGuards(ClerkAuthGuard)
export class ReservasController {
  constructor(private readonly reservas: ReservasService) {}

  @Get('amenities')
  listAmenities(@CurrentUser() user: AuthUser) {
    return this.reservas.listAmenities(user);
  }

  @Post('amenities')
  createAmenity(@Body() dto: CreateAmenityDto, @CurrentUser() user: AuthUser) {
    return this.reservas.createAmenity(user, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('amenityId') amenityId?: string,
    @Query('date') date?: string,
  ) {
    return this.reservas.listReservations(user, amenityId, date);
  }

  @Post()
  create(@Body() dto: CreateReservationDto, @CurrentUser() user: AuthUser) {
    return this.reservas.createReservation(user, dto);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.reservas.cancelReservation(user, id);
  }
}
