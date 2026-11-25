import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Repository } from 'typeorm';
import { Role } from '../common/identity';
import type { User } from '../users/user.entity';
import { AuthService } from './auth.service';
import { PasswordHasher } from './password-hasher';
import type { RevokedToken } from './revoked-token.entity';

type Mocked<T> = { [K in keyof T]?: jest.Mock };

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'ana@example.com',
    passwordHash: '',
    fullName: 'Ana Gómez',
    phone: null,
    role: Role.CIUDADANO,
    entity: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AuthService', () => {
  const hasher = new PasswordHasher(new ConfigService({ BCRYPT_ROUNDS: 10 }));
  const jwt = new JwtService({ secret: 'test-secret-test-secret-test-secret-123', signOptions: { expiresIn: 3600 } });
  let users: Mocked<Repository<User>> & { createQueryBuilder: jest.Mock };
  let revoked: Mocked<Repository<RevokedToken>>;
  let notifications: { notifyRegistration: jest.Mock };
  let service: AuthService;
  let qbResult: User | null;

  beforeEach(() => {
    qbResult = null;
    const qb = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(() => Promise.resolve(qbResult)),
    };
    users = {
      exists: jest.fn().mockResolvedValue(false),
      create: jest.fn((u: Partial<User>) => u),
      save: jest.fn((u: Partial<User>) => Promise.resolve(buildUser(u))),
      createQueryBuilder: jest.fn(() => qb),
    };
    revoked = {
      upsert: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    };
    notifications = { notifyRegistration: jest.fn().mockResolvedValue(true) };
    service = new AuthService(
      users as unknown as Repository<User>,
      revoked as unknown as Repository<RevokedToken>,
      hasher,
      jwt,
      notifications,
    );
  });

  describe('register', () => {
    it('crea un ciudadano con la contraseña cifrada y notifica', async () => {
      const view = await service.register({ email: 'ana@example.com', password: 'Clave1234', fullName: 'Ana Gómez' });
      const saved = (users.save!.mock.calls as User[][])[0][0];
      expect(saved.role).toBe(Role.CIUDADANO);
      expect(saved.passwordHash).not.toBe('Clave1234');
      expect(saved.passwordHash.startsWith('$2')).toBe(true);
      expect(view).not.toHaveProperty('passwordHash');
      expect(notifications.notifyRegistration).toHaveBeenCalledTimes(1);
    });

    it('rechaza correos duplicados con 409', async () => {
      users.exists!.mockResolvedValue(true);
      await expect(
        service.register({ email: 'ana@example.com', password: 'Clave1234', fullName: 'Ana' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(users.save).not.toHaveBeenCalled();
    });

    it('completa el registro aunque notifications falle', async () => {
      notifications.notifyRegistration.mockResolvedValue(false);
      await expect(
        service.register({ email: 'b@example.com', password: 'Clave1234', fullName: 'Bea' }),
      ).resolves.toHaveProperty('email', 'b@example.com');
    });
  });

  describe('login', () => {
    it('emite un JWT con sub, role y jti para credenciales válidas', async () => {
      qbResult = buildUser({ passwordHash: await hasher.hash('Clave1234') });
      const res = await service.login({ email: 'ana@example.com', password: 'Clave1234' });
      const payload = jwt.verify<{ sub: string; role: string; jti: string }>(res.accessToken);
      expect(payload.sub).toBe(qbResult.id);
      expect(payload.role).toBe(Role.CIUDADANO);
      expect(payload.jti).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.expiresIn).toBeGreaterThan(3500);
    });

    it('rechaza contraseña incorrecta con 401', async () => {
      qbResult = buildUser({ passwordHash: await hasher.hash('Clave1234') });
      await expect(service.login({ email: 'ana@example.com', password: 'Otra12345' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rechaza usuario inexistente con el mismo error genérico', async () => {
      await expect(service.login({ email: 'x@example.com', password: 'Clave1234' })).rejects.toThrow(
        'Credenciales inválidas',
      );
    });

    it('rechaza cuentas desactivadas con 403', async () => {
      qbResult = buildUser({ passwordHash: await hasher.hash('Clave1234'), active: false });
      await expect(service.login({ email: 'ana@example.com', password: 'Clave1234' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('logout / revocación', () => {
    it('registra el jti como revocado con su caducidad', async () => {
      const exp = Math.floor(Date.now() / 1000) + 600;
      await service.logout({
        userId: 'u1',
        role: Role.CIUDADANO,
        email: 'a@b.co',
        jti: '22222222-2222-4222-8222-222222222222',
        tokenExp: exp,
      });
      expect(revoked.upsert).toHaveBeenCalledWith(
        { jti: '22222222-2222-4222-8222-222222222222', userId: 'u1', expiresAt: new Date(exp * 1000) },
        ['jti'],
      );
    });

    it('rechaza cierre de sesión sin jti', async () => {
      await expect(service.logout({ userId: 'u1', role: Role.CIUDADANO, email: '' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('consulta la lista de revocación', async () => {
      revoked.exists!.mockResolvedValue(true);
      await expect(service.isRevoked('abc')).resolves.toBe(true);
    });
  });
});
