import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import {
  ParkingService,
  type CreateSpotDto,
  type EntryDto,
} from './parking.service';

@Controller('parking')
@UseGuards(ClerkAuthGuard)
export class ParkingController {
  constructor(private readonly parking: ParkingService) {}

  @Get('spots')
  listSpots(@CurrentUser() user: AuthUser) {
    return this.parking.listSpots(user);
  }

  @Post('spots')
  createSpot(@Body() dto: CreateSpotDto, @CurrentUser() user: AuthUser) {
    return this.parking.createSpot(user, dto);
  }

  @Get('spots/available')
  listAvailable(@CurrentUser() user: AuthUser) {
    return this.parking.listAvailableSpots(user);
  }

  @Post('sessions/entry')
  entry(@Body() dto: EntryDto, @CurrentUser() user: AuthUser) {
    return this.parking.logEntry(user, dto);
  }

  @Patch('sessions/:id/exit')
  exit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.parking.logExit(user, id);
  }

  @Get('sessions')
  listSessions(
    @CurrentUser() user: AuthUser,
    @Query('spotId') spotId?: string,
    @Query('date') date?: string,
  ) {
    return this.parking.listSessions(user, spotId, date);
  }
}
