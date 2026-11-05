import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { ContabilidadService } from './contabilidad.service';

@Controller('contabilidad')
@UseGuards(ClerkAuthGuard)
export class ContabilidadController {
  constructor(private readonly contabilidad: ContabilidadService) {}

  @Get('cuentas-por-cobrar')
  cuentasPorCobrar(@CurrentUser() user: AuthUser) {
    return this.contabilidad.cuentasPorCobrar(user);
  }

  @Get('paz-y-salvo/:unitId')
  async pazYSalvo(
    @Param('unitId') unitId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    // Service throws (400) before any PDF is produced if the unit owes money.
    const pdf = await this.contabilidad.pazYSalvo(user, unitId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="paz-y-salvo-${unitId}.pdf"`);
    res.send(pdf);
  }

  @Post('conciliacion')
  @UseInterceptors(FileInterceptor('statement', { limits: { fileSize: 5 * 1024 * 1024 } }))
  conciliacion(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contabilidad.conciliacion(user, file);
  }

  @Get('reporte-mora')
  reporteMora(@CurrentUser() user: AuthUser) {
    return this.contabilidad.reporteMora(user);
  }
}
