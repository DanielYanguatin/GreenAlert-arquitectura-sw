import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { geoApi, healthApi, reportsApi } from '../../api/endpoints';
import { ReportsMap } from '../../components/Maps';
import { Alert, CategoryTag, Empty, Loading, Pagination, StatusBadge, useAsync } from '../../components/ui';
import { CATEGORIES, categoryColor, categoryLabel, formatDate, STATUSES, statusTone } from '../../domain/labels';

function BarList({
  data,
  color,
  label,
}: {
  data: Record<string, number>;
  color: (k: string) => string;
  label: (k: string) => string;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (entries.length === 0) return <Empty>Sin datos todavía.</Empty>;
  return (
    <ul className="bars">
      {entries.map(([k, v]) => (
        <li key={k}>
          <span className="bar-label">{label(k)}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(v / max) * 100}%`, background: color(k) }} />
          </span>
          <span className="bar-value">{v}</span>
        </li>
      ))}
    </ul>
  );
}

export function DashboardPage() {
  const stats = useAsync(() => reportsApi.stats(), []);
  const health = useAsync(() => healthApi.platform(), []);
  const map = useAsync(() => geoApi.geojson(), []);

  return (
    <section className="container section">
      <h1>Panel institucional</h1>
      {health.data?.status === 'degraded' && (
        <Alert kind="warning">
          Servicios con problemas:{' '}
          {Object.entries(health.data.services)
            .filter(([, s]) => s === 'down')
            .map(([n]) => n)
            .join(', ')}
          . La plataforma sigue operando en modo degradado.
        </Alert>
      )}
      {stats.error && <Alert>{stats.error}</Alert>}
      {stats.loading && !stats.data && <Loading />}
      {stats.data && (
        <>
          <div className="kpis">
            <div className="kpi">
              <span className="kpi-value">{stats.data.total}</span>
              <span className="kpi-label">Reportes totales</span>
            </div>
            {STATUSES.map((s) => (
              <Link key={s.code} to={`/panel/reportes?status=${s.code}`} className={`kpi kpi-${s.tone}`}>
                <span className="kpi-value">{stats.data?.byStatus[s.code] ?? 0}</span>
                <span className="kpi-label">{s.label}</span>
              </Link>
            ))}
          </div>
          <div className="grid-2">
            <div className="card">
              <h2>Por categoría</h2>
              <BarList data={stats.data.byCategory} color={categoryColor} label={categoryLabel} />
            </div>
            <div className="card">
              <h2>Por municipio</h2>
              <BarList
                data={stats.data.byMunicipality}
                color={() => '#40916c'}
                label={(k) => (k === 'SIN_VALIDAR' ? 'Ubicación en validación' : k)}
              />
            </div>
          </div>
        </>
      )}
      <div className="card">
        <div className="row-between">
          <h2>Mapa de reportes</h2>
          <Link to="/panel/reportes">Gestionar reportes →</Link>
        </div>
        {map.error ? (
          <Alert kind="warning">El mapa no está disponible en este momento.</Alert>
        ) : (
          <ReportsMap features={map.data?.features ?? []} linkToDetail />
        )}
      </div>
    </section>
  );
}

export function ReportsManagementPage() {
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const status = params.get('status') ?? '';
  const category = params.get('category') ?? '';
  const assignedTo = params.get('assignedTo') ?? '';
  const { data, error, loading } = useAsync(
    () => reportsApi.list({ page, status, category, assignedTo, limit: 15 }),
    [page, status, category, assignedTo],
  );

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
    setPage(1);
  };

  return (
    <section className="container section">
      <h1>Gestión de reportes</h1>
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={!status}
          className={!status ? 'tab active' : 'tab'}
          onClick={() => setFilter('status', '')}
        >
          Todos
        </button>
        {STATUSES.map((s) => (
          <button
            key={s.code}
            type="button"
            role="tab"
            aria-selected={status === s.code}
            className={status === s.code ? `tab active tab-${statusTone(s.code)}` : 'tab'}
            onClick={() => setFilter('status', s.code)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="filters">
        <select aria-label="Categoría" value={category} onChange={(e) => setFilter('category', e.target.value)}>
          <option value="">Todas las categorías</option>
          {CATEGORIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={assignedTo === 'me'}
            onChange={(e) => setFilter('assignedTo', e.target.checked ? 'me' : '')}
          />
          Solo asignados a mí
        </label>
      </div>
      {error && <Alert>{error}</Alert>}
      {loading && !data && <Loading />}
      {data && data.items.length === 0 && <Empty>No hay reportes con estos filtros.</Empty>}
      {data && data.items.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Reporte</th>
                <th>Categoría</th>
                <th>Municipio</th>
                <th>Sugerencia IA</th>
                <th>Fecha</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/reportes/${r.id}`}>{r.title}</Link>
                    {r.assignedTo && <small className="muted"> · asignado</small>}
                  </td>
                  <td>
                    <CategoryTag category={r.category} />
                  </td>
                  <td>{r.municipalityName ?? '—'}</td>
                  <td>{r.aiSuggestedCategory ? categoryLabel(r.aiSuggestedCategory) : '—'}</td>
                  <td>{formatDate(r.createdAt)}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.page} limit={data.limit} total={data.total} onChange={setPage} />}
    </section>
  );
}
