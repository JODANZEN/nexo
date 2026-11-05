import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DocumentsController } from './documents.controller';
import { DocumentsGuard } from './documents.guard';

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10MB

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(), // stream to R2, never touch disk
      limits: { fileSize: MAX_PDF_BYTES },
      fileFilter: (_req, file, cb) => cb(null, file.mimetype === 'application/pdf'),
    }),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsGuard],
})
export class DocumentsModule {}
