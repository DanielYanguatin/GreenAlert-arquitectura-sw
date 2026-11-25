import { Injectable } from '@nestjs/common';
import {
  AI_CATEGORIES,
  type AiCategory,
  type ClassificationInput,
  type ClassifierOutput,
  type ImageClassifier,
  UNDETERMINED,
} from './classifier.port';

/**
 * SERVICIO FUNCIONAL DE PRUEBA — NO ES UN MODELO ENTRENADO.
 *
 * Asigna puntuaciones por coincidencia de palabras clave en el texto del reporte y en los nombres de
 * archivo de las evidencias. No analiza los píxeles de la imagen. Su único propósito es permitir que el
 * flujo extremo a extremo (reports → ai → sugerencia revisable) funcione mientras se integra un modelo
 * real de visión por computadora (ver docs/17-decisiones-arquitectonicas.md, ADR-008).
 *
 * La confianza se limita a MAX_CONFIDENCE para no transmitir una seguridad que el método no tiene.
 */
const KEYWORDS: Record<AiCategory, string[]> = {
  BASURA: ['basura', 'residuo', 'desecho', 'escombro', 'botadero', 'bolsa', 'plastico', 'reciclaje', 'relleno'],
  CONTAMINACION_HIDRICA: [
    'rio',
    'quebrada',
    'agua',
    'caño',
    'cano',
    'peces muertos',
    'espuma',
    'contaminacion hidrica',
    'humedal',
  ],
  DEFORESTACION: ['tala', 'arbol', 'deforest', 'motosierra', 'bosque', 'madera', 'potrero', 'desmonte'],
  HUMO_QUEMAS: ['humo', 'quema', 'incendio', 'fuego', 'ceniza', 'hollin', 'llamas'],
  VERTIMIENTOS: [
    'vertimiento',
    'alcantarill',
    'aguas negras',
    'aguas residuales',
    'descarga',
    'tuberia',
    'aceite',
    'lixiviado',
  ],
  MINERIA_ILEGAL: ['mineria', 'minero', 'draga', 'mercurio', 'oro', 'retroexcavadora', 'socavon', 'balsa'],
};

const MAX_CONFIDENCE = 0.6;

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ');
}

/** Coincidencia al inicio de palabra (evita falsos positivos como "oro" dentro de "deterioro"). */
function matches(corpus: string, keyword: string): boolean {
  return ` ${corpus}`.includes(` ${normalize(keyword).trim()}`);
}

@Injectable()
export class HeuristicKeywordClassifier implements ImageClassifier {
  static readonly PROVIDER = 'heuristic-keywords';
  static readonly VERSION = 'v0-prueba-no-entrenado';

  classify(input: ClassificationInput): Promise<ClassifierOutput> {
    const corpus = normalize([input.text, ...input.evidences.map((e) => e.originalName)].join(' '));
    const raw: Record<AiCategory, number> = Object.fromEntries(
      AI_CATEGORIES.map((c) => [c, KEYWORDS[c].reduce((n, k) => n + (matches(corpus, k) ? 1 : 0), 0)]),
    ) as Record<AiCategory, number>;

    const total = Object.values(raw).reduce((a, b) => a + b, 0);
    const scores: Partial<Record<AiCategory, number>> = {};
    for (const c of AI_CATEGORIES) {
      scores[c] = total === 0 ? 0 : Number(((raw[c] / total) * MAX_CONFIDENCE).toFixed(3));
    }
    const ranked = [...AI_CATEGORIES].sort((a, b) => raw[b] - raw[a]);
    const top = ranked[0];
    const tie = total > 0 && raw[ranked[1]] === raw[top];

    return Promise.resolve({
      suggestedCategory: total === 0 || tie ? UNDETERMINED : top,
      confidence: total === 0 || tie ? 0 : (scores[top] ?? 0),
      scores,
      provider: HeuristicKeywordClassifier.PROVIDER,
      modelVersion: HeuristicKeywordClassifier.VERSION,
    });
  }
}
