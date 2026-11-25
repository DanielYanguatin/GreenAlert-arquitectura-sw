import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UpstreamError } from '../common/http-client';
import {
  AI_CATEGORIES,
  type AiCategory,
  type ClassificationInput,
  type ClassifierOutput,
  type ImageClassifier,
  UNDETERMINED,
} from './classifier.port';

interface ModelResponse {
  category: string;
  confidence: number;
  scores?: Record<string, number>;
  modelVersion?: string;
}

/**
 * Adaptador para un modelo de visión por computadora externo (p. ej. un servicio Python con un
 * modelo entrenado y evaluado con imágenes del Putumayo). Contrato esperado, documentado en ADR-008:
 *
 *   POST {AI_MODEL_URL}  { text, images: [{ mimeType, base64 }] }
 *   → 200 { category, confidence, scores?, modelVersion? }
 *
 * Las imágenes se obtienen de multimedia con la clave interna; el modelo no necesita acceso a la red interna.
 * IMPORTANTE: no existe todavía un modelo conectado; este adaptador solo se activa con AI_PROVIDER=http.
 */
@Injectable()
export class HttpVisionClassifier implements ImageClassifier {
  private readonly logger = new Logger(HttpVisionClassifier.name);
  private readonly modelUrl: string;
  private readonly internalKey: string;
  private readonly timeoutMs: number;
  private readonly maxImages: number;

  constructor(config: ConfigService) {
    this.modelUrl = config.get<string>('AI_MODEL_URL') ?? '';
    this.internalKey = config.getOrThrow<string>('INTERNAL_API_KEY');
    this.timeoutMs = Number(config.get('AI_MODEL_TIMEOUT_MS') ?? 10000);
    this.maxImages = Number(config.get('AI_MAX_IMAGES') ?? 3);
  }

  async classify(input: ClassificationInput): Promise<ClassifierOutput> {
    if (!this.modelUrl) throw new UpstreamError('AI_MODEL_URL no está configurado');
    const images = await Promise.all(
      input.evidences.slice(0, this.maxImages).map((e) => this.fetchImage(e.url, e.mimeType)),
    );

    let res: Response;
    try {
      res = await fetch(this.modelUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: input.text, images }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new UpstreamError(`Modelo no disponible: ${(e as Error).message}`);
    }
    if (!res.ok) throw new UpstreamError(`El modelo respondió ${res.status}`, res.status);
    const body = (await res.json()) as ModelResponse;
    return this.toOutput(body);
  }

  private async fetchImage(url: string, mimeType: string): Promise<{ mimeType: string; base64: string }> {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'x-internal-api-key': this.internalKey },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new UpstreamError(`No se pudo obtener la evidencia: ${(e as Error).message}`);
    }
    if (!res.ok) throw new UpstreamError(`multimedia respondió ${res.status}`, res.status);
    return { mimeType, base64: Buffer.from(await res.arrayBuffer()).toString('base64') };
  }

  /** Valida la respuesta del modelo: nunca se confía en datos externos sin verificar. */
  private toOutput(body: ModelResponse): ClassifierOutput {
    const known = (AI_CATEGORIES as readonly string[]).includes(body.category);
    const confidence = Number(body.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      this.logger.warn(`Confianza inválida recibida del modelo: ${String(body.confidence)}`);
      throw new UpstreamError('Respuesta del modelo inválida', 502);
    }
    const scores: Partial<Record<AiCategory, number>> = {};
    for (const [k, v] of Object.entries(body.scores ?? {})) {
      if ((AI_CATEGORIES as readonly string[]).includes(k) && Number.isFinite(v)) scores[k as AiCategory] = v;
    }
    return {
      suggestedCategory: known ? (body.category as AiCategory) : UNDETERMINED,
      confidence: known ? confidence : 0,
      scores,
      provider: 'http-vision',
      modelVersion: (body.modelVersion ?? 'desconocida').slice(0, 60),
    };
  }
}
