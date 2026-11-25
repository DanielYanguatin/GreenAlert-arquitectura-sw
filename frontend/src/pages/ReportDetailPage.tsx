import { type FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { fetchBlobUrl } from '../api/client';
import { evidencesApi, reportsApi, usersApi } from '../api/endpoints';
import type { Evidence, HistoryEntry, ReportDetail, User } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ReportsMap } from '../components/Maps';
import { Alert, CategoryTag, Empty, Loading, StatusBadge, useAsync } from '../components/ui';
import { categoryLabel, formatDate, isStaff, type ReportStatus, ROLE_LABELS, statusLabel } from '../domain/labels';
import { field } from '../components/forms';

const ACTION_LABELS: Record<string, string> = {
  CREATED: 'Reporte creado',
  STATUS_CHANGED: 'Cambio de estado',
  ASSIGNED: 'Asignación de responsable',
  UPDATED: 'Actualización',
  CATEGORY_CHANGED: 'Cambio de categoría',
  AI_SUGGESTION: 'Sugerencia automática',
};

export function describeHistory(h: HistoryEntry): string {
  if (h.action === 'STATUS_CHANGED') return `${statusLabel(h.fromValue ?? '')} → ${statusLabel(h.toValue ?? '')}`;
  if (h.action === 'CATEGORY_CHANGED') return `${categoryLabel(h.fromValue)} → ${categoryLabel(h.toValue)}`;
  if (h.action === 'AI_SUGGESTION') return `Categoría sugerida: ${categoryLabel(h.toValue)}`;
  return '';
}

function EvidenceGallery({ evidences }: { evidences: Evidence[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    void Promise.all(
      evidences.map(async (e) => {
        try {
          const url = await fetchBlobUrl(evidencesApi.filePath(e.id));
          created.push(url);
          return [e.id, url] as const;
        } catch {
          return [e.id, ''] as const;
        }
      }),
    ).then((pairs) => {
      if (!cancelled) setUrls(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [evidences]);

  if (evidences.length === 0) return <Empty>Sin fotografías adjuntas.</Empty>;
  return (
    <div className="gallery">
      {evidences.map((e) =>
        urls[e.id] ? (
          <a key={e.id} href={urls[e.id]} target="_blank" rel="noreferrer">
            <img src={urls[e.id]} alt={`Evidencia ${e.originalName}`} loading="lazy" />
          </a>
        ) : (
          <div key={e.id} className="gallery-placeholder">
            {e.originalName}
          </div>
        ),
      )}
    </div>
  );
}

function StaffActions({ report, onChanged }: { report: ReportDetail; onChanged: () => void }) {
  const { user } = useAuth();
  const [error, setError] = useState<string>();
  const [staff, setStaff] = useState<User[]>([]);
  const canAssign = user?.role === 'ADMIN' || user?.role === 'GESTOR_AMBIENTAL';

  useEffect(() => {
    if (canAssign)
      usersApi
        .staff()
        .then(setStaff)
        .catch(() => setStaff([]));
  }, [canAssign]);

  const run = async (action: () => Promise<unknown>) => {
    setError(undefined);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onStatus = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void run(() => reportsApi.changeStatus(report.id, field(form, 'status') as ReportStatus, field(form, 'comment')));
  };

  return (
    <div className="card">
      <h2>Gestión institucional</h2>
      {error && <Alert>{error}</Alert>}
      {report.allowedTransitions.length > 0 ? (
        <form className="form" onSubmit={onStatus}>
          <label>
            Nuevo estado
            <select name="status" required>
              {report.allowedTransitions.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Comentario para el ciudadano (obligatorio al resolver o rechazar)
            <textarea name="comment" maxLength={500} rows={2} />
          </label>
          <button className="btn btn-primary">Cambiar estado</button>
        </form>
      ) : (
        <p className="muted">El reporte está cerrado.</p>
      )}

      {canAssign && report.allowedTransitions.length > 0 && (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            const id = field(new FormData(e.currentTarget), 'assignee');
            void run(() => reportsApi.assign(report.id, id));
          }}
        >
          <label>
            Responsable
            <select name="assignee" defaultValue={report.assignedTo ?? ''} required>
              <option value="" disabled>
                Seleccione…
              </option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} · {ROLE_LABELS[s.role]}
                  {s.entity ? ` (${s.entity})` : ''}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-ghost">Asignar</button>
        </form>
      )}

      {report.aiSuggestedCategory &&
        report.aiSuggestedCategory !== report.category &&
        report.aiSuggestedCategory !== 'SIN_DETERMINAR' && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void run(() => reportsApi.update(report.id, { category: report.aiSuggestedCategory! }))}
          >
            Aceptar categoría sugerida: {categoryLabel(report.aiSuggestedCategory)}
          </button>
        )}
    </div>
  );
}

