import { ConflictException, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { LessThan, type Repository } from 'typeorm';
import { NOTIFICATIONS_CLIENT, type NotificationsPort } from '../clients/notifications.client';
import { type Identity, Role } from '../common/identity';
import { toUserView, User, type UserView } from '../users/user.entity';
import type { LoginDto, RegisterDto, TokenResponseDto } from './dto/auth.dto';
import { PasswordHasher } from './password-hasher';
import { RevokedToken } from './revoked-token.entity';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  jti: string;
  exp?: number;
}

@Injectable()
export class AuthService {
  // Hash de referencia para igualar el tiempo de respuesta cuando el correo no existe
  // (mitiga la enumeración de usuarios por tiempo). Se calcula una sola vez.
  private dummyHash?: Promise<string>;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RevokedToken) private readonly revoked: Repository<RevokedToken>,
    private readonly hasher: PasswordHasher,
    private readonly jwt: JwtService,
    @Inject(NOTIFICATIONS_CLIENT) private readonly notifications: NotificationsPort,
  ) {}

  async register(dto: RegisterDto): Promise<UserView> {
    const exists = await this.users.exists({ where: { email: dto.email } });
    if (exists) throw new ConflictException('El correo ya está registrado');
    const user = await this.users.save(
      this.users.create({
        email: dto.email,
        passwordHash: await this.hasher.hash(dto.password),
        fullName: dto.fullName,
        phone: dto.phone ?? null,
        role: Role.CIUDADANO, // el registro público siempre crea ciudadanos
      }),
    );
    // Fire-and-forget controlado: el resultado no afecta a la respuesta.
    await this.notifications.notifyRegistration(user);
    return toUserView(user);
  }

  async login(dto: LoginDto): Promise<TokenResponseDto & { user: UserView }> {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email: dto.email })
      .getOne();
    this.dummyHash ??= this.hasher.hash(randomUUID());
    const valid = await this.hasher.verify(dto.password, user?.passwordHash ?? (await this.dummyHash));
    if (!user || !valid) throw new UnauthorizedException('Credenciales inválidas');
    if (!user.active) throw new ForbiddenException('La cuenta está desactivada');

    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role, jti: randomUUID() };
    const accessToken = await this.jwt.signAsync(payload);
    const decoded = this.jwt.decode<JwtPayload>(accessToken);
    const expiresIn = decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 0;
    return { accessToken, tokenType: 'Bearer', expiresIn, user: toUserView(user) };
  }

  async logout(identity: Identity): Promise<void> {
    if (!identity.jti) throw new UnauthorizedException('Token sin identificador');
    const expiresAt = identity.tokenExp ? new Date(identity.tokenExp * 1000) : new Date(Date.now() + 86_400_000);
    await this.revoked.upsert({ jti: identity.jti, userId: identity.userId, expiresAt }, ['jti']);
    // Limpieza oportunista de revocaciones caducadas (ya no son necesarias).
    await this.revoked.delete({ expiresAt: LessThan(new Date()) });
  }

  async isRevoked(jti: string): Promise<boolean> {
    return this.revoked.exists({ where: { jti } });
  }
}
