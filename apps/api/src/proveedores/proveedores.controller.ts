import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { ProveedoresService, type CreateProviderDto } from './proveedores.service';

@Controller('proveedores')
@UseGuards(ClerkAuthGuard)
export class ProveedoresController {
  constructor(private readonly proveedores: ProveedoresService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.proveedores.list(user);
  }

  @Post()
  create(@Body() dto: CreateProviderDto, @CurrentUser() user: AuthUser) {
    return this.proveedores.create(user, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.proveedores.remove(user, id);
  }
}
