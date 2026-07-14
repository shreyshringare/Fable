import {
  BadRequestException,
  Controller,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { diskStorage } from 'multer';
import { UPLOAD_DIR } from '../app.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const KINDS = ['covers', 'places', 'reservations', 'avatars', 'documents'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  @Post(':kind')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const kind = String(req.params.kind);
          if (!KINDS.includes(kind)) {
            cb(new BadRequestException('Invalid upload kind') as any, '');
            return;
          }
          const dir = path.join(UPLOAD_DIR, kind);
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: MAX_SIZE },
      fileFilter: (_req, file, cb) => {
        const ok =
          file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf';
        cb(ok ? null : (new BadRequestException('Only images or PDF allowed') as any), ok);
      },
    }),
  )
  upload(@Param('kind') kind: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return { url: `/uploads/${kind}/${file.filename}` };
  }
}