export function ReportDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const state = location.state as { created?: boolean; notice?: string } | null;
  const [analysisMsg, setAnalysisMsg] = useState<string>();

  const report = useAsync(() => reportsApi.get(id), [id]);
  const history = useAsync(() => reportsApi.history(id), [id, report.data?.updatedAt]);
  const evidences = useAsync(() => evidencesApi.list(id), [id]);

  if (report.loading && !report.data) return <Loading />;
  if (report.error || !report.data) {
    return (
      <section className="container section">
        <Alert>{report.error ?? 'Reporte no encontrado'}</Alert>
        <Link to="/mis-reportes">Volver</Link>
      </section>
    );
  }
  const r = report.data;
  const staff = isStaff(user?.role);

  const onObservation = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    await reportsApi.observe(r.id, field(new FormData(formEl), 'text'));
    formEl.reset();
    report.reload();
  };

  const requestAnalysis = async () => {
    setAnalysisMsg(undefined);
    try {
      const res = await reportsApi.analyze(r.id);
      setAnalysisMsg(res.aiStatus === 'UNAVAILABLE' ? res.reason : undefined);
      report.reload();
    } catch (err) {
      setAnalysisMsg((err as Error).message);
    }
  };

  return (
    <section className="container section">
      {state?.created && (
        <Alert kind="success">¡Reporte registrado! Te avisaremos por correo cuando cambie su estado.</Alert>
      )}
      {state?.notice === 'analysis-unavailable' && (
        <Alert kind="info">
          El análisis automático no está disponible ahora; un funcionario clasificará tu reporte.
        </Alert>
      )}
      {state?.notice?.startsWith('evidence-error') && (
        <Alert kind="warning">
          El reporte quedó registrado, pero hubo un problema con las fotografías: {state.notice.slice(15)}
        </Alert>
      )}

      <div className="row-between">
        <h1>{r.title}</h1>
        <StatusBadge status={r.status} />
      </div>
      <p className="meta">
        <CategoryTag category={r.category} /> · {r.municipalityName ?? 'Ubicación en validación'} ·{' '}
        {formatDate(r.createdAt)}
        {r.locationStatus === 'OUT_OF_COVERAGE' && <strong> · Ubicación fuera de cobertura</strong>}
      </p>

      <div className="grid-2">
        <div>
          <div className="card">
            <h2>Descripción</h2>
            <p className="pre">{r.description}</p>
            {r.address && <p className="muted">Referencia: {r.address}</p>}
          </div>
          <div className="card">
            <h2>Evidencias</h2>
            {evidences.error ? (
              <Alert kind="warning">Las evidencias no están disponibles en este momento.</Alert>
            ) : (
              <EvidenceGallery evidences={evidences.data ?? []} />
            )}
          </div>
          <div className="card">
            <h2>Clasificación sugerida</h2>
            {r.aiStatus === 'COMPLETED' && r.aiSuggestedCategory ? (
              <p>
                <strong>{categoryLabel(r.aiSuggestedCategory)}</strong> (puntuación {r.aiConfidence?.toFixed(2)}). Es
                una recomendación automática de prueba que revisa un funcionario.
              </p>
            ) : (
              <p className="muted">
                {r.aiStatus === 'UNAVAILABLE' ? 'El análisis no estuvo disponible.' : 'Sin análisis.'}
              </p>
            )}
            {(evidences.data?.length ?? 0) > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void requestAnalysis()}>
                Solicitar análisis
              </button>
            )}
            {analysisMsg && <Alert kind="info">{analysisMsg}</Alert>}
          </div>
        </div>
        <div>
          {staff && <StaffActions report={r} onChanged={report.reload} />}
          <div className="card">
            <h2>Ubicación</h2>
            <ReportsMap
              features={[
                {
                  type: 'Feature',
                  geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] },
                  properties: {
                    reportId: r.id,
                    title: r.title,
                    category: r.category,
                    status: r.status,
                    municipality: r.municipalityName ?? '',
                    reportedAt: r.createdAt,
                  },
                },
              ]}
            />
          </div>
          <div className="card">
            <h2>Seguimiento</h2>
            <ol className="timeline">
              {history.data?.map((h) => (
                <li key={h.id}>
                  <strong>{ACTION_LABELS[h.action] ?? h.action}</strong> {describeHistory(h)}
                  {h.comment && <p className="pre">{h.comment}</p>}
                  <small className="muted">{formatDate(h.createdAt)}</small>
                </li>
              ))}
            </ol>
          </div>
          <div className="card">
            <h2>Observaciones</h2>
            {r.observations.length === 0 && <Empty>Sin observaciones.</Empty>}
            <ul className="list">
              {r.observations.map((o) => (
                <li key={o.id}>
                  <p className="pre">{o.text}</p>
                  <small className="muted">
                    {ROLE_LABELS[o.authorRole]} · {formatDate(o.createdAt)}
                  </small>
                </li>
              ))}
            </ul>
            <form className="form" onSubmit={(e) => void onObservation(e)}>
              <label>
                Agregar observación
                <textarea name="text" required maxLength={2000} rows={2} />
              </label>
              <button className="btn btn-ghost btn-sm">Agregar</button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
