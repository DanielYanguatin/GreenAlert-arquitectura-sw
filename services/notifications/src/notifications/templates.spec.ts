import { NotificationType } from './notification.entity';
import { clean, escapeHtml, render } from './templates';

describe('plantillas de notificación', () => {
  it.each(Object.values(NotificationType))('genera asunto y cuerpo para %s', (type) => {
    const msg = render(type, {
      title: 'Basura en el río',
      reportId: 'abcdef12-0000',
      from: 'PENDIENTE',
      to: 'EN_REVISION',
    });
    expect(msg.subject.length).toBeGreaterThan(5);
    expect(msg.body).toContain('GreenAlert');
  });

  it('traduce estados y categorías a etiquetas legibles', () => {
    const msg = render(NotificationType.CAMBIO_ESTADO, {
      title: 'X',
      reportId: '12345678-aaaa',
      from: 'EN_PROCESO',
      to: 'RESUELTO',
      comment: 'Se retiró el material',
    });
    expect(msg.subject).toContain('Resuelto');
    expect(msg.body).toContain('En proceso a Resuelto');
    expect(msg.body).toContain('Se retiró el material');
    expect(msg.body).toContain('ref. 12345678');
  });

  it('elimina HTML y caracteres de control de los datos (evita inyección en correos)', () => {
    const msg = render(NotificationType.NUEVO_REPORTE, {
      title: '<script>alert(1)</script>Quema',
      category: 'HUMO_QUEMAS',
    });
    expect(msg.body).not.toContain('<script>');
    expect(msg.subject).toBe('Nuevo reporte ambiental: Humo y quemas');
    expect(clean('a\u0007b\u0000c')).toBe('abc');
    expect(clean({ toString: () => 'x' })).toBe('');
    expect(clean('x'.repeat(500), 10)).toHaveLength(10);
  });

  it('escapa HTML para la versión HTML del correo', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});
