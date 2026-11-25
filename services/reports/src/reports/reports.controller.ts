import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type Identity, Public, Role, Roles, STAFF_ROLES } from '../common/identity';
import {
  AssignDto,
  ChangeStatusDto,
  CreateReportDto,
  ListReportsQueryDto,
  ObservationDto,
  UpdateReportDto,
} from './dto/reports.dto';
import type { Report, ReportHistory, ReportObservation } from './entities';
import { type AnalysisResult, type Page, ReportsService } from './reports.service';

const uuid = new ParseUUIDPipe();

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @ApiOperation({ summary: 'Crea un reporte ambiental (cualquier usuario autenticado)' })
  create(@CurrentUser() identity: Identity, @Body() dto: CreateReportDto): Promise<Report> {
    return this.reports.create(identity, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Reportes del usuario autenticado' })
  mine(@CurrentUser() identity: Identity, @Query() query: ListReportsQueryDto): Promise<Page<Report>> {
    return this.reports.findMine(identity, query);
  }

  @Get('stats')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Estadísticas agregadas (personal institucional)' })
  stats(): ReturnType<ReportsService['stats']> {
    return this.reports.stats();
  }

  @Get()
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Todos los reportes con filtros (personal institucional)' })
  list(@CurrentUser() identity: Identity, @Query() query: ListReportsQueryDto): Promise<Page<Report>> {
    return this.reports.findAll(identity, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un reporte (autor o personal)' })
  detail(@CurrentUser() identity: Identity, @Param('id', uuid) id: string): ReturnType<ReportsService['getDetail']> {
    return this.reports.getDetail(identity, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualiza título, descripción o categoría' })
  update(
    @CurrentUser() identity: Identity,
    @Param('id', uuid) id: string,
    @Body() dto: UpdateReportDto,
  ): Promise<Report> {
    return this.reports.update(identity, id, dto);
  }

  @Patch(':id/status')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Cambia el estado según la máquina de estados' })
  changeStatus(
    @CurrentUser() identity: Identity,
    @Param('id', uuid) id: string,
    @Body() dto: ChangeStatusDto,
  ): Promise<Report> {
    return this.reports.changeStatus(identity, id, dto);
  }

  @Patch(':id/assignment')
  @Roles(Role.ADMIN, Role.GESTOR_AMBIENTAL)
  @ApiOperation({ summary: 'Asigna un responsable institucional (GESTOR_AMBIENTAL, ADMIN)' })
  assign(@CurrentUser() identity: Identity, @Param('id', uuid) id: string, @Body() dto: AssignDto): Promise<Report> {
    return this.reports.assign(identity, id, dto);
  }

  @Post(':id/observations')
  @ApiOperation({ summary: 'Registra una observación de seguimiento' })
  observe(
    @CurrentUser() identity: Identity,
    @Param('id', uuid) id: string,
    @Body() dto: ObservationDto,
  ): Promise<ReportObservation> {
    return this.reports.addObservation(identity, id, dto.text);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Historial de cambios del reporte' })
  history(@CurrentUser() identity: Identity, @Param('id', uuid) id: string): Promise<ReportHistory[]> {
    return this.reports.getHistory(identity, id);
  }

  @Post(':id/analysis')
  @HttpCode(200)
  @ApiOperation({ summary: 'Solicita la clasificación sugerida por IA (no bloqueante si la IA falla)' })
  analyze(@CurrentUser() identity: Identity, @Param('id', uuid) id: string): Promise<AnalysisResult> {
    return this.reports.analyze(identity, id);
  }
}

@ApiTags('internal')
@Controller('internal/reports')
export class InternalReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get(':id/access')
  @Public()
  @ApiOperation({ summary: '[Interno] Propietario y estado de un reporte (usado por multimedia)' })
  access(@Param('id', uuid) id: string): ReturnType<ReportsService['accessInfo']> {
    return this.reports.accessInfo(id);
  }
}
