import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, type FindOptionsWhere, type Repository } from 'typeorm';
import {
  AI_CLIENT,
  type AiPort,
  GEOLOCATION_CLIENT,
  type GeolocationPort,
  MULTIMEDIA_CLIENT,
  type MultimediaPort,
  type ResolvedLocation,
  USERS_CLIENT,
  type UsersPort,
} from '../clients/clients';
import { UpstreamError } from '../common/http-client';
import { type Identity, Role, STAFF_ROLES } from '../common/identity';
import { OutboxType } from '../outbox/outbox-event.entity';
import { OutboxService } from '../outbox/outbox.service';
import type {
  AssignDto,
  ChangeStatusDto,
  CreateReportDto,
  ListReportsQueryDto,
  UpdateReportDto,
} from './dto/reports.dto';
import { Report, ReportHistory, ReportObservation } from './entities';
import {
  AiStatus,
  canTransition,
  HistoryAction,
  LocationStatus,
  ReportStatus,
  requiresComment,
  TRANSITIONS,
} from './report.domain';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface AnalysisResult {
  aiStatus: AiStatus;
  suggestedCategory: string | null;
  confidence: number | null;
  requiresReview: boolean;
  provider?: string;
  reason?: string;
}

const STAFF_NOTIFY_ROLES = [Role.FUNCIONARIO, Role.GESTOR_AMBIENTAL];

