import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DataSource, Repository } from 'typeorm';
import { UpstreamError } from '../common/http-client';
import { type Identity, Role } from '../common/identity';
import { OutboxType } from '../outbox/outbox-event.entity';
import type { OutboxService } from '../outbox/outbox.service';
import { Report, ReportHistory, ReportObservation } from './entities';
import { AiStatus, LocationStatus, ReportCategory, ReportStatus } from './report.domain';
import { ReportsService } from './reports.service';

const CITIZEN: Identity = { userId: 'citizen-1', role: Role.CIUDADANO, email: 'c@x.co' };
const OTHER: Identity = { userId: 'citizen-2', role: Role.CIUDADANO, email: 'o@x.co' };
const OFFICER: Identity = { userId: 'officer-1', role: Role.FUNCIONARIO, email: 'f@x.co' };
const DTO = {
  title: 'Basura en el río',
  description: 'Bolsas de basura acumuladas en la orilla',
  category: ReportCategory.BASURA,
  latitude: 1.15,
  longitude: -76.64,
};

function report(overrides: Partial<Report> = {}): Report {
  return Object.assign(new Report(), {
    id: 'r-1',
    userId: CITIZEN.userId,
    title: DTO.title,
    description: DTO.description,
    category: DTO.category,
    status: ReportStatus.PENDIENTE,
    latitude: 1.15,
    longitude: -76.64,
    address: null,
    municipalityCode: '86001',
    municipalityName: 'Mocoa',
    locationStatus: LocationStatus.VALIDATED,
    assignedTo: null,
    aiStatus: AiStatus.NOT_REQUESTED,
    aiSuggestedCategory: null,
    aiConfidence: null,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date(),
    ...overrides,
  });
}

