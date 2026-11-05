import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import {
  PqrsService,
  type AddCommentDto,
  type CreatePqrDto,
  type PqrPhotoDto,
} from './pqrs.service';

@Controller('pqrs')
@UseGuards(ClerkAuthGuard)
export class PqrsController {
  constructor(private readonly pqrs: PqrsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePqrDto) {
    return this.pqrs.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.pqrs.list(user, status);
  }

  @Post('photo-url')
  photoUrl(@CurrentUser() user: AuthUser, @Body() dto: PqrPhotoDto) {
    return this.pqrs.requestPhotoUrl(user, dto);
  }

  @Get(':pqrId')
  getOne(@CurrentUser() user: AuthUser, @Param('pqrId') pqrId: string) {
    return this.pqrs.getOne(user, pqrId);
  }

  @Patch(':pqrId/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('pqrId') pqrId: string,
    @Body() body: { status: string },
  ) {
    return this.pqrs.updateStatus(user, pqrId, body.status);
  }

  @Patch(':pqrId/assign')
  assign(
    @CurrentUser() user: AuthUser,
    @Param('pqrId') pqrId: string,
    @Body() body: { assigneeUserId: string },
  ) {
    return this.pqrs.assign(user, pqrId, body.assigneeUserId);
  }

  @Patch(':pqrId/priority')
  setPriority(
    @CurrentUser() user: AuthUser,
    @Param('pqrId') pqrId: string,
    @Body() body: { priority: string },
  ) {
    return this.pqrs.setPriority(user, pqrId, body.priority);
  }

  @Post(':pqrId/comments')
  addComment(
    @CurrentUser() user: AuthUser,
    @Param('pqrId') pqrId: string,
    @Body() dto: AddCommentDto,
  ) {
    return this.pqrs.addComment(user, pqrId, dto);
  }
}
