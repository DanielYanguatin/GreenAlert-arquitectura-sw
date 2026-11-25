import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { Municipality } from '../municipalities/municipality.entity';
import { GeolocationService } from './geolocation.service';
import type { ReportLocation } from './report-location.entity';

function muni(overrides: Partial<Municipality>): Municipality {
  return Object.assign(new Municipality(), {
    code: '86001',
    name: 'Mocoa',
    department: 'Putumayo',
    enabled: true,
    minLat: 0.9,
    maxLat: 1.45,
    minLng: -77,
    maxLng: -76.3,
    centerLat: 1.148,
    centerLng: -76.646,
    ...overrides,
  });
}

const UNBOUNDED = { minLat: null, maxLat: null, minLng: null, maxLng: null };

describe('GeolocationService', () => {
  let municipalities: Record<string, jest.Mock>;
  let locations: Record<string, jest.Mock>;
  let service: GeolocationService;

  beforeEach(() => {
    municipalities = {
      find: jest.fn().mockResolvedValue([muni({})]),
      findOne: jest.fn().mockResolvedValue(muni({ code: '86885', name: 'Villagarzón', enabled: false, ...UNBOUNDED })),
      save: jest.fn((m: Municipality) => Promise.resolve(m)),
    };
    locations = {
      create: jest.fn((l: Partial<ReportLocation>) => l),
      save: jest.fn((l: ReportLocation) => Promise.resolve(l)),
      find: jest.fn().mockResolvedValue([]),
    };
    service = new GeolocationService(
      municipalities as unknown as Repository<Municipality>,
      locations as unknown as Repository<ReportLocation>,
    );
  });

  it('resuelve un punto de Mocoa', async () => {
    await expect(service.resolve({ latitude: 1.148, longitude: -76.646 })).resolves.toEqual({
      municipalityCode: '86001',
      municipalityName: 'Mocoa',
    });
  });

  it('rechaza puntos fuera de cobertura con 422', async () => {
    await expect(service.resolve({ latitude: 4.6, longitude: -74.08 })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('elige el municipio más específico cuando hay solapamiento', async () => {
    municipalities.find.mockResolvedValue([
      muni({ code: 'BIG', name: 'Grande', minLat: 0, maxLat: 3, minLng: -78, maxLng: -75 }),
      muni({}),
    ]);
    await expect(service.resolve({ latitude: 1.148, longitude: -76.646 })).resolves.toHaveProperty(
      'municipalityCode',
      '86001',
    );
  });

  it('ignora municipios sin geometría', async () => {
    municipalities.find.mockResolvedValue([muni({ minLat: null })]);
    await expect(service.resolve({ latitude: 1.148, longitude: -76.646 })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('guarda la proyección del reporte con el municipio resuelto', async () => {
    await service.upsert('r1', {
      latitude: 1.15,
      longitude: -76.65,
      category: 'BASURA',
      status: 'PENDIENTE',
      title: 'x',
      reportedAt: '2026-11-01T00:00:00.000Z',
    });
    expect(locations.save).toHaveBeenCalledWith(expect.objectContaining({ reportId: 'r1', municipalityCode: '86001' }));
  });

  it('genera GeoJSON [lng, lat] sin datos del autor', async () => {
    locations.find.mockResolvedValue([
      {
        reportId: 'r1',
        latitude: 1.15,
        longitude: -76.65,
        municipalityCode: '86001',
        category: 'BASURA',
        status: 'PENDIENTE',
        title: 't',
        reportedAt: new Date(),
      },
    ]);
    const fc = await service.geojson({ category: 'BASURA', bbox: '-77,1,-76,2' });
    expect(fc.features[0].geometry.coordinates).toEqual([-76.65, 1.15]);
    expect(Object.keys(fc.features[0].properties)).not.toContain('userId');
  });

  it('rechaza bbox invertido', async () => {
    await expect(service.geojson({ bbox: '-76,1,-77,2' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('filtra por radio exacto y ordena por distancia', async () => {
    locations.find.mockResolvedValue([
      { reportId: 'lejos', latitude: 1.2, longitude: -76.646 },
      { reportId: 'cerca', latitude: 1.149, longitude: -76.646 },
    ]);
    const res = await service.near({ latitude: 1.148, longitude: -76.646, radiusKm: 2 });
    expect(res.map((r) => r.reportId)).toEqual(['cerca']);
    expect(res[0].distanceKm).toBeCloseTo(0.111, 2);
  });

  it('habilita un municipio con geometría y calcula su centro', async () => {
    const res = await service.updateMunicipality('86885', {
      enabled: true,
      minLat: 0.9,
      maxLat: 1.1,
      minLng: -76.7,
      maxLng: -76.5,
    });
    expect(res.enabled).toBe(true);
    expect(res.centerLat).toBeCloseTo(1.0);
  });

  it('no habilita un municipio sin geometría', async () => {
    await expect(service.updateMunicipality('86885', { enabled: true })).rejects.toThrow('rectángulo');
  });

  it('valida límites invertidos y municipios inexistentes', async () => {
    await expect(
      service.updateMunicipality('86885', { minLat: 2, maxLat: 1, minLng: -77, maxLng: -76 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    municipalities.findOne.mockResolvedValue(null);
    await expect(service.updateMunicipality('00000', {})).rejects.toBeInstanceOf(NotFoundException);
  });
});
