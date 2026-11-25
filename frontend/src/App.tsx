import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { STAFF_ROLES } from './domain/labels';
import { UsersPage } from './pages/admin/UsersPage';
import { MyReportsPage, NewReportPage, ProfilePage } from './pages/CitizenPages';
import { AboutPage, HomePage, LoginPage, PublicMapPage, RegisterPage } from './pages/PublicPages';
import { ReportDetailPage } from './pages/ReportDetailPage';
import { DashboardPage, ReportsManagementPage } from './pages/staff/StaffPages';

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/acerca" element={<AboutPage />} />
        <Route path="/mapa" element={<PublicMapPage />} />
        <Route path="/ingresar" element={<LoginPage />} />
        <Route path="/registro" element={<RegisterPage />} />
        <Route
          path="/mis-reportes"
          element={
            <RequireAuth>
              <MyReportsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/reportes/nuevo"
          element={
            <RequireAuth>
              <NewReportPage />
            </RequireAuth>
          }
        />
        <Route
          path="/reportes/:id"
          element={
            <RequireAuth>
              <ReportDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/perfil"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />
        <Route
          path="/panel"
          element={
            <RequireAuth roles={STAFF_ROLES}>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/panel/reportes"
          element={
            <RequireAuth roles={STAFF_ROLES}>
              <ReportsManagementPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/usuarios"
          element={
            <RequireAuth roles={['ADMIN']}>
              <UsersPage />
            </RequireAuth>
          }
        />
        <Route
          path="*"
          element={
            <section className="container section">
              <h1>Página no encontrada</h1>
            </section>
          }
        />
      </Routes>
    </Layout>
  );
}
