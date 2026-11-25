import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalHttpClient } from '../common/http-client';

export const USERS_CLIENT = Symbol('USERS_CLIENT');

export interface Recipient {
  id: string;
  email: string;
  fullName: string;
  active: boolean;
}

export interface UsersPort {
  findById(id: string): Promise<Recipient>;
  findByRoles(roles: string[]): Promise<Recipient[]>;
}

@Injectable()
export class HttpUsersClient implements UsersPort {
  private readonly http: InternalHttpClient;

  constructor(config: ConfigService) {
    this.http = new InternalHttpClient({
      baseUrl: config.get<string>('USERS_SERVICE_URL') ?? 'http://users:3001',
      internalApiKey: config.getOrThrow<string>('INTERNAL_API_KEY'),
      timeoutMs: Number(config.get('HTTP_TIMEOUT_MS') ?? 3000),
    });
  }

  findById(id: string): Promise<Recipient> {
    return this.http.request<Recipient>('GET', `/internal/users/${encodeURIComponent(id)}`);
  }

  findByRoles(roles: string[]): Promise<Recipient[]> {
    return this.http.request<Recipient[]>('GET', `/internal/users?roles=${encodeURIComponent(roles.join(','))}`);
  }
}
