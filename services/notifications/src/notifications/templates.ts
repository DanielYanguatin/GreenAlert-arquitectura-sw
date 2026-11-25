import { NotificationType } from './notification.entity';

/** Las plantillas viven solo en este servicio: cambiar un mensaje no afecta a ningún otro microservicio. */
export interface RenderedMessage {
  subject: string;
  body: string;
}

const STATUS_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  EN_REVISION: 'En revisión',
  EN_PROCESO: 'En proceso',
  RESUELTO: 'Resuelto',
  RECHAZADO: 'Rechazado',
};

const CATEGORY_LABELS: Record<string, string> = {
  BASURA: 'Basura y residuos sólidos',
  CONTAMINACION_HIDRICA: 'Contaminación hídrica',
  DEFORESTACION: 'Deforestación',
  HUMO_QUEMAS: 'Humo y quemas',
  VERTIMIENTOS: 'Vertimientos',
  MINERIA_ILEGAL: 'Minería ilegal',
  OTRO: 'Otra problemática',
};

/** Texto plano seguro: elimina etiquetas y caracteres de control de los datos recibidos. */
export function clean(value: unknown, max = 200): string {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return (
    raw
      .replace(/<[^>]*>/g, '')
      // eslint-disable-next-line no-control-regex -- se eliminan explícitamente caracteres de control
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .trim()
      .slice(0, max)
  );
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FOOTER = '\n\n— GreenAlert · Monitoreo ambiental ciudadano de Mocoa y Putumayo';

export function render(type: NotificationType, data: Record<string, unknown>): RenderedMessage {
  const title = clean(data.title, 120);
  const ref = clean(data.reportId, 36).slice(0, 8);
  switch (type) {
    case NotificationType.REGISTRO:
      return {
        subject: 'Bienvenido(a) a GreenAlert',
        body: `Hola ${clean(data.fullName, 120) || 'ciudadano(a)'}, tu cuenta fue creada. Ya puedes reportar problemas ambientales en tu municipio.${FOOTER}`,
      };
    case NotificationType.REPORTE_RECIBIDO:
      return {
        subject: `Recibimos tu reporte «${title}»`,
        body: `Tu reporte (ref. ${ref}) fue registrado con estado Pendiente. Te avisaremos cuando cambie su estado.${FOOTER}`,
      };
    case NotificationType.NUEVO_REPORTE:
      return {
        subject: `Nuevo reporte ambiental: ${CATEGORY_LABELS[clean(data.category)] ?? 'Sin categoría'}`,
        body: `Se registró el reporte «${title}» (ref. ${ref}) en ${clean(data.municipality, 80) || 'ubicación pendiente de validar'}. Revísalo en el panel institucional.${FOOTER}`,
      };
    case NotificationType.CAMBIO_ESTADO: {
      const to = STATUS_LABELS[clean(data.to)] ?? clean(data.to);
      const comment = clean(data.comment, 500);
      return {
        subject: `Tu reporte «${title}» ahora está: ${to}`,
        body: `El estado de tu reporte (ref. ${ref}) cambió de ${STATUS_LABELS[clean(data.from)] ?? clean(data.from)} a ${to}.${comment ? `\nComentario del funcionario: ${comment}` : ''}${FOOTER}`,
      };
    }
    case NotificationType.ASIGNACION:
      return {
        subject: `Se te asignó el reporte «${title}»`,
        body: `Eres responsable del reporte (ref. ${ref}) de categoría ${CATEGORY_LABELS[clean(data.category)] ?? 'sin categoría'}.${FOOTER}`,
      };
    case NotificationType.ALERTA:
      return {
        subject: `Alerta ambiental: ${clean(data.subject, 150) || 'aviso'}`,
        body: `${clean(data.message, 1000)}${FOOTER}`,
      };
  }
}
