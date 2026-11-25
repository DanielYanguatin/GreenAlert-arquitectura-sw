/**
 * Reglas de dominio puras (sin dependencias de infraestructura) para facilitar pruebas y modificabilidad.
 */
export enum ReportStatus {
  PENDIENTE = 'PENDIENTE',
  EN_REVISION = 'EN_REVISION',
  EN_PROCESO = 'EN_PROCESO',
  RESUELTO = 'RESUELTO',
  RECHAZADO = 'RECHAZADO',
}

/**
 * Categorías ambientales. Se almacenan como VARCHAR (no ENUM de MySQL) para que agregar una categoría
 * no requiera migración (ver SAAM S-01).
 */
export enum ReportCategory {
  BASURA = 'BASURA',
  CONTAMINACION_HIDRICA = 'CONTAMINACION_HIDRICA',
  DEFORESTACION = 'DEFORESTACION',
  HUMO_QUEMAS = 'HUMO_QUEMAS',
  VERTIMIENTOS = 'VERTIMIENTOS',
  MINERIA_ILEGAL = 'MINERIA_ILEGAL',
  OTRO = 'OTRO',
}

export enum LocationStatus {
  VALIDATED = 'VALIDATED',
  PENDING = 'PENDING',
  OUT_OF_COVERAGE = 'OUT_OF_COVERAGE',
}

export enum AiStatus {
  NOT_REQUESTED = 'NOT_REQUESTED',
  COMPLETED = 'COMPLETED',
  UNAVAILABLE = 'UNAVAILABLE',
}

/** Máquina de estados del reporte. Los estados finales no tienen transiciones. */
export const TRANSITIONS: Readonly<Record<ReportStatus, readonly ReportStatus[]>> = {
  [ReportStatus.PENDIENTE]: [ReportStatus.EN_REVISION, ReportStatus.RECHAZADO],
  [ReportStatus.EN_REVISION]: [ReportStatus.EN_PROCESO, ReportStatus.RECHAZADO],
  [ReportStatus.EN_PROCESO]: [ReportStatus.RESUELTO, ReportStatus.EN_REVISION],
  [ReportStatus.RESUELTO]: [],
  [ReportStatus.RECHAZADO]: [],
};

export function canTransition(from: ReportStatus, to: ReportStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Un rechazo o resolución debe justificarse ante el ciudadano. */
export function requiresComment(to: ReportStatus): boolean {
  return to === ReportStatus.RECHAZADO || to === ReportStatus.RESUELTO;
}

export enum HistoryAction {
  CREATED = 'CREATED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  ASSIGNED = 'ASSIGNED',
  UPDATED = 'UPDATED',
  CATEGORY_CHANGED = 'CATEGORY_CHANGED',
  AI_SUGGESTION = 'AI_SUGGESTION',
  LOCATION_UPDATED = 'LOCATION_UPDATED',
}
