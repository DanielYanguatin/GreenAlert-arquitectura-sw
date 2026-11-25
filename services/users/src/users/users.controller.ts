import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type Identity, isRole, Public, Role, Roles, STAFF_ROLES } from '../common/identity';
import { ChangeRoleDto, ChangeStatusDto, ListUsersQueryDto, UpdateProfileDto } from './dto/users.dto';
import type { UserView } from './user.entity';
import { type Page, UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch('me')
  @ApiOperation({ summary: 'Actualiza el perfil propio' })
  updateMe(@CurrentUser() identity: Identity, @Body() dto: UpdateProfileDto): Promise<UserView> {
    return this.users.updateProfile(identity.userId, dto);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Lista paginada de usuarios (ADMIN)' })
  list(@Query() query: ListUsersQueryDto): Promise<Page<UserView>> {
    return this.users.list(query);
  }

  @Get('staff')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Personal institucional activo (para asignar reportes)' })
  staff(): Promise<UserView[]> {
    return this.users.findByRoles([...STAFF_ROLES]);
  }

  @Patch(':id/role')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Cambia el rol de un usuario (ADMIN)' })
  changeRole(
    @CurrentUser() identity: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ChangeRoleDto,
  ): Promise<UserView> {
    return this.users.changeRole(identity.userId, id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Activa o desactiva un usuario (ADMIN)' })
  changeStatus(
    @CurrentUser() identity: Identity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ChangeStatusDto,
  ): Promise<UserView> {
    return this.users.changeStatus(identity.userId, id, dto.active);
  }
}

/** Consultas entre servicios (p. ej. notifications resuelve destinatarios). */
@ApiTags('internal')
@Controller('internal/users')
export class InternalUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Public()
  @ApiQuery({ name: 'roles', example: 'FUNCIONARIO,GESTOR_AMBIENTAL' })
  @ApiOperation({ summary: '[Interno] Usuarios activos por roles' })
  byRoles(@Query('roles') roles = ''): Promise<UserView[]> {
    const parsed = roles.split(',').map((r) => r.trim());
    if (parsed.length === 0 || !parsed.every(isRole)) {
      throw new BadRequestException('Parámetro roles inválido');
    }
    return this.users.findByRoles(parsed);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: '[Interno] Datos de contacto de un usuario' })
  byId(@Param('id', new ParseUUIDPipe()) id: string): Promise<UserView> {
    return this.users.getProfile(id);
  }
}
