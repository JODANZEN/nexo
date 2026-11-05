import { Module } from '@nestjs/common';
import { AsambleasController } from './asambleas.controller';
import { AsambleasService } from './asambleas.service';

@Module({
  controllers: [AsambleasController],
  providers: [AsambleasService],
})
export class AsambleasModule {}
