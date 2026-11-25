import { canTransition, ReportStatus, requiresComment, TRANSITIONS } from './report.domain';

describe('máquina de estados del reporte', () => {
  it.each([
    [ReportStatus.PENDIENTE, ReportStatus.EN_REVISION],
    [ReportStatus.PENDIENTE, ReportStatus.RECHAZADO],
    [ReportStatus.EN_REVISION, ReportStatus.EN_PROCESO],
    [ReportStatus.EN_REVISION, ReportStatus.RECHAZADO],
    [ReportStatus.EN_PROCESO, ReportStatus.RESUELTO],
    [ReportStatus.EN_PROCESO, ReportStatus.EN_REVISION],
  ])('permite %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    [ReportStatus.PENDIENTE, ReportStatus.RESUELTO],
    [ReportStatus.PENDIENTE, ReportStatus.EN_PROCESO],
    [ReportStatus.EN_PROCESO, ReportStatus.RECHAZADO],
    [ReportStatus.RESUELTO, ReportStatus.PENDIENTE],
    [ReportStatus.RECHAZADO, ReportStatus.EN_REVISION],
  ])('rechaza %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it('los estados finales no tienen transiciones', () => {
    expect(TRANSITIONS[ReportStatus.RESUELTO]).toHaveLength(0);
    expect(TRANSITIONS[ReportStatus.RECHAZADO]).toHaveLength(0);
  });

  it('exige comentario para resolver o rechazar', () => {
    expect(requiresComment(ReportStatus.RESUELTO)).toBe(true);
    expect(requiresComment(ReportStatus.RECHAZADO)).toBe(true);
    expect(requiresComment(ReportStatus.EN_REVISION)).toBe(false);
  });
});
