import { categoryColor, categoryLabel, formatDate, isStaff, statusLabel, statusTone } from './labels';

describe('etiquetas de dominio', () => {
  it('traduce categorías y estados', () => {
    expect(categoryLabel('HUMO_QUEMAS')).toBe('Humo y quemas');
    expect(categoryLabel('SIN_DETERMINAR')).toBe('Sin determinar');
    expect(categoryLabel('NUEVA')).toBe('NUEVA');
    expect(statusLabel('EN_REVISION')).toBe('En revisión');
    expect(statusTone('RECHAZADO')).toBe('danger');
    expect(statusTone('X')).toBe('neutral');
    expect(categoryColor('X')).toBe('#546e7a');
  });

  it('identifica roles institucionales', () => {
    expect(isStaff('FUNCIONARIO')).toBe(true);
    expect(isStaff('CIUDADANO')).toBe(false);
    expect(isStaff(undefined)).toBe(false);
  });

  it('formatea fechas en hora de Colombia', () => {
    expect(formatDate('2026-11-24T17:00:00Z')).toMatch(/2026/);
  });
});
