/**
 * Puerto de clasificación (patrón Strategy / Ports & Adapters). El dominio del servicio no conoce
 * el proveedor concreto: hoy un heurístico de prueba, mañana un modelo de visión por computadora.
 */
export const IMAGE_CLASSIFIER = Symbol('IMAGE_CLASSIFIER');

export const AI_CATEGORIES = [
  'BASURA',
  'CONTAMINACION_HIDRICA',
  'DEFORESTACION',
  'HUMO_QUEMAS',
  'VERTIMIENTOS',
  'MINERIA_ILEGAL',
] as const;

export type AiCategory = (typeof AI_CATEGORIES)[number];

/** Resultado cuando ninguna categoría alcanza evidencia suficiente. */
export const UNDETERMINED = 'SIN_DETERMINAR';

export const CATEGORY_LABELS: Record<AiCategory, string> = {
  BASURA: 'Basura y residuos sólidos',
  CONTAMINACION_HIDRICA: 'Contaminación hídrica',
  DEFORESTACION: 'Deforestación',
  HUMO_QUEMAS: 'Humo y quemas',
  VERTIMIENTOS: 'Vertimientos',
  MINERIA_ILEGAL: 'Minería ilegal',
};

export interface EvidenceInput {
  id: string;
  url: string;
  mimeType: string;
  originalName: string;
}

export interface ClassificationInput {
  reportId: string;
  text: string;
  evidences: EvidenceInput[];
}

export interface ClassifierOutput {
  suggestedCategory: AiCategory | typeof UNDETERMINED;
  /** Valor en [0, 1]. No es una precisión medida del modelo, sino la puntuación relativa de esta predicción. */
  confidence: number;
  scores: Partial<Record<AiCategory, number>>;
  provider: string;
  modelVersion: string;
}

export interface ImageClassifier {
  classify(input: ClassificationInput): Promise<ClassifierOutput>;
}
