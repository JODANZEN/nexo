import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { OperationsService } from './operations.service';
import { RoutingService, type RoutingRuleDto } from './routing.service';
import { MaintenanceService, type MaintenancePlanDto } from './maintenance.service';

/** Operación: ticket targets + business hours, team, routing rules, preventive maintenance. */
@Controller('operations')
@UseGuards(ClerkAuthGuard)
export class OperationsController {
  constructor(
    private readonly ops: OperationsService,
    private readonly routing: RoutingService,
    private readonly maintenance: MaintenanceService,
  ) {}

  @Get('config')
  getConfig(@CurrentUser() user: AuthUser) {
    return this.ops.getConfig(user);
  }

  @Patch('config')
  updateConfig(@CurrentUser() user: AuthUser, @Body() body: { sla?: unknown; businessHours?: unknown }) {
    return this.ops.updateConfig(user, body);
  }

  @Get('team')
  team(@CurrentUser() user: AuthUser) {
    return this.ops.team(user);
  }

  @Patch('team/:userId')
  setTeam(@CurrentUser() user: AuthUser, @Param('userId') userId: string, @Body() body: { team: string | null }) {
    return this.ops.setTeam(user, userId, body?.team ?? null);
  }

  @Patch('team/:userId/lead')
  setTeamLead(@CurrentUser() user: AuthUser, @Param('userId') userId: string, @Body() body: { isTeamLead: boolean }) {
    return this.ops.setTeamLead(user, userId, body?.isTeamLead);
  }

  @Get('team-summary')
  teamSummary(@CurrentUser() user: AuthUser) {
    return this.ops.teamSummary(user);
  }

  @Get('routing-rules')
  listRules(@CurrentUser() user: AuthUser) {
    return this.routing.list(user);
  }

  @Post('routing-rules')
  createRule(@CurrentUser() user: AuthUser, @Body() dto: RoutingRuleDto) {
    return this.routing.create(user, dto);
  }

  @Patch('routing-rules/:id')
  updateRule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RoutingRuleDto) {
    return this.routing.update(user, id, dto);
  }

  @Delete('routing-rules/:id')
  removeRule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.routing.remove(user, id);
  }

  @Get('maintenance-plans')
  listPlans(@CurrentUser() user: AuthUser) {
    return this.maintenance.list(user);
  }

  @Post('maintenance-plans')
  createPlan(@CurrentUser() user: AuthUser, @Body() dto: MaintenancePlanDto) {
    return this.maintenance.create(user, dto);
  }

  @Patch('maintenance-plans/:id')
  updatePlan(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MaintenancePlanDto) {
    return this.maintenance.update(user, id, dto);
  }

  @Delete('maintenance-plans/:id')
  removePlan(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.maintenance.remove(user, id);
  }

  @Post('maintenance-plans/:id/run')
  runPlan(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.maintenance.runNow(user, id);
  }
}
