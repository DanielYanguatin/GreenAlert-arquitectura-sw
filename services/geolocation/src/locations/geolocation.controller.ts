import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, Role, Roles, STAFF_ROLES } from '../common/identity';
import type { Municipality } from '../municipalities/municipality.entity';
import { GeoJsonQueryDto, NearQueryDto, PointDto, UpdateMunicipalityDto, UpsertLocationDto } from './dto/locations.dto';
import { type FeatureCollection, GeolocationService, type ResolvedLocation } from './geolocation.service';
import type { ReportLocation } from './report-location.entity';

@ApiTags('municipalities')
@Controller('municipalities')
export class MunicipalitiesController {
  constructor(private readonly geo: GeolocationService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Municipios y su estado de cobertura (público)' })
  list(): Promise<Municipality[]> {
    return this.geo.listMunicipalities();
  }

  @Patch(':code')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Habilita o ajusta la cobertura de un municipio (ADMIN)' })
  update(@Param('code') code: string, @Body() dto: UpdateMunicipalityDto): Promise<Municipality> {
    return this.geo.updateMunicipality(code, dto);
  }
}

@ApiTags('locations')
@Controller('locations')
export class LocationsController {
  constructor(private readonly geo: GeolocationService) {}

  @Get('geojson')
  @Public()
  @ApiOperation({ summary: 'Reportes como GeoJSON para el mapa (público, sin datos personales)' })
  geojson(@Query() query: GeoJsonQueryDto): Promise<FeatureCollection> {
    return this.geo.geojson(query);
  }

  @Get('near')
  @ApiBearerAuth()
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Reportes dentro de un radio en km (personal institucional)' })
  near(@Query() query: NearQueryDto): Promise<(ReportLocation & { distanceKm: number })[]> {
    return this.geo.near(query);
  }
}

@ApiTags('internal')
@Controller('internal/locations')
export class InternalLocationsController {
  constructor(private readonly geo: GeolocationService) {}

  @Post('validate')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: '[Interno] Valida coordenadas y resuelve el municipio (422 fuera de cobertura)' })
  validate(@Body() dto: PointDto): Promise<ResolvedLocation> {
    return this.geo.resolve(dto);
  }

  @Put(':reportId')
  @Public()
  @ApiOperation({ summary: '[Interno] Registra o actualiza la proyección geográfica de un reporte' })
  upsert(
    @Param('reportId', new ParseUUIDPipe()) reportId: string,
    @Body() dto: UpsertLocationDto,
  ): Promise<ResolvedLocation> {
    return this.geo.upsert(reportId, dto);
  }
}
