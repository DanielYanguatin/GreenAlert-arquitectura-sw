import type { ReportStatus, Role } from '../domain/labels';
import { api, query } from './client';
import type {
  AnalysisResult,
  AppNotification,
  Evidence,
  FeatureCollection,
  HistoryEntry,
  LoginResponse,
  Municipality,
  Observation,
  Page,
  PlatformHealth,
  Report,
  ReportDetail,
  ReportStats,
  User,
} from './types';

export interface ReportFilters {
  page?: number;
  limit?: number;
  status?: string;
  category?: string;
  municipality?: string;
  assignedTo?: string;
}

export interface NewReport {
  title: string;
  description: string;
  category: string;
  latitude: number;
  longitude: number;
  address?: string;
}

/** Todas las llamadas pasan por el gateway (/api). Agrupadas por microservicio propietario. */
export const authApi = {
  register: (data: { email: string; password: string; fullName: string; phone?: string }) =>
    api<User>('/auth/register', { method: 'POST', body: data }),
  login: (email: string, password: string) =>
    api<LoginResponse>('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
  me: () => api<User>('/auth/me'),
};

export const usersApi = {
  updateMe: (data: { fullName?: string; phone?: string }) => api<User>('/users/me', { method: 'PATCH', body: data }),
  list: (page = 1, role?: Role) => api<Page<User>>(`/users${query({ page, limit: 20, role })}`),
  staff: () => api<User[]>('/users/staff'),
  changeRole: (id: string, role: Role, entity?: string) =>
    api<User>(`/users/${id}/role`, { method: 'PATCH', body: { role, entity: entity || undefined } }),
  changeStatus: (id: string, active: boolean) =>
    api<User>(`/users/${id}/status`, { method: 'PATCH', body: { active } }),
};

export const reportsApi = {
  create: (data: NewReport) => api<Report>('/reports', { method: 'POST', body: data }),
  mine: (filters: ReportFilters = {}) => api<Page<Report>>(`/reports/mine${query({ ...filters })}`),
  list: (filters: ReportFilters = {}) => api<Page<Report>>(`/reports${query({ ...filters })}`),
  stats: () => api<ReportStats>('/reports/stats'),
  get: (id: string) => api<ReportDetail>(`/reports/${id}`),
  update: (id: string, data: Partial<Pick<Report, 'title' | 'description' | 'category'>>) =>
    api<Report>(`/reports/${id}`, { method: 'PATCH', body: data }),
  changeStatus: (id: string, status: ReportStatus, comment?: string) =>
    api<Report>(`/reports/${id}/status`, { method: 'PATCH', body: { status, comment: comment || undefined } }),
  assign: (id: string, assigneeId: string) =>
    api<Report>(`/reports/${id}/assignment`, { method: 'PATCH', body: { assigneeId } }),
  observe: (id: string, text: string) =>
    api<Observation>(`/reports/${id}/observations`, { method: 'POST', body: { text } }),
  history: (id: string) => api<HistoryEntry[]>(`/reports/${id}/history`),
  analyze: (id: string) => api<AnalysisResult>(`/reports/${id}/analysis`, { method: 'POST' }),
};

export const evidencesApi = {
  upload: (reportId: string, files: File[]) => {
    const form = new FormData();
    form.append('reportId', reportId);
    for (const f of files) form.append('files', f);
    return api<Evidence[]>('/evidences', { method: 'POST', form });
  },
  list: (reportId: string) => api<Evidence[]>(`/evidences${query({ reportId })}`),
  filePath: (id: string) => `/evidences/${id}/file`,
};

export const geoApi = {
  municipalities: () => api<Municipality[]>('/municipalities'),
  geojson: (filters: { category?: string; status?: string; municipality?: string } = {}) =>
    api<FeatureCollection>(`/locations/geojson${query(filters)}`),
};

export const notificationsApi = {
  mine: (page = 1) => api<Page<AppNotification>>(`/notifications/me${query({ page, limit: 10 })}`),
  markRead: (id: string) => api<void>(`/notifications/${id}/read`, { method: 'PATCH' }),
};

export const healthApi = {
  platform: () => api<PlatformHealth>('/health'),
};
