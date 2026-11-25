import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { evidencesApi, notificationsApi, reportsApi, usersApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { LocationPicker } from '../components/Maps';
import { Alert, CategoryTag, Empty, Loading, Pagination, StatusBadge, useAsync } from '../components/ui';
import { CATEGORIES, formatDate, ROLE_LABELS, STATUSES } from '../domain/labels';
import { field } from '../components/forms';

const MAX_FILES = 5;
const MAX_MB = 5;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

/** Validación previa en el navegador (comodidad); la validación real del tipo de archivo la hace multimedia. */
export function validateFiles(files: File[]): string | null {
  if (files.length > MAX_FILES) return `Puede adjuntar máximo ${MAX_FILES} fotografías`;
  for (const f of files) {
    if (!ACCEPTED.includes(f.type)) return `"${f.name}" no es una imagen JPEG, PNG o WEBP`;
    if (f.size > MAX_MB * 1024 * 1024) return `"${f.name}" supera ${MAX_MB} MB`;
  }
  return null;
}

export function NewReportPage() {
  const navigate = useNavigate();
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState<string>();

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Su navegador no permite obtener la ubicación; márquela en el mapa');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setError('No fue posible obtener su ubicación; márquela en el mapa'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(undefined);
    if (!point) {
      setError('Marque en el mapa el lugar del problema');
      return;
    }
    const fileError = validateFiles(files);
    if (fileError) {
      setError(fileError);
      return;
    }
    const form = new FormData(e.currentTarget);
    try {
      setProgress('Registrando reporte…');
      const report = await reportsApi.create({
        title: field(form, 'title'),
        description: field(form, 'description'),
        category: field(form, 'category'),
        latitude: Number(point.lat.toFixed(6)),
        longitude: Number(point.lng.toFixed(6)),
        address: field(form, 'address').trim() || undefined,
      });
      let notice = '';
      if (files.length > 0) {
        try {
          setProgress('Subiendo fotografías…');
          await evidencesApi.upload(report.id, files);
          setProgress('Solicitando análisis automático…');
          const analysis = await reportsApi.analyze(report.id);
          if (analysis.aiStatus === 'UNAVAILABLE') notice = 'analysis-unavailable';
        } catch (err) {
          // El reporte YA está registrado: un fallo en fotos o análisis no lo invalida.
          notice = `evidence-error:${err instanceof Error ? err.message : ''}`;
        }
      }
      await navigate(`/reportes/${report.id}`, { state: { created: true, notice } });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 422
          ? `${err.message}. Por ahora solo se atiende Mocoa.`
          : (err as Error).message,
      );
    } finally {
      setProgress(undefined);
    }
  };

  return (
    <section className="container section">
      <h1>Nuevo reporte ambiental</h1>
      {error && <Alert>{error}</Alert>}
      <form className="grid-2" onSubmit={(e) => void onSubmit(e)}>
        <div className="card form">
          <label>
            Título
            <input name="title" minLength={5} maxLength={120} required placeholder="Ej.: Basuras junto a la quebrada" />
          </label>
          <label>
            Categoría
            <select name="category" required defaultValue="">
              <option value="" disabled>
                Seleccione…
              </option>
              {CATEGORIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Descripción
            <textarea
              name="description"
              minLength={10}
              maxLength={2000}
              rows={5}
              required
              placeholder="¿Qué ocurre? ¿Desde cuándo? ¿Hay riesgo para personas o animales?"
            />
          </label>
          <label>
            Dirección o referencia (opcional)
            <input name="address" maxLength={200} placeholder="Barrio, vereda o punto de referencia" />
          </label>
          <label>
            Fotografías (hasta {MAX_FILES}, máx. {MAX_MB} MB c/u)
            <input
              type="file"
              accept={ACCEPTED.join(',')}
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </label>
          {files.length > 0 && <small>{files.length} archivo(s) seleccionados</small>}
          <button className="btn btn-primary" disabled={!!progress}>
            {progress ?? 'Enviar reporte'}
          </button>
        </div>
        <div className="card">
          <div className="row-between">
            <strong>Ubicación</strong>
            <button type="button" className="btn btn-ghost btn-sm" onClick={useMyLocation}>
              📍 Usar mi ubicación
            </button>
          </div>
          <p className="muted">Toque el mapa para marcar el punto exacto.</p>
          <LocationPicker value={point} onChange={(lat, lng) => setPoint({ lat, lng })} />
          {point && (
            <p className="muted">
              Lat {point.lat.toFixed(5)}, Lng {point.lng.toFixed(5)}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}

export function MyReportsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const { data, error, loading } = useAsync(() => reportsApi.mine({ page, status, limit: 10 }), [page, status]);
  return (
    <section className="container section">
      <div className="row-between">
        <h1>Mis reportes</h1>
        <Link className="btn btn-primary" to="/reportes/nuevo">
          + Nuevo reporte
        </Link>
      </div>
      <div className="filters">
        <select
          aria-label="Estado"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos los estados</option>
          {STATUSES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {error && <Alert>{error}</Alert>}
      {loading && !data && <Loading />}
      {data && data.items.length === 0 && <Empty>Aún no tienes reportes con este filtro.</Empty>}
      <ul className="list">
        {data?.items.map((r) => (
          <li key={r.id} className="card list-item">
            <div>
              <Link to={`/reportes/${r.id}`} className="list-title">
                {r.title}
              </Link>
              <div className="meta">
                <CategoryTag category={r.category} /> · {r.municipalityName ?? 'Ubicación en validación'} ·{' '}
                {formatDate(r.createdAt)}
              </div>
            </div>
            <StatusBadge status={r.status} />
          </li>
        ))}
      </ul>
      {data && <Pagination page={data.page} limit={data.limit} total={data.total} onChange={setPage} />}
    </section>
  );
}

export function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string }>();
  const [page, setPage] = useState(1);
  const notifications = useAsync(() => notificationsApi.mine(page), [page]);

  if (!user) return null;
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      const phone = field(form, 'phone').trim();
      updateUser(await usersApi.updateMe({ fullName: field(form, 'fullName'), phone: phone || undefined }));
      setMessage({ kind: 'success', text: 'Perfil actualizado' });
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message });
    }
  };

  return (
    <section className="container section grid-2">
      <div>
        <h1>Mi perfil</h1>
        {message && <Alert kind={message.kind}>{message.text}</Alert>}
        <form className="card form" onSubmit={(e) => void onSubmit(e)}>
          <p className="muted">
            {user.email} · {ROLE_LABELS[user.role]}
            {user.entity ? ` · ${user.entity}` : ''}
          </p>
          <label>
            Nombre completo
            <input name="fullName" defaultValue={user.fullName} minLength={3} maxLength={120} required />
          </label>
          <label>
            Teléfono
            <input name="phone" type="tel" defaultValue={user.phone ?? ''} pattern="\+?\d{7,15}" />
          </label>
          <button className="btn btn-primary">Guardar</button>
        </form>
      </div>
      <div>
        <h2>Mis notificaciones</h2>
        {notifications.error && <Alert kind="warning">Las notificaciones no están disponibles en este momento.</Alert>}
        {notifications.data?.items.length === 0 && <Empty>No tienes notificaciones.</Empty>}
        <ul className="list">
          {notifications.data?.items.map((n) => (
            <li key={n.id} className="card">
              <strong>{n.subject}</strong>
              <p className="pre">{n.body}</p>
              <small className="muted">
                {formatDate(n.createdAt)} ·{' '}
                {n.status === 'SENT'
                  ? 'Enviada por correo'
                  : n.status === 'PENDING'
                    ? 'En cola de envío'
                    : 'No se pudo enviar'}
              </small>
            </li>
          ))}
        </ul>
        {notifications.data && (
          <Pagination
            page={notifications.data.page}
            limit={notifications.data.limit}
            total={notifications.data.total}
            onChange={setPage}
          />
        )}
      </div>
    </section>
  );
}