describe('ReportsService', () => {
  let reportRepo: Record<string, jest.Mock>;
  let historyRepo: Record<string, jest.Mock>;
  let obsRepo: Record<string, jest.Mock>;
  let outbox: { enqueue: jest.Mock };
  let geo: { validate: jest.Mock; upsert: jest.Mock };
  let multimedia: { listByReport: jest.Mock };
  let ai: { classify: jest.Mock };
  let users: { findById: jest.Mock };
  let service: ReportsService;

  beforeEach(() => {
    reportRepo = {
      create: jest.fn((r: Partial<Report>) => Object.assign(new Report(), r)),
      save: jest.fn((r: Report) =>
        Promise.resolve(Object.assign(r, { id: r.id ?? 'r-new', createdAt: r.createdAt ?? new Date() })),
      ),
      findOne: jest.fn().mockResolvedValue(report()),
      findAndCount: jest.fn().mockResolvedValue([[report()], 1]),
      update: jest.fn().mockResolvedValue(undefined),
    };
    historyRepo = { insert: jest.fn().mockResolvedValue(undefined), find: jest.fn().mockResolvedValue([]) };
    obsRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((o: Partial<ReportObservation>) => o),
      save: jest.fn((o: ReportObservation) => Promise.resolve({ ...o, id: 'o-1' })),
    };
    const manager = {
      getRepository: (entity: unknown) =>
        entity === Report ? reportRepo : entity === ReportHistory ? historyRepo : obsRepo,
    };
    const dataSource = { transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)) };
    outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };
    geo = {
      validate: jest.fn().mockResolvedValue({ municipalityCode: '86001', municipalityName: 'Mocoa' }),
      upsert: jest.fn(),
    };
    multimedia = {
      listByReport: jest
        .fn()
        .mockResolvedValue([{ id: 'e-1', mimeType: 'image/jpeg', originalName: 'a.jpg', sizeBytes: 10 }]),
    };
    ai = {
      classify: jest.fn().mockResolvedValue({
        id: 'c-1',
        suggestedCategory: 'BASURA',
        confidence: 0.42,
        provider: 'heuristic',
        modelVersion: 'v0',
        requiresReview: true,
      }),
    };
    users = {
      findById: jest.fn().mockResolvedValue({ id: 'officer-2', role: Role.FUNCIONARIO, active: true, fullName: 'F' }),
    };

    service = new ReportsService(
      dataSource as unknown as DataSource,
      reportRepo as unknown as Repository<Report>,
      historyRepo as unknown as Repository<ReportHistory>,
      obsRepo as unknown as Repository<ReportObservation>,
      outbox as unknown as OutboxService,
      geo,
      multimedia,
      ai,
      users,
      new ConfigService({ MULTIMEDIA_SERVICE_URL: 'http://mm:3003' }),
    );
  });

  const enqueuedTypes = (): string[] =>
    (outbox.enqueue.mock.calls as [unknown, OutboxType, string, { type?: string }][]).map(([, type, , payload]) =>
      type === OutboxType.NOTIFY ? `NOTIFY:${payload.type}` : type,
    );

  describe('create', () => {
    it('crea el reporte PENDIENTE con municipio validado, historial y eventos de outbox', async () => {
      const saved = await service.create(CITIZEN, DTO);
      expect(saved.status).toBe(ReportStatus.PENDIENTE);
      expect(saved.userId).toBe(CITIZEN.userId);
      expect(saved.locationStatus).toBe(LocationStatus.VALIDATED);
      expect(saved.municipalityName).toBe('Mocoa');
      expect(historyRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATED' }));
      expect(enqueuedTypes()).toEqual(['LOCATION_UPSERT', 'NOTIFY:REPORTE_RECIBIDO', 'NOTIFY:NUEVO_REPORTE']);
    });

    it('registra el reporte aunque geolocation esté caído (validación diferida)', async () => {
      geo.validate.mockRejectedValue(new UpstreamError('Servicio no disponible'));
      const saved = await service.create(CITIZEN, DTO);
      expect(saved.locationStatus).toBe(LocationStatus.PENDING);
      expect(saved.municipalityCode).toBeNull();
      expect(enqueuedTypes()).toContain('LOCATION_UPSERT');
    });

    it('rechaza con 422 una ubicación fuera de cobertura', async () => {
      geo.validate.mockRejectedValue(new UpstreamError('fuera', 422));
      await expect(service.create(CITIZEN, DTO)).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(reportRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('control de acceso', () => {
    it('el autor ve su reporte', async () => {
      await expect(service.findAccessible(CITIZEN, 'r-1')).resolves.toHaveProperty('id', 'r-1');
    });

    it('otro ciudadano recibe 404 (no se revela la existencia)', async () => {
      await expect(service.findAccessible(OTHER, 'r-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('el personal institucional ve cualquier reporte y sus transiciones', async () => {
      const detail = await service.getDetail(OFFICER, 'r-1');
      expect(detail.allowedTransitions).toEqual([ReportStatus.EN_REVISION, ReportStatus.RECHAZADO]);
    });

    it('el ciudadano no recibe transiciones permitidas', async () => {
      const detail = await service.getDetail(CITIZEN, 'r-1');
      expect(detail.allowedTransitions).toEqual([]);
    });

    it('404 si el reporte no existe', async () => {
      reportRepo.findOne.mockResolvedValue(null);
      await expect(service.findAccessible(OFFICER, 'x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('consultas', () => {
    it('filtra "mis reportes" por el usuario actual', async () => {
      await service.findMine(CITIZEN, { page: 1, limit: 20, status: ReportStatus.PENDIENTE });
      expect(reportRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: ReportStatus.PENDIENTE, userId: CITIZEN.userId },
          take: 20,
          skip: 0,
        }),
      );
    });

    it('resuelve assignedTo=me al usuario actual', async () => {
      await service.findAll(OFFICER, { page: 2, limit: 10, assignedTo: 'me', municipality: '86001' });
      expect(reportRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { assignedTo: OFFICER.userId, municipalityCode: '86001' }, skip: 10 }),
      );
    });
  });

  describe('update', () => {
    it('el autor edita mientras está PENDIENTE y se registra el cambio de categoría', async () => {
      const saved = await service.update(CITIZEN, 'r-1', {
        category: ReportCategory.VERTIMIENTOS,
        title: 'Nuevo título',
      });
      expect(saved.category).toBe(ReportCategory.VERTIMIENTOS);
      expect(historyRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CATEGORY_CHANGED', toValue: 'VERTIMIENTOS' }),
      );
      expect(historyRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATED' }));
    });

    it('el autor no puede editar un reporte en revisión', async () => {
      reportRepo.findOne.mockResolvedValue(report({ status: ReportStatus.EN_REVISION }));
      await expect(service.update(CITIZEN, 'r-1', { title: 'Otro título' })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('changeStatus', () => {
    it('aplica una transición válida, la registra y notifica al autor', async () => {
      const saved = await service.changeStatus(OFFICER, 'r-1', { status: ReportStatus.EN_REVISION });
      expect(saved.status).toBe(ReportStatus.EN_REVISION);
      expect(historyRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'STATUS_CHANGED', fromValue: 'PENDIENTE', toValue: 'EN_REVISION' }),
      );
      expect(enqueuedTypes()).toEqual(['LOCATION_UPSERT', 'NOTIFY:CAMBIO_ESTADO']);
    });

    it('rechaza transiciones inválidas', async () => {
      await expect(
        service.changeStatus(OFFICER, 'r-1', { status: ReportStatus.RESUELTO, comment: 'x' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('exige comentario al rechazar', async () => {
      await expect(service.changeStatus(OFFICER, 'r-1', { status: ReportStatus.RECHAZADO })).rejects.toThrow(
        'requiere un comentario',
      );
    });
  });

  describe('assign', () => {
    it('asigna a un funcionario activo y lo notifica', async () => {
      const saved = await service.assign(OFFICER, 'r-1', { assigneeId: 'officer-2' });
      expect(saved.assignedTo).toBe('officer-2');
      expect(enqueuedTypes()).toEqual(['NOTIFY:ASIGNACION']);
    });

    it('rechaza asignar a un ciudadano', async () => {
      users.findById.mockResolvedValue({ id: 'c', role: Role.CIUDADANO, active: true, fullName: 'C' });
      await expect(service.assign(OFFICER, 'r-1', { assigneeId: 'c' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza responsables inexistentes', async () => {
      users.findById.mockRejectedValue(new UpstreamError('no', 404));
      await expect(service.assign(OFFICER, 'r-1', { assigneeId: 'x' })).rejects.toThrow('no existe');
    });

    it('responde 503 si users no está disponible', async () => {
      users.findById.mockRejectedValue(new UpstreamError('caído'));
      await expect(service.assign(OFFICER, 'r-1', { assigneeId: 'x' })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('no asigna reportes cerrados', async () => {
      reportRepo.findOne.mockResolvedValue(report({ status: ReportStatus.RESUELTO }));
      await expect(service.assign(OFFICER, 'r-1', { assigneeId: 'officer-2' })).rejects.toThrow('cerrado');
    });
  });

  describe('analyze (IA)', () => {
    it('guarda la sugerencia sin cambiar la categoría del reporte', async () => {
      const res = await service.analyze(CITIZEN, 'r-1');
      expect(res).toMatchObject({ aiStatus: AiStatus.COMPLETED, suggestedCategory: 'BASURA', requiresReview: true });
      expect(reportRepo.update).toHaveBeenCalledWith('r-1', {
        aiStatus: AiStatus.COMPLETED,
        aiSuggestedCategory: 'BASURA',
        aiConfidence: 0.42,
      });
      const input = (ai.classify.mock.calls as [{ evidences: { url: string }[] }][])[0][0];
      expect(input.evidences[0].url).toBe('http://mm:3003/internal/evidences/e-1/file');
    });

    it('si la IA está caída, el reporte sigue intacto y el análisis queda UNAVAILABLE', async () => {
      ai.classify.mockRejectedValue(new UpstreamError('Servicio no disponible'));
      const res = await service.analyze(CITIZEN, 'r-1');
      expect(res.aiStatus).toBe(AiStatus.UNAVAILABLE);
      expect(reportRepo.update).toHaveBeenCalledWith('r-1', { aiStatus: AiStatus.UNAVAILABLE });
      expect(reportRepo.save).not.toHaveBeenCalled();
    });

    it('si multimedia está caído, el análisis queda UNAVAILABLE', async () => {
      multimedia.listByReport.mockRejectedValue(new UpstreamError('caído'));
      await expect(service.analyze(CITIZEN, 'r-1')).resolves.toHaveProperty('aiStatus', AiStatus.UNAVAILABLE);
      expect(ai.classify).not.toHaveBeenCalled();
    });

    it('exige al menos una evidencia', async () => {
      multimedia.listByReport.mockResolvedValue([]);
      await expect(service.analyze(CITIZEN, 'r-1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('accessInfo devuelve propietario y estado', async () => {
    await expect(service.accessInfo('r-1')).resolves.toEqual({
      id: 'r-1',
      ownerId: CITIZEN.userId,
      status: 'PENDIENTE',
    });
  });

  it('addObservation registra autor y rol', async () => {
    const obs = await service.addObservation(OFFICER, 'r-1', 'Visita programada');
    expect(obs).toMatchObject({ authorId: OFFICER.userId, authorRole: Role.FUNCIONARIO, text: 'Visita programada' });
  });
});
