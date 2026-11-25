import { type ReactNode, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isStaff, ROLE_LABELS } from '../domain/labels';

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const onLogout = async () => {
    close();
    await logout().catch(() => undefined);
    await navigate('/');
  };

  return (
    <div className="app">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="header">
        <div className="container header-inner">
          <Link to="/" className="brand" onClick={close}>
            <img src="/favicon.svg" alt="" width={32} height={32} />
            <span>
              Green<strong>Alert</strong>
            </span>
          </Link>
          <button
            type="button"
            className="menu-toggle"
            aria-expanded={open}
            aria-controls="nav-principal"
            onClick={() => setOpen((o) => !o)}
          >
            ☰ <span className="sr-only">Menú</span>
          </button>
          <nav id="nav-principal" className={`nav ${open ? 'nav-open' : ''}`} aria-label="Principal">
            <NavLink to="/mapa" onClick={close}>
              Mapa
            </NavLink>
            <NavLink to="/acerca" onClick={close}>
              Acerca de
            </NavLink>
            {user && (
              <>
                <NavLink to="/mis-reportes" onClick={close}>
                  Mis reportes
                </NavLink>
                <NavLink to="/reportes/nuevo" className="nav-cta" onClick={close}>
                  + Reportar
                </NavLink>
              </>
            )}
            {isStaff(user?.role) && (
              <NavLink to="/panel" onClick={close}>
                Panel institucional
              </NavLink>
            )}
            {user?.role === 'ADMIN' && (
              <NavLink to="/admin/usuarios" onClick={close}>
                Usuarios
              </NavLink>
            )}
            {user ? (
              <div className="nav-user">
                <NavLink to="/perfil" onClick={close} title={ROLE_LABELS[user.role]}>
                  {user.fullName.split(' ')[0]}
                </NavLink>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onLogout()}>
                  Salir
                </button>
              </div>
            ) : (
              <>
                <NavLink to="/ingresar" onClick={close}>
                  Ingresar
                </NavLink>
                <NavLink to="/registro" className="nav-cta" onClick={close}>
                  Crear cuenta
                </NavLink>
              </>
            )}
          </nav>
        </div>
      </header>
      <main id="contenido" className="main">
        {children}
      </main>
      <footer className="footer">
        <div className="container">
          <p>
            GreenAlert · Monitoreo ambiental ciudadano de Mocoa y el Putumayo. Proyecto académico: no existe integración
            oficial con entidades ambientales.
          </p>
        </div>
      </footer>
    </div>
  );
}
