/** Etiquetas y colores de presentación (única fuente para toda la interfaz). */
export type ReportStatus = 'PENDIENTE' | 'EN_REVISION' | 'EN_PROCESO' | 'RESUELTO' | 'RECHAZADO';
export type Role = 'ADMIN' | 'CIUDADANO' | 'FUNCIONARIO' | 'GESTOR_AMBIENTAL';

export const CATEGORIES: { code: string; label: string; color: string }[] = [
  { code: 'BASURA', label: 'Basura y residuos sólidos', color: '#8d6e63' },
  { code: 'CONTAMINACION_HIDRICA', label: 'Contaminación hídrica', color: '#1e88e5' },
  { code: 'DEFORESTACION', label: 'Deforestación', color: '#2e7d32' },
  { code: 'HUMO_QUEMAS', label: 'Humo y quemas', color: '#e65100' },
  { code: 'VERTIMIENTOS', label: 'Vertimientos', color: '#6a1b9a' },
  { code: 'MINERIA_ILEGAL', label: 'Minería ilegal', color: '#f9a825' },
  { code: 'OTRO', label: 'Otra problemática', color: '#546e7a' },
];

export const STATUSES: { code: ReportStatus; label: string; tone: string }[] = [
  { code: 'PENDIENTE', label: 'Pendiente', tone: 'warning' },
  { code: 'EN_REVISION', label: 'En revisión', tone: 'info' },
  { code: 'EN_PROCESO', label: 'En proceso', tone: 'progress' },
  { code: 'RESUELTO', label: 'Resuelto', tone: 'success' },
  { code: 'RECHAZADO', label: 'Rechazado', tone: 'danger' },
];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  CIUDADANO: 'Ciudadano',
  FUNCIONARIO: 'Funcionario ambiental',
  GESTOR_AMBIENTAL: 'Gestor ambiental',
};

export const STAFF_ROLES: Role[] = ['ADMIN', 'FUNCIONARIO', 'GESTOR_AMBIENTAL'];

export const categoryLabel = (code: string | null | undefined): string =>
  CATEGORIES.find((c) => c.code === code)?.label ?? (code === 'SIN_DETERMINAR' ? 'Sin determinar' : (code ?? '—'));
export const categoryColor = (code: string): string => CATEGORIES.find((c) => c.code === code)?.color ?? '#546e7a';
export const statusLabel = (code: string): string => STATUSES.find((s) => s.code === code)?.label ?? code;
export const statusTone = (code: string): string => STATUSES.find((s) => s.code === code)?.tone ?? 'neutral';
export const isStaff = (role: Role | undefined): boolean => !!role && STAFF_ROLES.includes(role);

export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(new Date(value));
}

/** Centro aproximado del casco urbano de Mocoa (vista inicial de los mapas). */
export const MOCOA_CENTER: [number, number] = [1.148, -76.646];
