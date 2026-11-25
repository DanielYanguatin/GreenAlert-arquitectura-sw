import { useState } from 'react';
import { usersApi } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthContext';
import { Alert, Loading, Pagination, useAsync } from '../../components/ui';
import { formatDate, type Role, ROLE_LABELS } from '../../domain/labels';
import { field } from '../../components/forms';

const ENTITIES = [
  ['', 'Sin entidad'],
  ['CORPOAMAZONIA', 'Corpoamazonia'],
  ['ALCALDIA_MOCOA', 'Alcaldía de Mocoa'],
  ['GOBERNACION_PUTUMAYO', 'Gobernación del Putumayo'],
  ['PARQUES_NACIONALES', 'Parques Nacionales Naturales'],
  ['MINAMBIENTE', 'Ministerio de Ambiente'],
] as const;

export function UsersPage() {
  const { user: me } = useAuth();
  const [page, setPage] = useState(1);
  const [role, setRole] = useState<Role | ''>('');
  const [error, setError] = useState<string>();
  const { data, loading, reload } = useAsync(() => usersApi.list(page, role || undefined), [page, role]);

  const run = async (action: () => Promise<unknown>) => {
    setError(undefined);
    try {
      await action();
      reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section className="container section">
      <h1>Gestión de usuarios</h1>
      <div className="filters">
        <select
          aria-label="Rol"
          value={role}
          onChange={(e) => {
            setRole(e.target.value as Role | '');
            setPage(1);
          }}
        >
          <option value="">Todos los roles</option>
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      {error && <Alert>{error}</Alert>}
      {loading && !data && <Loading />}
      {data && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol y entidad</th>
                <th>Registro</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.fullName}</strong>
                    <br />
                    <small className="muted">{u.email}</small>
                  </td>
                  <td>
                    <form
                      className="inline-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void run(() => usersApi.changeRole(u.id, field(f, 'role') as Role, field(f, 'entity')));
                      }}
                    >
                      <select
                        name="role"
                        defaultValue={u.role}
                        aria-label={`Rol de ${u.fullName}`}
                        disabled={u.id === me?.id}
                      >
                        {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                      <select
                        name="entity"
                        defaultValue={u.entity ?? ''}
                        aria-label={`Entidad de ${u.fullName}`}
                        disabled={u.id === me?.id}
                      >
                        {ENTITIES.map(([code, label]) => (
                          <option key={code} value={code}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <button className="btn btn-ghost btn-sm" disabled={u.id === me?.id}>
                        Guardar
                      </button>
                    </form>
                  </td>
                  <td>{formatDate(u.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className={`btn btn-sm ${u.active ? 'btn-ghost' : 'btn-primary'}`}
                      disabled={u.id === me?.id}
                      onClick={() => void run(() => usersApi.changeStatus(u.id, !u.active))}
                    >
                      {u.active ? 'Desactivar' : 'Activar'}
                    </button>
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
