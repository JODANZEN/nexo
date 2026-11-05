import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import {
  DeliveriesService,
  type CreateDeliveryDto,
  type PhotoUrlDto,
} from './deliveries.service';

@Controller('deliveries')
@UseGuards(ClerkAuthGuard)
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDeliveryDto) {
    return this.deliveries.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('unitId') unitId: string) {
    return this.deliveries.listPending(user, unitId);
  }

  @Patch(':id/pickup')
  pickup(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deliveries.confirmPickup(user, id);
  }

  @Post(':id/photo-url')
  photoUrl(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PhotoUrlDto) {
    return this.deliveries.requestPhotoUrl(user, id, dto);
  }
}
