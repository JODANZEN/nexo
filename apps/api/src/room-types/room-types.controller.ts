import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { RoomTypesService, type CreateRoomTypeDto } from './room-types.service';

@Controller('room-types')
@UseGuards(ClerkAuthGuard)
export class RoomTypesController {
  constructor(private readonly roomTypes: RoomTypesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.roomTypes.list(user);
  }

  @Post()
  create(@Body() dto: CreateRoomTypeDto, @CurrentUser() user: AuthUser) {
    return this.roomTypes.create(user, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.roomTypes.remove(user, id);
  }

  // Assign or clear a unit's room type: { roomTypeId: string | null }.
  @Patch('units/:unitId')
  assignUnit(
    @Param('unitId') unitId: string,
    @Body() body: { roomTypeId: string | null },
    @CurrentUser() user: AuthUser,
  ) {
    return this.roomTypes.assignUnit(user, unitId, body.roomTypeId ?? null);
  }
}
