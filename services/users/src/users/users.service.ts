import { BadRequestException, Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';
import { PasswordHasher } from '../auth/password-hasher';
import { Role } from '../common/identity';
import type { ChangeRoleDto, ListUsersQueryDto, UpdateProfileDto } from './dto/users.dto';
import { toUserView, User, type UserView } from './user.entity';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly hasher: PasswordHasher,
    private readonly config: ConfigService,
  ) {}

  /** Crea el administrador inicial desde variables de entorno si todavía no existe ninguno. */
  async onModuleInit(): Promise<void> {
    const email = this.config.get<string>('ADMIN_EMAIL');
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!email || !password) return;
    const admins = await this.users.count({ where: { role: Role.ADMIN } });
    if (admins > 0) return;
    const existing = await this.users.findOne({ where: { email: email.toLowerCase() } });
    if (existing) {
      await this.users.update(existing.id, { role: Role.ADMIN });
    } else {
      await this.users.save(
        this.users.create({
          email: email.toLowerCase(),
          passwordHash: await this.hasher.hash(password),
          fullName: 'Administrador GreenAlert',
          role: Role.ADMIN,
        }),
      );
    }
    this.logger.log(`Administrador inicial asegurado: ${email}`);
  }

  async findById(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async getProfile(id: string): Promise<UserView> {
    return toUserView(await this.findById(id));
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<UserView> {
    const user = await this.findById(id);
    if (dto.fullName !== undefined) user.fullName = dto.fullName;
    if (dto.phone !== undefined) user.phone = dto.phone;
    return toUserView(await this.users.save(user));
  }

  async list(query: ListUsersQueryDto): Promise<Page<UserView>> {
    const [items, total] = await this.users.findAndCount({
      where: query.role ? { role: query.role } : {},
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return { items: items.map(toUserView), total, page: query.page, limit: query.limit };
  }

  async findByRoles(roles: Role[], onlyActive = true): Promise<UserView[]> {
    const items = await this.users.find({
      where: { role: In(roles), ...(onlyActive ? { active: true } : {}) },
      order: { fullName: 'ASC' },
      take: 500,
    });
    return items.map(toUserView);
  }

  async changeRole(actorId: string, id: string, dto: ChangeRoleDto): Promise<UserView> {
    if (actorId === id && dto.role !== Role.ADMIN) {
      throw new BadRequestException('Un administrador no puede quitarse su propio rol');
    }
    const user = await this.findById(id);
    user.role = dto.role;
    user.entity = dto.role === Role.CIUDADANO ? null : (dto.entity ?? user.entity);
    return toUserView(await this.users.save(user));
  }

  async changeStatus(actorId: string, id: string, active: boolean): Promise<UserView> {
    if (actorId === id && !active) {
      throw new BadRequestException('No puede desactivar su propia cuenta');
    }
    const user = await this.findById(id);
    user.active = active;
    return toUserView(await this.users.save(user));
  }
}
