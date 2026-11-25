import { type ReactNode, useEffect, useState } from 'react';
import { categoryColor, categoryLabel, statusLabel, statusTone } from '../domain/labels';

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${statusTone(status)}`}>{statusLabel(status)}</span>;
}

export function CategoryTag({ category }: { category: string }) {
  return (
    <span className="tag">
      <span className="dot" style={{ background: categoryColor(category) }} aria-hidden="true" />
      {categoryLabel(category)}
    </span>
  );
}

export function Alert({
  kind = 'error',
  children,
}: {
  kind?: 'error' | 'success' | 'info' | 'warning';
  children: ReactNode;
}) {
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" /> {label}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Pagination({
  page,
  limit,
  total,
  onChange,
}: {
  page: number;
  limit: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Paginación">
      <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ← Anterior
      </button>
      <span>
        Página {page} de {pages}
      </span>
      <button type="button" className="btn btn-ghost" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Siguiente →
      </button>
    </nav>
  );
}

/** Estado asíncrono genérico para cargar datos de la API con cancelación. */
export function useAsync<T>(loader: (signal: AbortSignal) => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: undefined }));
    loader(controller.signal)
      .then((data) => setState({ data, loading: false }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setState({ loading: false, error: e instanceof Error ? e.message : 'Error inesperado' });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- las dependencias las define quien llama
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}
