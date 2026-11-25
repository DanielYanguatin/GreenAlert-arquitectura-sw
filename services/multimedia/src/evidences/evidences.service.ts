import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import type { ReadStream } from 'node:fs';
import type { Repository } from 'typeorm';
import { REPORTS_CLIENT, type ReportAccess, type ReportsPort } from '../clients/reports.client';
import { UpstreamError } from '../common/http-client';
import { type Identity, Role, STAFF_ROLES } from '../common/identity';
import { STORAGE, type StoragePort } from '../storage/storage';
import { Evidence } from './evidence.entity';
import { detectImageType, sanitizeOriginalName } from './file-signature';

export interface IncomingFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

export type EvidenceView = Omit<Evidence, 'storedName'>;

const CLOSED_STATUSES = ['RESUELTO', 'RECHAZADO'];

@Injectable()
export class EvidencesService {
  private readonly logger = new Logger(EvidencesService.name);
  private readonly maxPerReport: number;

  constructor(
    @InjectRepository(Evidence) private readonly evidences: Repository<Evidence>,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(REPORTS_CLIENT) private readonly reports: ReportsPort,
    config: ConfigService,
  ) {
    this.maxPerReport = Number(config.get('MAX_FILES_PER_REPORT') ?? 5);
  }

  private isStaff(identity: Identity): boolean {
    return STAFF_ROLES.includes(identity.role);
  }

  /** Consulta a reports el propietario del reporte. Sin esa verificación no se aceptan archivos. */
  private async access(reportId: string): Promise<ReportAccess> {
    try {
      return await this.reports.getAccess(reportId);
    } catch (e) {
      if (e instanceof UpstreamError && e.status === 404) throw new NotFoundException('Reporte no encontrado');
      throw new ServiceUnavailableException('No se pudo verificar el reporte; intente de nuevo más tarde');
    }
  }

  private async assertCanRead(identity: Identity, reportId: string): Promise<void> {
    if (this.isStaff(identity)) return;
    const report = await this.access(reportId);
    if (report.ownerId !== identity.userId) throw new NotFoundException('Reporte no encontrado');
  }

  async upload(identity: Identity, reportId: string, files: IncomingFile[]): Promise<EvidenceView[]> {
    if (!files || files.length === 0) throw new BadRequestException('Debe adjuntar al menos un archivo');

    // 1. Validar TODOS los archivos antes de escribir nada (firma binaria real).
    const prepared = files.map((file) => {
      const type = detectImageType(file.buffer);
      if (!type) {
        throw new UnsupportedMediaTypeException(
          `El archivo "${sanitizeOriginalName(file.originalname)}" no es una imagen JPEG, PNG o WEBP válida`,
        );
      }
      return {
        file,
        type,
        storedName: `${randomUUID()}.${type.extension}`,
        sha256: createHash('sha256').update(file.buffer).digest('hex'),
      };
    });

    // 2. Autorización contra el propietario del reporte.
    const report = await this.access(reportId);
    if (report.ownerId !== identity.userId && !this.isStaff(identity)) {
      throw new ForbiddenException('Solo el autor o el personal institucional pueden adjuntar evidencias');
    }
    if (CLOSED_STATUSES.includes(report.status)) {
      throw new BadRequestException('El reporte está cerrado y no admite nuevas evidencias');
    }
    const existing = await this.evidences.count({ where: { reportId } });
    if (existing + prepared.length > this.maxPerReport) {
      throw new BadRequestException(`Máximo ${this.maxPerReport} evidencias por reporte (ya tiene ${existing})`);
    }

    // 3. Escribir en disco y registrar metadatos; si algo falla, se eliminan los archivos escritos.
    const written: string[] = [];
    try {
      for (const p of prepared) {
        await this.storage.save(p.storedName, p.file.buffer);
        written.push(p.storedName);
      }
      const saved = await this.evidences.save(
        prepared.map((p) =>
          this.evidences.create({
            reportId,
            uploaderId: identity.userId,
            originalName: sanitizeOriginalName(p.file.originalname),
            storedName: p.storedName,
            mimeType: p.type.mimeType,
            sizeBytes: p.file.size,
            sha256: p.sha256,
          }),
        ),
      );
      return saved.map(toView);
    } catch (e) {
      this.logger.error(`Fallo al almacenar evidencias del reporte ${reportId}: ${(e as Error).message}`);
      await Promise.all(written.map((name) => this.storage.remove(name)));
      throw e;
    }
  }

  async listForUser(identity: Identity, reportId: string): Promise<EvidenceView[]> {
    await this.assertCanRead(identity, reportId);
    return this.listByReport(reportId);
  }

  async listByReport(reportId: string): Promise<EvidenceView[]> {
    const rows = await this.evidences.find({ where: { reportId }, order: { createdAt: 'ASC' } });
    return rows.map(toView);
  }

  async openFile(id: string, identity?: Identity): Promise<{ evidence: Evidence; stream: ReadStream }> {
    const evidence = await this.evidences
      .createQueryBuilder('e')
      .addSelect('e.storedName')
      .where('e.id = :id', { id })
      .getOne();
    if (!evidence) throw new NotFoundException('Evidencia no encontrada');
    if (identity && !this.isStaff(identity) && evidence.uploaderId !== identity.userId) {
      await this.assertCanRead(identity, evidence.reportId);
    }
    try {
      return { evidence, stream: await this.storage.open(evidence.storedName) };
    } catch {
      this.logger.error(`Archivo físico ausente para la evidencia ${id}`);
      throw new NotFoundException('Archivo no disponible');
    }
  }

  async remove(identity: Identity, id: string): Promise<void> {
    const evidence = await this.evidences
      .createQueryBuilder('e')
      .addSelect('e.storedName')
      .where('e.id = :id', { id })
      .getOne();
    if (!evidence) throw new NotFoundException('Evidencia no encontrada');
    if (evidence.uploaderId !== identity.userId && identity.role !== Role.ADMIN) {
      throw new ForbiddenException('Solo quien subió la evidencia o un administrador puede eliminarla');
    }
    await this.evidences.delete(id);
    await this.storage.remove(evidence.storedName);
  }
}

function toView(e: Evidence): EvidenceView {
  return {
    id: e.id,
    reportId: e.reportId,
    uploaderId: e.uploaderId,
    originalName: e.originalName,
    mimeType: e.mimeType,
    sizeBytes: e.sizeBytes,
    sha256: e.sha256,
    createdAt: e.createdAt,
  };
}
