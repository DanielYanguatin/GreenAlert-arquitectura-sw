/** Utilidades geográficas puras (WGS84). */

const EARTH_RADIUS_KM = 6371.0088;

export interface Point {
  latitude: number;
  longitude: number;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Distancia de gran círculo (fórmula de Haversine) en kilómetros. */
export function haversineKm(a: Point, b: Point): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rectángulo que contiene el círculo de radio `radiusKm` (prefiltro indexable en SQL). */
export function boundingBoxAround(center: Point, radiusKm: number): BoundingBox {
  const dLat = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);
  const dLng = dLat / Math.max(Math.cos(toRad(center.latitude)), 1e-6);
  return {
    minLat: Math.max(center.latitude - dLat, -90),
    maxLat: Math.min(center.latitude + dLat, 90),
    minLng: Math.max(center.longitude - dLng, -180),
    maxLng: Math.min(center.longitude + dLng, 180),
  };
}

export function contains(box: BoundingBox, p: Point): boolean {
  return p.latitude >= box.minLat && p.latitude <= box.maxLat && p.longitude >= box.minLng && p.longitude <= box.maxLng;
}

export function area(box: BoundingBox): number {
  return (box.maxLat - box.minLat) * (box.maxLng - box.minLng);
}

export function isValidCoordinate(p: Point): boolean {
  return (
    Number.isFinite(p.latitude) &&
    Number.isFinite(p.longitude) &&
    p.latitude >= -90 &&
    p.latitude <= 90 &&
    p.longitude >= -180 &&
    p.longitude <= 180
  );
}
