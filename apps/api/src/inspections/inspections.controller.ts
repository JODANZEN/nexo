import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import {
  InspectionsService,
  type AddRoomDto,
  type CreateInspectionDto,
  type PhotoUrlDto,
} from './inspections.service';

@Controller('inspections')
@UseGuards(ClerkAuthGuard)
export class InspectionsController {
  constructor(private readonly inspections: InspectionsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInspectionDto) {
    return this.inspections.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.inspections.list(user);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inspections.getOne(user, id);
  }

  @Post(':id/rooms')
  addRoom(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddRoomDto) {
    return this.inspections.addRoom(user, id, dto);
  }

  @Post(':id/photo-url')
  photoUrl(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PhotoUrlDto) {
    return this.inspections.requestPhotoUrl(user, id, dto);
  }

  @Patch(':id/submit')
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inspections.submit(user, id);
  }
}
