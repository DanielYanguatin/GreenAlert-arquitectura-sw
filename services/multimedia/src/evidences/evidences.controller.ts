import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import type { Response } from 'express';
import type { ReadStream } from 'node:fs';
import { CurrentUser, type Identity, Public } from '../common/identity';
import { type EvidenceView, EvidencesService, type IncomingFile } from './evidences.service';
import type { Evidence } from './evidence.entity';

export class UploadEvidenceDto {
  @ApiProperty({ description: 'Reporte al que pertenecen las evidencias' })
  @IsUUID('4')
  reportId: string;
}

export class ReportQueryDto {
  @ApiProperty()
  @IsUUID('4')
  reportId: string;
}

const uuid = new ParseUUIDPipe();
const MAX_FILES_PER_REQUEST = 5;
// Sin `dest`, multer conserva los archivos en memoria (necesario para validar la firma antes de escribir).
const maxBytes = (): number => Number(process.env.MAX_FILE_SIZE_MB ?? 5) * 1024 * 1024;

function stream(res: Response, evidence: Evidence, file: ReadStream): StreamableFile {
  res.set({
    'Content-Type': evidence.mimeType,
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `inline; filename="${evidence.id}"`,
    'Cache-Control': 'private, max-age=3600',
  });
  return new StreamableFile(file);
}

@ApiTags('evidences')
@ApiBearerAuth()
@Controller('evidences')
export class EvidencesController {
  constructor(private readonly evidences: EvidencesService) {}

  @Post()
  @ApiOperation({ summary: 'Adjunta fotografías (JPEG, PNG o WEBP) a un reporte' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reportId', 'files'],
      properties: {
        reportId: { type: 'string', format: 'uuid' },
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES_PER_REQUEST, {
      limits: { fileSize: maxBytes(), files: MAX_FILES_PER_REQUEST, fields: 5, parts: MAX_FILES_PER_REQUEST + 5 },
    }),
  )
  upload(
    @CurrentUser() identity: Identity,
    @Body() dto: UploadEvidenceDto,
    @UploadedFiles() files: IncomingFile[],
  ): Promise<EvidenceView[]> {
    return this.evidences.upload(identity, dto.reportId, files);
  }

  @Get()
  @ApiOperation({ summary: 'Evidencias de un reporte (autor o personal)' })
  list(@CurrentUser() identity: Identity, @Query() query: ReportQueryDto): Promise<EvidenceView[]> {
    return this.evidences.listForUser(identity, query.reportId);
  }

  @Get(':id/file')
  @ApiOperation({ summary: 'Descarga el archivo de una evidencia' })
  async file(
    @CurrentUser() identity: Identity,
    @Param('id', uuid) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { evidence, stream: s } = await this.evidences.openFile(id, identity);
    return stream(res, evidence, s);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Elimina una evidencia (quien la subió o ADMIN)' })
  remove(@CurrentUser() identity: Identity, @Param('id', uuid) id: string): Promise<void> {
    return this.evidences.remove(identity, id);
  }
}

@ApiTags('internal')
@Controller('internal/evidences')
export class InternalEvidencesController {
  constructor(private readonly evidences: EvidencesService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: '[Interno] Referencias de evidencias de un reporte (reports, ai)' })
  list(@Query() query: ReportQueryDto): Promise<EvidenceView[]> {
    return this.evidences.listByReport(query.reportId);
  }

  @Get(':id/file')
  @Public()
  @ApiOperation({ summary: '[Interno] Archivo de una evidencia (para el servicio de IA)' })
  async file(@Param('id', uuid) id: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const { evidence, stream: s } = await this.evidences.openFile(id);
    return stream(res, evidence, s);
  }
}
