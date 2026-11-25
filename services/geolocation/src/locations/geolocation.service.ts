import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, type FindOptionsWhere, type Repository } from 'typeorm';
import { hasBounds, Municipality } from '../municipalities/municipality.entity';
import type { GeoJsonQueryDto, NearQueryDto, UpdateMunicipalityDto, UpsertLocationDto } from './dto/locations.dto';
import { area, boundingBoxAround, contains, haversineKm, type Point } from './geo';
import { ReportLocation } from './report-location.entity';

export interface ResolvedLocation {
  municipalityCode: string;
  municipalityName: string;
}

export interface Feature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: Record<string, unknown>;
}

export interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
}

const MAX_FEATURES = 2000;

@Injectable()
export class GeolocationService {
  constructor(
    @InjectRepository(Municipality) private readonly municipalities: Repository<Municipality>,
    @InjectRepository(ReportLocation) private readonly locations: Repository<ReportLocation>,
  ) {}

  listMunicipalities(): Promise<Municipality[]> {
    return this.municipalities.find({ order: { enabled: 'DESC', name: 'ASC' } });
  }

  /**
   * Determina el municipio con cobertura habilitada que contiene el punto. Si varios rectángulos se
   * solapan, se elige el de menor área (el más específico).
   */
  async resolve(point: Point): Promise<ResolvedLocation> {
    const enabled = await this.municipalities.find({ where: { enabled: true } });
    const match = enabled
      .filter(hasBounds)
      .filter((m) => contains(m, point))
      .sort((a, b) => area(a) - area(b))[0];
    if (!match) {
      throw new UnprocessableEntityException('La ubicación está fuera de la zona de cobertura de GreenAlert');
    }
    return { municipalityCode: match.code, municipalityName: match.name };
  }

  async upsert(reportId: string, dto: UpsertLocationDto): Promise<ResolvedLocation> {
    const resolved = await this.resolve(dto);
    await this.locations.save(
      this.locations.create({
        reportId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        municipalityCode: resolved.municipalityCode,
        category: dto.category,
        status: dto.status,
        title: dto.title,
        reportedAt: new Date(dto.reportedAt),
      }),
    );
    return resolved;
  }

  /** GeoJSON para mapas. No incluye datos personales del autor (privacidad, RNF-17). */
  async geojson(query: GeoJsonQueryDto): Promise<FeatureCollection> {
    const where: FindOptionsWhere<ReportLocation> = {};
    if (query.municipality) where.municipalityCode = query.municipality;
    if (query.category) where.category = query.category;
    if (query.status) where.status = query.status;
    if (query.bbox) {
      const [minLng, minLat, maxLng, maxLat] = query.bbox.split(',').map(Number);
      if (minLng >= maxLng || minLat >= maxLat) throw new BadRequestException('bbox inválido');
      where.latitude = Between(minLat, maxLat);
      where.longitude = Between(minLng, maxLng);
    }
    const rows = await this.locations.find({
      where,
      relations: { municipality: true },
      order: { reportedAt: 'DESC' },
      take: MAX_FEATURES,
    });
    return { type: 'FeatureCollection', features: rows.map((r) => this.toFeature(r)) };
  }

  /** Reportes en un radio: prefiltro por rectángulo (usa el índice lat/lng) y distancia exacta con Haversine. */
  async near(query: NearQueryDto): Promise<(ReportLocation & { distanceKm: number })[]> {
    const box = boundingBoxAround(query, query.radiusKm);
    const candidates = await this.locations.find({
      where: { latitude: Between(box.minLat, box.maxLat), longitude: Between(box.minLng, box.maxLng) },
      take: MAX_FEATURES,
    });
    return candidates
      .map((c) => ({ ...c, distanceKm: Number(haversineKm(query, c).toFixed(3)) }))
      .filter((c) => c.distanceKm <= query.radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 200);
  }

  /** Amplía o ajusta la cobertura (p. ej. habilitar otro municipio del Putumayo) sin cambiar código. */
  async updateMunicipality(code: string, dto: UpdateMunicipalityDto): Promise<Municipality> {
    const municipality = await this.municipalities.findOne({ where: { code } });
    if (!municipality) throw new NotFoundException('Municipio no encontrado');
    Object.assign(municipality, dto);
    if (!hasBounds(municipality) && municipality.enabled) {
      throw new BadRequestException('Para habilitar un municipio debe definir su rectángulo de cobertura');
    }
    if (hasBounds(municipality)) {
      if (municipality.minLat >= municipality.maxLat || municipality.minLng >= municipality.maxLng) {
        throw new BadRequestException('Los límites mínimos deben ser menores que los máximos');
      }
      municipality.centerLat = (municipality.minLat + municipality.maxLat) / 2;
      municipality.centerLng = (municipality.minLng + municipality.maxLng) / 2;
    }
    return this.municipalities.save(municipality);
  }

  private toFeature(r: ReportLocation): Feature {
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] },
      properties: {
        reportId: r.reportId,
        title: r.title,
        category: r.category,
        status: r.status,
        municipality: r.municipality?.name ?? r.municipalityCode,
        reportedAt: r.reportedAt,
      },
    };
  }
}