export function isStaff(identity: Identity): boolean {
  return STAFF_ROLES.includes(identity.role);
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly multimediaUrl: string;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Report) private readonly reports: Repository<Report>,
    @InjectRepository(ReportHistory) private readonly history: Repository<ReportHistory>,
    @InjectRepository(ReportObservation) private readonly observations: Repository<ReportObservation>,
    private readonly outbox: OutboxService,
    @Inject(GEOLOCATION_CLIENT) private readonly geolocation: GeolocationPort,
    @Inject(MULTIMEDIA_CLIENT) private readonly multimedia: MultimediaPort,
    @Inject(AI_CLIENT) private readonly ai: AiPort,
    @Inject(USERS_CLIENT) private readonly users: UsersPort,
    config: ConfigService,
  ) {
    this.multimediaUrl = config.get<string>('MULTIMEDIA_SERVICE_URL') ?? 'http://multimedia:3003';
  }

  // ───────────────────────────── creación ─────────────────────────────

  async create(identity: Identity, dto: CreateReportDto): Promise<Report> {
    const location = await this.resolveLocation(dto.latitude, dto.longitude);

    return this.dataSource.transaction(async (manager) => {
      const report = manager.getRepository(Report).create({
        userId: identity.userId,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        latitude: dto.latitude,
        longitude: dto.longitude,
        address: dto.address ?? null,
        status: ReportStatus.PENDIENTE,
        municipalityCode: location?.municipalityCode ?? null,
        municipalityName: location?.municipalityName ?? null,
        locationStatus: location ? LocationStatus.VALIDATED : LocationStatus.PENDING,
      });
      const saved = await manager.getRepository(Report).save(report);
      await this.addHistory(manager, saved.id, identity.userId, HistoryAction.CREATED, null, ReportStatus.PENDIENTE);
      await this.enqueueLocation(manager, saved);
      await this.outbox.enqueue(manager, OutboxType.NOTIFY, saved.id, {
        type: 'REPORTE_RECIBIDO',
        recipientUserId: identity.userId,
        data: { reportId: saved.id, title: saved.title },
      });
      await this.outbox.enqueue(manager, OutboxType.NOTIFY, saved.id, {
        type: 'NUEVO_REPORTE',
        recipientRoles: STAFF_NOTIFY_ROLES,
        data: {
          reportId: saved.id,
          title: saved.title,
          category: saved.category,
          municipality: saved.municipalityName ?? 'Sin validar',
        },
      });
      return saved;
    });
  }

  /**
   * Validación síncrona de cobertura. Si geolocation rechaza el punto → 422.
   * Si geolocation no está disponible → se acepta y la validación se completa vía outbox (degradación controlada).
   */
  private async resolveLocation(latitude: number, longitude: number): Promise<ResolvedLocation | null> {
    try {
      return await this.geolocation.validate(latitude, longitude);
    } catch (e) {
      if (e instanceof UpstreamError && !e.unavailable) {
        throw new UnprocessableEntityException('La ubicación está fuera de la zona de cobertura de GreenAlert');
      }
      this.logger.warn(`geolocation no disponible; validación diferida: ${(e as Error).message}`);
      return null;
    }
  }

  // ───────────────────────────── consultas ─────────────────────────────

  async findMine(identity: Identity, query: ListReportsQueryDto): Promise<Page<Report>> {
    return this.paginate({ ...this.filters(identity, query), userId: identity.userId }, query);
  }

  async findAll(identity: Identity, query: ListReportsQueryDto): Promise<Page<Report>> {
    return this.paginate(this.filters(identity, query), query);
  }

  private filters(identity: Identity, query: ListReportsQueryDto): FindOptionsWhere<Report> {
    const where: FindOptionsWhere<Report> = {};
    if (query.status) where.status = query.status;
    if (query.category) where.category = query.category;
    if (query.municipality) where.municipalityCode = query.municipality;
    if (query.assignedTo) where.assignedTo = query.assignedTo === 'me' ? identity.userId : query.assignedTo;
    return where;
  }

  private async paginate(where: FindOptionsWhere<Report>, query: ListReportsQueryDto): Promise<Page<Report>> {
    const [items, total] = await this.reports.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return { items, total, page: query.page, limit: query.limit };
  }

  /** Obtiene un reporte aplicando el control de acceso: el autor o el personal institucional. */
  async findAccessible(identity: Identity, id: string): Promise<Report> {
    const report = await this.reports.findOne({ where: { id } });
    if (!report) throw new NotFoundException('Reporte no encontrado');
    if (!isStaff(identity) && report.userId !== identity.userId) {
      // 404 en lugar de 403 para no revelar la existencia de reportes ajenos.
      throw new NotFoundException('Reporte no encontrado');
    }
    return report;
  }

  async getDetail(
    identity: Identity,
    id: string,
  ): Promise<Report & { allowedTransitions: ReportStatus[]; observations: ReportObservation[] }> {
    const report = await this.findAccessible(identity, id);
    const observations = await this.observations.find({ where: { reportId: id }, order: { createdAt: 'ASC' } });
    return {
      ...report,
      allowedTransitions: isStaff(identity) ? [...TRANSITIONS[report.status]] : [],
      observations,
    };
  }

  async getHistory(identity: Identity, id: string): Promise<ReportHistory[]> {
    await this.findAccessible(identity, id);
    return this.history.find({ where: { reportId: id }, order: { createdAt: 'ASC' } });
  }

  // ───────────────────────────── modificaciones ─────────────────────────────

  async update(identity: Identity, id: string, dto: UpdateReportDto): Promise<Report> {
    const report = await this.findAccessible(identity, id);
    if (!isStaff(identity) && report.status !== ReportStatus.PENDIENTE) {
      throw new ForbiddenException('Solo puede editar su reporte mientras está PENDIENTE');
    }
    return this.dataSource.transaction(async (manager) => {
      const changes: string[] = [];
      const newCategory: string | undefined = dto.category;
      if (newCategory && newCategory !== report.category) {
        await this.addHistory(
          manager,
          id,
          identity.userId,
          HistoryAction.CATEGORY_CHANGED,
          report.category,
          newCategory,
        );
        report.category = newCategory;
      }
      if (dto.title !== undefined && dto.title !== report.title) {
        report.title = dto.title;
        changes.push('título');
      }
      if (dto.description !== undefined && dto.description !== report.description) {
        report.description = dto.description;
        changes.push('descripción');
      }
      if (changes.length > 0) {
        await this.addHistory(
          manager,
          id,
          identity.userId,
          HistoryAction.UPDATED,
          null,
          null,
          `Actualizado: ${changes.join(', ')}`,
        );
      }
      const saved = await manager.getRepository(Report).save(report);
      await this.enqueueLocation(manager, saved);
      return saved;
    });
  }

  async changeStatus(identity: Identity, id: string, dto: ChangeStatusDto): Promise<Report> {
    const report = await this.findAccessible(identity, id);
    const from = report.status;
    if (!canTransition(from, dto.status)) {
      throw new BadRequestException(`Transición no permitida: ${from} → ${dto.status}`);
    }
    if (requiresComment(dto.status) && !dto.comment) {
      throw new BadRequestException(`El estado ${dto.status} requiere un comentario para el ciudadano`);
    }
    return this.dataSource.transaction(async (manager) => {
      report.status = dto.status;
      const saved = await manager.getRepository(Report).save(report);
      await this.addHistory(manager, id, identity.userId, HistoryAction.STATUS_CHANGED, from, dto.status, dto.comment);
      await this.enqueueLocation(manager, saved);
      await this.outbox.enqueue(manager, OutboxType.NOTIFY, id, {
        type: 'CAMBIO_ESTADO',
        recipientUserId: report.userId,
        data: { reportId: id, title: report.title, from, to: dto.status, comment: dto.comment ?? null },
      });
      return saved;
    });
  }

  async assign(identity: Identity, id: string, dto: AssignDto): Promise<Report> {
    const report = await this.findAccessible(identity, id);
    if (report.status === ReportStatus.RESUELTO || report.status === ReportStatus.RECHAZADO) {
      throw new BadRequestException('No se puede asignar un reporte cerrado');
    }
    await this.ensureAssignable(dto.assigneeId);
    const previous = report.assignedTo;
    return this.dataSource.transaction(async (manager) => {
      report.assignedTo = dto.assigneeId;
      const saved = await manager.getRepository(Report).save(report);
      await this.addHistory(manager, id, identity.userId, HistoryAction.ASSIGNED, previous, dto.assigneeId);
      await this.outbox.enqueue(manager, OutboxType.NOTIFY, id, {
        type: 'ASIGNACION',
        recipientUserId: dto.assigneeId,
        data: { reportId: id, title: report.title, category: report.category },
      });
      return saved;
    });
  }

  private async ensureAssignable(userId: string): Promise<void> {
    try {
      const user = await this.users.findById(userId);
      if (!user.active || !STAFF_ROLES.includes(user.role as Role)) {
        throw new BadRequestException('El responsable debe ser un usuario institucional activo');
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      if (e instanceof UpstreamError && e.status === 404) throw new BadRequestException('El responsable no existe');
      throw new ServiceUnavailableException('No se pudo verificar el responsable; intente de nuevo');
    }
  }

  async addObservation(identity: Identity, id: string, text: string): Promise<ReportObservation> {
    await this.findAccessible(identity, id);
    return this.observations.save(
      this.observations.create({ reportId: id, authorId: identity.userId, authorRole: identity.role, text }),
    );
  }

  // ───────────────────────────── IA (recomendación) ─────────────────────────────

  /**
   * Solicita una clasificación sugerida. Nunca modifica la categoría del reporte: el funcionario
   * decide si acepta la sugerencia. Si multimedia o ai fallan, el reporte no se ve afectado.
   */
  async analyze(identity: Identity, id: string): Promise<AnalysisResult> {
    const report = await this.findAccessible(identity, id);
    let evidences;
    try {
      evidences = await this.multimedia.listByReport(id);
    } catch (e) {
      return this.markAiUnavailable(report, `multimedia no disponible: ${(e as Error).message}`);
    }
    if (evidences.length === 0) {
      throw new BadRequestException('Adjunte al menos una fotografía antes de solicitar el análisis');
    }
    try {
      const result = await this.ai.classify({
        reportId: id,
        text: `${report.title}. ${report.description}`,
        evidences: evidences.map((e) => ({
          id: e.id,
          url: `${this.multimediaUrl}/internal/evidences/${e.id}/file`,
          mimeType: e.mimeType,
          originalName: e.originalName,
        })),
      });
      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(Report).update(id, {
          aiStatus: AiStatus.COMPLETED,
          aiSuggestedCategory: result.suggestedCategory,
          aiConfidence: result.confidence,
        });
        await this.addHistory(
          manager,
          id,
          'ai-service',
          HistoryAction.AI_SUGGESTION,
          null,
          result.suggestedCategory,
          `Sugerencia automática (${result.provider}), confianza ${result.confidence.toFixed(2)}. Requiere revisión.`,
        );
      });
      return {
        aiStatus: AiStatus.COMPLETED,
        suggestedCategory: result.suggestedCategory,
        confidence: result.confidence,
        requiresReview: true,
        provider: result.provider,
      };
    } catch (e) {
      return this.markAiUnavailable(report, `ai no disponible: ${(e as Error).message}`);
    }
  }

  private async markAiUnavailable(report: Report, reason: string): Promise<AnalysisResult> {
    this.logger.warn(`Análisis IA del reporte ${report.id} no disponible: ${reason}`);
    await this.reports.update(report.id, { aiStatus: AiStatus.UNAVAILABLE });
    return {
      aiStatus: AiStatus.UNAVAILABLE,
      suggestedCategory: null,
      confidence: null,
      requiresReview: true,
      reason: 'El análisis automático no está disponible temporalmente. El reporte quedó registrado.',
    };
  }

  // ───────────────────────────── estadísticas e interno ─────────────────────────────

  async stats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byCategory: Record<string, number>;
    byMunicipality: Record<string, number>;
  }> {
    const group = async (column: string): Promise<Record<string, number>> => {
      const rows = await this.reports
        .createQueryBuilder('r')
        .select(`r.${column}`, 'k')
        .addSelect('COUNT(*)', 'n')
        .groupBy(`r.${column}`)
        .getRawMany<{ k: string | null; n: string }>();
      return Object.fromEntries(rows.map((r) => [r.k ?? 'SIN_VALIDAR', Number(r.n)]));
    };
    const byStatus = await group('status');
    const byCategory = await group('category');
    const byMunicipality = await group('municipalityName');
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    return { total, byStatus, byCategory, byMunicipality };
  }

  async accessInfo(id: string): Promise<{ id: string; ownerId: string; status: ReportStatus }> {
    const report = await this.reports.findOne({ where: { id }, select: ['id', 'userId', 'status'] });
    if (!report) throw new NotFoundException('Reporte no encontrado');
    return { id: report.id, ownerId: report.userId, status: report.status };
  }

  // ───────────────────────────── auxiliares ─────────────────────────────

  private async enqueueLocation(manager: EntityManager, report: Report): Promise<void> {
    await this.outbox.enqueue(manager, OutboxType.LOCATION_UPSERT, report.id, {
      latitude: report.latitude,
      longitude: report.longitude,
      category: report.category,
      status: report.status,
      title: report.title,
      reportedAt: (report.createdAt ?? new Date()).toISOString(),
    });
  }

  private async addHistory(
    manager: EntityManager,
    reportId: string,
    changedBy: string,
    action: HistoryAction,
    fromValue: string | null,
    toValue: string | null,
    comment?: string | null,
  ): Promise<void> {
    await manager
      .getRepository(ReportHistory)
      .insert({ reportId, changedBy, action, fromValue, toValue, comment: comment ?? null });
  }
}
