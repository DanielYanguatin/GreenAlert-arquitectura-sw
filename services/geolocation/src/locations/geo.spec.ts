import { area, boundingBoxAround, contains, haversineKm, isValidCoordinate } from './geo';

describe('utilidades geográficas', () => {
  const mocoa = { latitude: 1.148, longitude: -76.646 };

  it('distancia cero para el mismo punto', () => {
    expect(haversineKm(mocoa, mocoa)).toBe(0);
  });

  it('un grado de latitud equivale a unos 111 km', () => {
    expect(haversineKm({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(111.2, 0);
  });

  it('el rectángulo envolvente contiene el círculo', () => {
    const box = boundingBoxAround(mocoa, 5);
    const east = { latitude: mocoa.latitude, longitude: mocoa.longitude + 0.044 }; // ~4.9 km
    expect(haversineKm(mocoa, east)).toBeLessThan(5);
    expect(contains(box, east)).toBe(true);
    expect(contains(box, { latitude: 2, longitude: -76.646 })).toBe(false);
  });

  it('calcula el área relativa del rectángulo', () => {
    expect(area({ minLat: 0, maxLat: 2, minLng: 0, maxLng: 3 })).toBe(6);
  });

  it.each([
    [{ latitude: 91, longitude: 0 }, false],
    [{ latitude: 0, longitude: -181 }, false],
    [{ latitude: Number.NaN, longitude: 0 }, false],
    [mocoa, true],
  ])('valida coordenadas %j → %s', (p, ok) => {
    expect(isValidCoordinate(p)).toBe(ok);
  });
});
