import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalHttpClient } from '../common/http-client';

export const REPORTS_CLIENT = Symbol('REPORTS_CLIENT');

export interface ReportAccess {
  id: string;
  ownerId: string;
  status: string;
}

export interface ReportsPort {
  getAccess(reportId: string): Promise<ReportAccess>;
}

@Injectable()
export class HttpReportsClient implements ReportsPort {
  private readonly http: InternalHttpClient;

  constructor(config: ConfigService) {
    this.http = new InternalHttpClient({
      baseUrl: config.get<string>('REPORTS_SERVICE_URL') ?? 'http://reports:3002',
      internalApiKey: config.getOrThrow<string>('INTERNAL_API_KEY'),
      timeoutMs: Number(config.get('HTTP_TIMEOUT_MS') ?? 3000),
    });
  }

  getAccess(reportId: string): Promise<ReportAccess> {
    return this.http.request<ReportAccess>('GET', `/internal/reports/${encodeURIComponent(reportId)}/access`);
  }
}
