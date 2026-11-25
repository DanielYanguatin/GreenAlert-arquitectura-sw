import { Logger } from '@nestjs/common';

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }

  /** true cuando el servicio remoto no respondió (caído, timeout, 5xx). */
  get unavailable(): boolean {
    return this.status === undefined || this.status >= 500;
  }
}

export interface HttpClientOptions {
  baseUrl: string;
  internalApiKey: string;
  timeoutMs: number;
}

/**
 * Cliente HTTP mínimo para comunicación entre servicios: timeout obligatorio, clave interna
 * y errores tipados. Usa fetch nativo de Node 22 (sin dependencias adicionales).
 */
export class InternalHttpClient {
  private readonly logger = new Logger(InternalHttpClient.name);

  constructor(private readonly options: HttpClientOptions) {}

  async request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    const url = `${this.options.baseUrl}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-internal-api-key': this.options.internalApiKey,
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      this.logger.warn(`${method} ${url} sin respuesta: ${reason}`);
      throw new UpstreamError(`Servicio no disponible: ${reason}`);
    }
    const text = await res.text();
    const parsed: unknown = text ? safeJson(text) : undefined;
    if (!res.ok) {
      throw new UpstreamError(`${method} ${path} respondió ${res.status}`, res.status, parsed);
    }
    return parsed as T;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
