import { type FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authApi, geoApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { ReportsMap } from '../components/Maps';
import { Alert, Loading, useAsync } from '../components/ui';
import { CATEGORIES, isStaff, STATUSES } from '../domain/labels';
import { field } from '../components/forms';

export function HomePage() {
  const { user } = useAuth();
  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <div>
            <h1>Cuidemos juntos la Amazonía andina</h1>
            <p className="lead">
              Reporta basuras, quemas, vertimientos, deforestación o minería ilegal en Mocoa. Tu reporte llega a las
              autoridades con ubicación y fotografías, y puedes seguir su gestión paso a paso.
            </p>
            <div className="actions">
              <Link className="btn btn-primary btn-lg" to={user ? '/reportes/nuevo' : '/registro'}>
                {user ? 'Crear un reporte' : 'Crear cuenta y reportar'}
              </Link>
              <Link className="btn btn-light btn-lg" to="/mapa">
                Ver mapa de reportes
              </Link>
            </div>
          </div>
        </div>
      </section>
      <section className="container section">
        <h2>¿Cómo funciona?</h2>
        <ol className="steps">
          <li>
            <strong>Reporta</strong> el problema: describe qué ocurre y marca el lugar en el mapa.
          </li>
          <li>
            <strong>Adjunta fotografías</strong> como evidencia (JPEG, PNG o WEBP).
          </li>
          <li>
            <strong>Recibe avisos</strong> por correo cuando tu reporte cambie de estado.
          </li>
          <li>
            <strong>Las autoridades gestionan</strong> el caso: revisión, asignación y solución.
          </li>
        </ol>
        <h2>Problemáticas que puedes reportar</h2>
        <ul className="chips">
          {CATEGORIES.map((c) => (
            <li key={c.code} className="chip">
              <span className="dot" style={{ background: c.color }} aria-hidden="true" /> {c.label}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export function AboutPage() {
  return (
    <section className="container section prose">
      <h1>Acerca de GreenAlert</h1>
      <p>
        GreenAlert es una plataforma de monitoreo ambiental ciudadano orientada inicialmente al municipio de Mocoa y
        preparada para ampliarse al departamento del Putumayo.
      </p>
      <h2>Entidades contempladas</h2>
      <p>
        La plataforma está diseñada para que funcionarios de Corpoamazonia, la Alcaldía de Mocoa, la Gobernación del
        Putumayo, Parques Nacionales Naturales y el Ministerio de Ambiente gestionen reportes.{' '}
        <strong>Actualmente no existe una integración oficial</strong> con estas entidades.
      </p>
      <h2>Sobre la clasificación automática</h2>
      <p>
        Cuando adjuntas fotografías, el sistema puede sugerir una categoría. Hoy esa sugerencia la produce un{' '}
        <strong>servicio de prueba basado en palabras clave, no un modelo de inteligencia artificial entrenado</strong>.
        Siempre es una recomendación que revisa un funcionario.
      </p>
      <h2>Privacidad</h2>
      <p>
        El mapa público muestra la ubicación, la categoría y el estado de los reportes, pero nunca la identidad de quien
        reporta.
      </p>
    </section>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(undefined);
    try {
      const user = await login(field(form, 'email'), field(form, 'password'));
      const from = (location.state as { from?: string } | null)?.from;
      await navigate(from ?? (isStaff(user.role) ? '/panel' : '/mis-reportes'), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible iniciar sesión');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="container narrow section">
      <h1>Ingresar</h1>
      {error && <Alert>{error}</Alert>}
      <form className="card form" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Correo electrónico
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Contraseña
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Ingresando…' : 'Ingresar'}
        </button>
        <p>
          ¿No tienes cuenta? <Link to="/registro">Regístrate</Link>
        </p>
      </form>
    </section>
  );
}

export function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = field(form, 'password');
    if (password !== field(form, 'confirm')) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const email = field(form, 'email');
      const phone = field(form, 'phone').trim();
      await authApi.register({ email, password, fullName: field(form, 'fullName'), phone: phone || undefined });
      await login(email, password);
      await navigate('/reportes/nuevo', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible crear la cuenta');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="container narrow section">
      <h1>Crear cuenta</h1>
      {error && <Alert>{error}</Alert>}
      <form className="card form" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Nombre completo
          <input name="fullName" minLength={3} maxLength={120} autoComplete="name" required />
        </label>
        <label>
          Correo electrónico
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Teléfono (opcional)
          <input name="phone" type="tel" pattern="\+?\d{7,15}" autoComplete="tel" />
        </label>
        <label>
          Contraseña
          <input
            name="password"
            type="password"
            minLength={8}
            maxLength={72}
            pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}"
            title="Mínimo 8 caracteres con mayúscula, minúscula y número"
            autoComplete="new-password"
            required
          />
          <small>Mínimo 8 caracteres, con mayúscula, minúscula y número.</small>
        </label>
        <label>
          Confirmar contraseña
          <input name="confirm" type="password" autoComplete="new-password" required />
        </label>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>
    </section>
  );
}

export function PublicMapPage() {
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const { data, error, loading } = useAsync(() => geoApi.geojson({ category, status }), [category, status]);
  return (
    <section className="container section">
      <h1>Mapa de reportes ambientales</h1>
      <div className="filters">
        <select aria-label="Categoría" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Todas las categorías</option>
          {CATEGORIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        <select aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          {STATUSES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
            </option>
          ))}
        </select>
        {data && <span className="muted">{data.features.length} reportes</span>}
      </div>
      {error && <Alert>{error}</Alert>}
      {loading && !data ? <Loading /> : <ReportsMap features={data?.features ?? []} />}
    </section>
  );
}
