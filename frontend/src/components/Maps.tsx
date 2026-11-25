import 'leaflet/dist/leaflet.css';
import type { LeafletMouseEvent } from 'leaflet';
import { CircleMarker, MapContainer, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import { Link } from 'react-router-dom';
import type { MapFeature } from '../api/types';
import { categoryColor, categoryLabel, MOCOA_CENTER, statusLabel } from '../domain/labels';
import { TILE_URL } from '../env';

const ATTRIBUTION = '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e: LeafletMouseEvent) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Selector de ubicación: el ciudadano toca el mapa para marcar el punto del problema. */
export function LocationPicker({
  value,
  onChange,
}: {
  value: { lat: number; lng: number } | null;
  onChange: (lat: number, lng: number) => void;
}) {
  return (
    <MapContainer center={value ? [value.lat, value.lng] : MOCOA_CENTER} zoom={14} className="map map-picker">
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
      <ClickHandler onPick={onChange} />
      {value && (
        <CircleMarker
          center={[value.lat, value.lng]}
          radius={10}
          pathOptions={{ color: '#1b4332', fillColor: '#52b788', fillOpacity: 0.9 }}
        />
      )}
    </MapContainer>
  );
}

/** Mapa de reportes (GeoJSON del servicio de geolocalización). */
export function ReportsMap({ features, linkToDetail = false }: { features: MapFeature[]; linkToDetail?: boolean }) {
  return (
    <MapContainer center={MOCOA_CENTER} zoom={13} className="map">
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
      {features.map((f) => {
        const [lng, lat] = f.geometry.coordinates;
        const color = categoryColor(f.properties.category);
        return (
          <CircleMarker
            key={f.properties.reportId}
            center={[lat, lng]}
            radius={9}
            pathOptions={{ color, fillColor: color, fillOpacity: f.properties.status === 'RESUELTO' ? 0.35 : 0.85 }}
          >
            <Popup>
              <strong>{f.properties.title}</strong>
              <br />
              {categoryLabel(f.properties.category)} · {statusLabel(f.properties.status)}
              <br />
              {f.properties.municipality}
              {linkToDetail && (
                <>
                  <br />
                  <Link to={`/reportes/${f.properties.reportId}`}>Ver detalle</Link>
                </>
              )}
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
