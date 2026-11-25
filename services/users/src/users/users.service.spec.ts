import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { PasswordHasher } from '../auth/password-hasher';
import { Role } from '../common/identity';
import type { User } from './user.entity';
import { UsersService } from './users.service';

const ID = '11111111-1111-4111-8111-111111111111';

function user(overrides: Partial<User> = {}): User {
  return {
    id: ID,
    email: 'ana@example.com',
    passwordHash: 'x',
    fullName: 'Ana',
    phone: null,
    role: Role.CIUDADANO,
    entity: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('UsersService', () => {
  let repo: Record<string, jest.Mock>;
  let service: UsersService;
  const hasher = new PasswordHasher(new ConfigService({ BCRYPT_ROUNDS: 10 }));

  function build(env: Record<string, string> = {}): UsersService {
    return new UsersService(repo as unknown as Repository<User>, hasher, new ConfigService(env));
  }

  beforeEach(() => {
    repo = {
      findOne: jest.fn().mockResolvedValue(user()),
      save: jest.fn((u: User) => Promise.resolve(u)),
      create: jest.fn((u: Partial<User>) => u),
      update: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([user({ role: Role.FUNCIONARIO })]),
      findAndCount: jest.fn().mockResolvedValue([[user()], 1]),
    };
    service = build();
  });

  it('lanza 404 si el usuario no existe', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.getProfile(ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('actualiza solo los campos enviados del perfil', async () => {
    const res = await service.updateProfile(ID, { phone: '3101234567' });
    expect(res.phone).toBe('3101234567');
    expect(res.fullName).toBe('Ana');
    expect(res).not.toHaveProperty('passwordHash');
  });

  it('pagina el listado', async () => {
    const res = await service.list({ page: 2, limit: 10 });
    expect(repo.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }));
    expect(res.total).toBe(1);
  });

  it('cambia el rol y asocia la entidad ambiental', async () => {
    const res = await service.changeRole('admin-id', ID, { role: Role.FUNCIONARIO, entity: 'CORPOAMAZONIA' });
    expect(res.role).toBe(Role.FUNCIONARIO);
    expect(res.entity).toBe('CORPOAMAZONIA');
  });

  it('impide que un administrador se quite su propio rol', async () => {
    await expect(service.changeRole(ID, ID, { role: Role.CIUDADANO })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('impide desactivar la propia cuenta', async () => {
    await expect(service.changeStatus(ID, ID, false)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('desactiva otra cuenta', async () => {
    await expect(service.changeStatus('admin-id', ID, false)).resolves.toHaveProperty('active', false);
  });

  it('lista usuarios por roles', async () => {
    const res = await service.findByRoles([Role.FUNCIONARIO]);
    expect(res[0].role).toBe(Role.FUNCIONARIO);
  });

  describe('administrador inicial', () => {
    it('no hace nada sin variables de entorno', async () => {
      await service.onModuleInit();
      expect(repo.count).not.toHaveBeenCalled();
    });

    it('crea el administrador si no existe ninguno', async () => {
      repo.findOne.mockResolvedValue(null);
      service = build({ ADMIN_EMAIL: 'Admin@Example.com', ADMIN_PASSWORD: 'Admin12345' });
      await service.onModuleInit();
      const created = (repo.save.mock.calls as User[][])[0][0];
      expect(created.role).toBe(Role.ADMIN);
      expect(created.email).toBe('admin@example.com');
      expect(created.passwordHash).not.toBe('Admin12345');
    });

    it('promueve un usuario existente con ese correo', async () => {
      service = build({ ADMIN_EMAIL: 'ana@example.com', ADMIN_PASSWORD: 'Admin12345' });
      await service.onModuleInit();
      expect(repo.update).toHaveBeenCalledWith(ID, { role: Role.ADMIN });
    });

    it('no duplica administradores', async () => {
      repo.count.mockResolvedValue(1);
      service = build({ ADMIN_EMAIL: 'a@b.co', ADMIN_PASSWORD: 'Admin12345' });
      await service.onModuleInit();
      expect(repo.save).not.toHaveBeenCalled();
    });
  });
});
