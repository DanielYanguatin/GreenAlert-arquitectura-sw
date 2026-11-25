import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type Identity, Public, Role, Roles } from '../common/identity';
import { CreateNotificationDto, ListNotificationsQueryDto } from './dto/notifications.dto';
import type { Notification } from './notification.entity';
import { type Page, NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Historial de notificaciones del usuario autenticado' })
  mine(@CurrentUser() identity: Identity, @Query() query: ListNotificationsQueryDto): Promise<Page<Notification>> {
    return this.service.listForUser(identity.userId, query);
  }

  @Patch(':id/read')
  @HttpCode(204)
  @ApiOperation({ summary: 'Marca una notificación propia como leída' })
  read(@CurrentUser() identity: Identity, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.service.markRead(identity.userId, id);
  }

  @Get('stats')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Estado de la cola de entrega (ADMIN)' })
  stats(): ReturnType<NotificationsService['stats']> {
    return this.service.stats();
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Todas las notificaciones (ADMIN)' })
  all(@Query() query: ListNotificationsQueryDto): Promise<Page<Notification>> {
    return this.service.listAll(query);
  }
}

@ApiTags('internal')
@Controller('internal/notifications')
export class InternalNotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Post()
  @Public()
  @HttpCode(202)
  @ApiOperation({ summary: '[Interno] Encola una notificación (users, reports)' })
  create(@Body() dto: CreateNotificationDto): Promise<{ accepted: number; ids: string[] }> {
    return this.service.accept(dto);
  }
}
