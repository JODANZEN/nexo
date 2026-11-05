import { Module } from '@nestjs/common';
import { ComunidadController } from './comunidad.controller';
import { ComunidadService } from './comunidad.service';

@Module({
  controllers: [ComunidadController],
  providers: [ComunidadService],
})
export class ComunidadModule {}
