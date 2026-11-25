import { createServer, type IncomingMessage, type Server } from 'node:http';

export interface StubCall {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: unknown;
}

export type StubHandler = (call: StubCall) => { status: number; body?: unknown; delayMs?: number };

/**
 * Servidor HTTP que simula a los microservicios vecinos. Las respuestas se configuran por
 * "MÉTODO /prefijo"; una ruta sin configurar responde 503 (servicio no disponible).
 */
function parse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw; // cuerpos no JSON (p. ej. multipart) se conservan como texto
  }
}

export class StubServer {
  readonly calls: StubCall[] = [];
  private readonly routes = new Map<string, StubHandler>();
  private server?: Server;

  on(route: string, handler: StubHandler | { status: number; body?: unknown; delayMs?: number }): this {
    this.routes.set(route, typeof handler === 'function' ? handler : () => handler);
    return this;
  }

  off(route: string): this {
    this.routes.delete(route);
    return this;
  }

  callsTo(prefix: string): StubCall[] {
    return this.calls.filter((c) => `${c.method} ${c.url}`.startsWith(prefix));
  }

  async start(port: number): Promise<void> {
    this.server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      req.on('end', () => {
        const call: StubCall = {
          method: req.method ?? 'GET',
          url: req.url ?? '/',
          headers: req.headers,
          body: raw ? parse(raw) : undefined,
        };
        this.calls.push(call);
        const key = [...this.routes.keys()]
          .filter((k) => `${call.method} ${call.url}`.startsWith(k))
          .sort((a, b) => b.length - a.length)[0];
        const result = key ? this.routes.get(key)!(call) : { status: 503, body: { message: 'stub: no disponible' } };
        const reply = () => {
          res.statusCode = result.status;
          res.setHeader('content-type', 'application/json');
          res.end(result.body === undefined ? '' : JSON.stringify(result.body));
        };
        if (result.delayMs) setTimeout(reply, result.delayMs);
        else reply();
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(port, '127.0.0.1', resolve));
  }

  stop(): Promise<void> {
    this.server?.closeAllConnections();
    return new Promise((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
  }
}
