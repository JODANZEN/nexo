import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { FeatureGuard } from '../auth/feature.guard';
import { RequiresFeature } from '../auth/requires-feature.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import {
  AsambleasService,
  type AddAgendaDto,
  type CreateAsambleaDto,
  type VoteDto,
} from './asambleas.service';

// Phase 14: Asambleas is a PRO feature — gated for the whole controller.
@Controller('asambleas')
@UseGuards(ClerkAuthGuard, FeatureGuard)
@RequiresFeature('asambleas')
export class AsambleasController {
  constructor(private readonly asambleas: AsambleasService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAsambleaDto) {
    return this.asambleas.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.asambleas.list(user);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.asambleas.getOne(user, id);
  }

  @Post(':id/attend')
  attend(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.asambleas.attend(user, id);
  }

  @Post(':id/agenda')
  addAgenda(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddAgendaDto) {
    return this.asambleas.addAgenda(user, id, dto);
  }

  @Post(':id/agenda/:itemId/vote')
  vote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: VoteDto,
  ) {
    return this.asambleas.vote(user, id, itemId, dto);
  }

  @Get(':id/results')
  results(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.asambleas.results(user, id);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    return this.asambleas.updateStatus(user, id, body.status);
  }

  @Post(':id/acta')
  generateActa(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.asambleas.generateActa(user, id);
  }
}
