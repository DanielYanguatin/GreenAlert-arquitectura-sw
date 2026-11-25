import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../src/auth/AuthContext';
import { Layout } from '../src/components/Layout';
import { RequireAuth } from '../src/components/RequireAuth';
import { Pagination, StatusBadge } from '../src/components/ui';
import { validateFiles } from '../src/pages/CitizenPages';
import { describeHistory } from '../src/pages/ReportDetailPage';

jest.mock('../src/components/Maps', () => ({ ReportsMap: () => null, LocationPicker: () => null }));

function setSession(role: string) {
  sessionStorage.setItem(
    'greenalert.session',
    JSON.stringify({
      token: 't',
      expiresAt: Date.now() + 60_000,
      user: {
        id: 'u',
        email: 'a@b.co',
        fullName: 'Ana Gómez',
        role,
        phone: null,
        entity: null,
        active: true,
        createdAt: '',
      },
    }),
  );
}

function renderAt(path: string, element: ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/ingresar" element={<p>Pantalla de ingreso</p>} />
          <Route path="/" element={<p>Inicio</p>} />
          <Route path={path} element={element} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('componentes', () => {
  beforeEach(() => sessionStorage.clear());

  it('RequireAuth redirige a ingresar sin sesión', () => {
    renderAt(
      '/panel',
      <RequireAuth>
        <p>Privado</p>
      </RequireAuth>,
    );
    expect(screen.getByText('Pantalla de ingreso')).toBeInTheDocument();
  });

  it('RequireAuth respeta los roles', () => {
    setSession('CIUDADANO');
    renderAt(
      '/panel',
      <RequireAuth roles={['FUNCIONARIO']}>
        <p>Privado</p>
      </RequireAuth>,
    );
    expect(screen.getByText('Inicio')).toBeInTheDocument();
  });

  it('RequireAuth muestra el contenido al rol autorizado', () => {
    setSession('FUNCIONARIO');
    renderAt(
      '/panel',
      <RequireAuth roles={['FUNCIONARIO']}>
        <p>Privado</p>
      </RequireAuth>,
    );
    expect(screen.getByText('Privado')).toBeInTheDocument();
  });

  it('el menú muestra opciones según el rol', () => {
    setSession('ADMIN');
    renderAt(
      '/x',
      <Layout>
        <p>contenido</p>
      </Layout>,
    );
    expect(screen.getByText('Panel institucional')).toBeInTheDocument();
    expect(screen.getByText('Usuarios')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
  });

  it('el menú de visitante ofrece registro', () => {
    renderAt(
      '/x',
      <Layout>
        <p>contenido</p>
      </Layout>,
    );
    expect(screen.getByText('Crear cuenta')).toBeInTheDocument();
    expect(screen.queryByText('Panel institucional')).not.toBeInTheDocument();
  });

  it('StatusBadge y Pagination', () => {
    render(
      <>
        <StatusBadge status="RESUELTO" />
        <Pagination page={2} limit={10} total={35} onChange={() => undefined} />
      </>,
    );
    expect(screen.getByText('Resuelto')).toHaveClass('badge-success');
    expect(screen.getByText('Página 2 de 4')).toBeInTheDocument();
  });
});

describe('reglas de la interfaz', () => {
  const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type });

  it('valida las fotografías antes de enviarlas', () => {
    expect(validateFiles([file('a.jpg', 'image/jpeg')])).toBeNull();
    expect(validateFiles([file('a.gif', 'image/gif')])).toMatch('no es una imagen');
    expect(validateFiles(Array.from({ length: 6 }, (_, i) => file(String(i) + '.png', 'image/png')))).toMatch(
      'máximo 5',
    );
    expect(validateFiles([file('g.jpg', 'image/jpeg', 6 * 1024 * 1024)])).toMatch('supera 5 MB');
  });

  it('describe el historial del reporte', () => {
    const base = { id: '1', changedBy: 'u', comment: null, createdAt: '' };
    expect(describeHistory({ ...base, action: 'STATUS_CHANGED', fromValue: 'PENDIENTE', toValue: 'EN_REVISION' })).toBe(
      'Pendiente → En revisión',
    );
    expect(describeHistory({ ...base, action: 'AI_SUGGESTION', fromValue: null, toValue: 'BASURA' })).toBe(
      'Categoría sugerida: Basura y residuos sólidos',
    );
    expect(describeHistory({ ...base, action: 'CREATED', fromValue: null, toValue: null })).toBe('');
  });
});
