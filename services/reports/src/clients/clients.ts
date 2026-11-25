import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalHttpClient } from '../common/http-client';

/* Puertos (interfaces) hacia otros microservicios. Se inyectan por token para sustituirlos en pruebas. */

export const GEOLOCATION_CLIENT = Symbol('GEOLOCATION_CLIENT');
export const NOTIFICATIONS_CLIENT = Symbol('NOTIFICATIONS_CLIENT');
export const MULTIMEDIA_CLIENT = Symbol('MULTIMEDIA_CLIENT');
export const AI_CLIENT = Symbol('AI_CLIENT');
export const USERS_CLIENT = Symbol('USERS_CLIENT');

export interface ResolvedLocation {
  municipalityCode: string;
  municipalityName: string;
}

export interface LocationProjection {
  latitude: number;
  longitude: number;
  category: string;
  status: string;
  title: string;
  reportedAt: string;
}

export interface GeolocationPort {
  validate(latitude: number, longitude: number): Promise<ResolvedLocation>;
  upsert(reportId: string, data: LocationProjection): Promise<ResolvedLocation>;
}

export interface NotificationRequest {
  type: string;
  recipientUserId?: string;
  recipientRoles?: string[];
  data: Record<string, unknown>;
}

export interface NotificationsPort {
  send(request: NotificationRequest): Promise<void>;
}

export interface EvidenceRef {
  id: string;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
}

export interface MultimediaPort {
  listByReport(reportId: string): Promise<EvidenceRef[]>;
}

export interface ClassificationResult {
  id: string;
  suggestedCategory: string;
  confidence: number;
  provider: string;
  modelVersion: string;
  requiresReview: boolean;
}

export interface AiPort {
  classify(input: {
    reportId: string;
    text: string;
    evidences: { id: string; url: string; mimeType: string; originalName: string }[];
  }): Promise<ClassificationResult>;
}

export interface UserRef {
  id: string;
  role: string;
  active: boolean;
  fullName: string;
}

export interface UsersPort {
  findById(id: string): Promise<UserRef>;
}

function client(config: ConfigService, urlKey: string, fallback: string): InternalHttpClient {
  return new InternalHttpClient({
    baseUrl: config.get<string>(urlKey) ?? fallback,
    internalApiKey: config.getOrThrow<string>('INTERNAL_API_KEY'),
    timeoutMs: Number(config.get('HTTP_TIMEOUT_MS') ?? 3000),
  });
}

@Injectable()
export class HttpGeolocationClient implements GeolocationPort {
  private readonly http: InternalHttpClient;
  constructor(config: ConfigService) {
    this.http = client(config, 'GEOLOCATION_SERVICE_URL', 'http://geolocation:3004');
  }
  validate(latitude: number, longitude: number): Promise<ResolvedLocation> {
    return this.http.request<ResolvedLocation>('POST', '/internal/locations/validate', { latitude, longitude });
  }
  upsert(reportId: string, data: LocationProjection): Promise<ResolvedLocation> {
    return this.http.request<ResolvedLocation>('PUT', `/internal/locations/${reportId}`, data);
  }
}

@Injectable()
export class HttpNotificationsClient implements NotificationsPort {
  private readonly http: InternalHttpClient;
  constructor(config: ConfigService) {
    this.http = client(config, 'NOTIFICATIONS_SERVICE_URL', 'http://notifications:3006');
  }
  async send(request: NotificationRequest): Promise<void> {
    await this.http.request('POST', '/internal/notifications', request);
  }
}

@Injectable()
export class HttpMultimediaClient implements MultimediaPort {
  private readonly http: InternalHttpClient;
  constructor(config: ConfigService) {
    this.http = client(config, 'MULTIMEDIA_SERVICE_URL', 'http://multimedia:3003');
  }
  listByReport(reportId: string): Promise<EvidenceRef[]> {
    return this.http.request<EvidenceRef[]>('GET', `/internal/evidences?reportId=${encodeURIComponent(reportId)}`);
  }
}

@Injectable()
export class HttpAiClient implements AiPort {
  private readonly http: InternalHttpClient;
  constructor(config: ConfigService) {
    this.http = client(config, 'AI_SERVICE_URL', 'http://ai:3005');
  }
  classify(input: Parameters<AiPort['classify']>[0]): Promise<ClassificationResult> {
    return this.http.request<ClassificationResult>('POST', '/internal/classifications', input);
  }
}

@Injectable()
export class HttpUsersClient implements UsersPort {
  private readonly http: InternalHttpClient;
  constructor(config: ConfigService) {
    this.http = client(config, 'USERS_SERVICE_URL', 'http://users:3001');
  }
  findById(id: string): Promise<UserRef> {
    return this.http.request<UserRef>('GET', `/internal/users/${encodeURIComponent(id)}`);
  }
}
