import type { ReportStatus, Role } from '../domain/labels';

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  entity: string | null;
  active: boolean;
  createdAt: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: User;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface Report {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: string;
  status: ReportStatus;
  latitude: number;
  longitude: number;
  address: string | null;
  municipalityCode: string | null;
  municipalityName: string | null;
  locationStatus: 'VALIDATED' | 'PENDING' | 'OUT_OF_COVERAGE';
  assignedTo: string | null;
  aiStatus: 'NOT_REQUESTED' | 'COMPLETED' | 'UNAVAILABLE';
  aiSuggestedCategory: string | null;
  aiConfidence: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Observation {
  id: string;
  authorId: string;
  authorRole: Role;
  text: string;
  createdAt: string;
}

export interface ReportDetail extends Report {
  allowedTransitions: ReportStatus[];
  observations: Observation[];
}

export interface HistoryEntry {
  id: string;
  action: string;
  fromValue: string | null;
  toValue: string | null;
  changedBy: string;
  comment: string | null;
  createdAt: string;
}

export interface Evidence {
  id: string;
  reportId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface AnalysisResult {
  aiStatus: 'COMPLETED' | 'UNAVAILABLE';
  suggestedCategory: string | null;
  confidence: number | null;
  requiresReview: boolean;
  provider?: string;
  reason?: string;
}

export interface ReportStats {
  total: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  byMunicipality: Record<string, number>;
}

export interface Municipality {
  code: string;
  name: string;
  department: string;
  enabled: boolean;
  centerLat: number | null;
  centerLng: number | null;
}

export interface MapFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    reportId: string;
    title: string;
    category: string;
    status: ReportStatus;
    municipality: string;
    reportedAt: string;
  };
}

export interface FeatureCollection {
  type: 'FeatureCollection';
  features: MapFeature[];
}

export interface AppNotification {
  id: string;
  type: string;
  subject: string;
  body: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  read: boolean;
  createdAt: string;
}

export interface PlatformHealth {
  status: 'ok' | 'degraded';
  services: Record<string, 'up' | 'down'>;
}
