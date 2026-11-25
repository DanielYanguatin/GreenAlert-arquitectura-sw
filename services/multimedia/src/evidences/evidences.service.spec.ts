import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { FAKE_EXE, JPEG, PNG } from '../../test/fixtures';
import { UpstreamError } from '../common/http-client';
import { type Identity, Role } from '../common/identity';
import type { Evidence } from './evidence.entity';
import { EvidencesService } from './evidences.service';

const OWNER: Identity = { userId: 'owner', role: Role.CIUDADANO, email: '' };
const STRANGER: Identity = { userId: 'stranger', role: Role.CIUDADANO, email: '' };
const OFFICER: Identity = { userId: 'officer', role: Role.FUNCIONARIO, email: '' };
const file = (buffer: Buffer, name = 'foto.jpg') => ({ originalname: name, size: buffer.length, buffer });

describe('EvidencesService', () => {
  let repo: Record<string, jest.Mock>;
  let storage: { save: jest.Mock; open: jest.Mock; remove: jest.Mock };
  let reports: { getAccess: jest.Mock };
  let service: EvidencesService;
  let found: Partial<Evidence> | null;

  beforeEach(() => {
    found = null;
    const qb = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(() => Promise.resolve(found)),
    };
    repo = {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((e: Partial<Evidence>) => e),
      save: jest.fn((list: Partial<Evidence>[]) =>
        Promise.resolve(list.map((e, i) => ({ ...e, id: `ev-${i}`, createdAt: new Date() }))),
      ),
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(() => qb),
    };
    storage = {
      save: jest.fn().mockResolvedValue(undefined),
      open: jest.fn().mockResolvedValue('stream'),
      remove: jest.fn(),
    };
    reports = { getAccess: jest.fn().mockResolvedValue({ id: 'r1', ownerId: 'owner', status: 'PENDIENTE' }) };
    service = new EvidencesService(
      repo as unknown as Repository<Evidence>,
      storage,
      reports,
      new ConfigService({ MAX_FILES_PER_REPORT: 3 }),
    );
  });

  it('guarda archivos válidos con nombre generado, tipo detectado y hash SHA-256', async () => {
    const res = await service.upload(OWNER, 'r1', [file(JPEG), file(PNG, 'otra.png')]);
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({ mimeType: 'image/jpeg', originalName: 'foto.jpg', uploaderId: 'owner' });
    expect(res[1].mimeType).toBe('image/png');
    expect(res[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(res[0]).not.toHaveProperty('storedName');
    const storedNames = (storage.save.mock.calls as [string][]).map(([n]) => n);
    expect(storedNames[0]).toMatch(/^[0-9a-f-]{36}\.jpg$/);
  });

  it('rechaza con 415 un archivo cuyo contenido no es imagen, sin escribir en disco', async () => {
    await expect(service.upload(OWNER, 'r1', [file(JPEG), file(FAKE_EXE, 'virus.jpg')])).rejects.toBeInstanceOf(
      UnsupportedMediaTypeException,
    );
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('exige al menos un archivo', async () => {
    await expect(service.upload(OWNER, 'r1', [])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('impide que un tercero adjunte evidencias', async () => {
    await expect(service.upload(STRANGER, 'r1', [file(JPEG)])).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite al personal institucional adjuntar evidencias', async () => {
    await expect(service.upload(OFFICER, 'r1', [file(JPEG)])).resolves.toHaveLength(1);
  });

  it('respeta el máximo de evidencias por reporte', async () => {
    repo.count.mockResolvedValue(2);
    await expect(service.upload(OWNER, 'r1', [file(JPEG), file(JPEG)])).rejects.toThrow('Máximo 3');
  });

  it('no admite evidencias en reportes cerrados', async () => {
    reports.getAccess.mockResolvedValue({ id: 'r1', ownerId: 'owner', status: 'RESUELTO' });
    await expect(service.upload(OWNER, 'r1', [file(JPEG)])).rejects.toThrow('cerrado');
  });

  it('responde 503 si reports no está disponible (no se aceptan archivos sin verificar)', async () => {
    reports.getAccess.mockRejectedValue(new UpstreamError('caído'));
    await expect(service.upload(OWNER, 'r1', [file(JPEG)])).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('responde 404 si el reporte no existe', async () => {
    reports.getAccess.mockRejectedValue(new UpstreamError('no', 404));
    await expect(service.upload(OWNER, 'r1', [file(JPEG)])).rejects.toBeInstanceOf(NotFoundException);
  });

  it('elimina los archivos escritos si falla la base de datos', async () => {
    repo.save.mockRejectedValue(new Error('ER_LOCK_DEADLOCK'));
    await expect(service.upload(OWNER, 'r1', [file(JPEG), file(PNG)])).rejects.toThrow('ER_LOCK_DEADLOCK');
    expect(storage.remove).toHaveBeenCalledTimes(2);
  });

  it('lista evidencias solo para el autor o el personal', async () => {
    await expect(service.listForUser(OWNER, 'r1')).resolves.toEqual([]);
    await expect(service.listForUser(OFFICER, 'r1')).resolves.toEqual([]);
    await expect(service.listForUser(STRANGER, 'r1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('abre el archivo de una evidencia del propio usuario', async () => {
    found = { id: 'e1', reportId: 'r1', uploaderId: 'owner', storedName: 'x.jpg' };
    await expect(service.openFile('e1', OWNER)).resolves.toMatchObject({ stream: 'stream' });
  });

  it('404 si la evidencia o el archivo físico no existen', async () => {
    await expect(service.openFile('nope')).rejects.toBeInstanceOf(NotFoundException);
    found = { id: 'e1', reportId: 'r1', uploaderId: 'owner', storedName: 'x.jpg' };
    storage.open.mockRejectedValue(new Error('ENOENT'));
    await expect(service.openFile('e1')).rejects.toThrow('Archivo no disponible');
  });

  it('solo quien subió la evidencia o ADMIN pueden eliminarla', async () => {
    found = { id: 'e1', reportId: 'r1', uploaderId: 'owner', storedName: 'x.jpg' };
    await expect(service.remove(STRANGER, 'e1')).rejects.toBeInstanceOf(ForbiddenException);
    await service.remove({ userId: 'admin', role: Role.ADMIN, email: '' }, 'e1');
    expect(repo.delete).toHaveBeenCalledWith('e1');
    expect(storage.remove).toHaveBeenCalledWith('x.jpg');
  });
});
